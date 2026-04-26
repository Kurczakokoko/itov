"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import useSWR from "swr"
import type { PublicRoomState } from "./server-store"
import type { PlayerId, Selections } from "./types"

// ---------- Persistent client identity & membership ----------

const STORAGE_KEY = "itov:membership:v3"

interface Membership {
  clientId: string
  roomCode: string | null
  role: PlayerId | null
}

function randomId(): string {
  return (
    "c_" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  )
}

function loadMembership(): Membership {
  if (typeof window === "undefined") {
    return { clientId: "", roomCode: null, role: null }
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Membership>
      if (parsed.clientId) {
        return {
          clientId: parsed.clientId,
          roomCode: parsed.roomCode ?? null,
          role: (parsed.role as PlayerId) ?? null,
        }
      }
    }
  } catch {
    // ignore
  }
  const fresh: Membership = {
    clientId: randomId(),
    roomCode: null,
    role: null,
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  } catch {
    // ignore
  }
  return fresh
}

function saveMembership(m: Membership) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch {
    // ignore
  }
}

// ---------- Local UI state ----------

export type LocalView =
  | "landing"
  | "host-lobby"
  | "join-lobby"
  | "board"
  | "round"
  | "match-end"

/**
 * Connection status. We deliberately do NOT auto-yank the user back to the
 * landing screen on a 404; instead we surface this via an inline overlay so
 * the user gets a clear reason and a deliberate way to recover.
 */
export type ConnectionStatus =
  | "ok" // last poll succeeded (or we're not in a room)
  | "lost" // last poll 404'd while we held a roomCode
  | "ended" // server reports the match was formally ended

export interface LocalUIState {
  view: LocalView
  roomCode: string | null
  role: PlayerId | null
  lastError: string | null
}

const defaultLocal: LocalUIState = {
  view: "landing",
  roomCode: null,
  role: null,
  lastError: null,
}

// ---------- Fetch helpers ----------

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    const err = new Error(
      data?.error ?? `HTTP ${res.status}`,
    ) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

async function postAction<T = unknown>(body: object): Promise<T> {
  const res = await fetch("/api/itov/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || (data && data.error)) {
    throw new Error(
      typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
    )
  }
  return data as T
}

// ---------- Context ----------

interface GameContextValue {
  local: LocalUIState
  remote: PublicRoomState | null
  clientId: string
  connection: ConnectionStatus

  // Navigation
  goLanding: () => void
  goJoin: () => void
  /** Acknowledge a lost/ended connection and return to landing cleanly. */
  dismissConnectionIssue: () => void

  // Lobby actions
  host: () => Promise<void>
  join: (code: string) => Promise<void>
  start: () => Promise<void>
  /** Formally end the match (host or joiner). */
  endMatch: () => Promise<void>

  // In-match
  submit: (selections: Selections) => Promise<void>
  ackResolution: () => Promise<void>
  continueFromRound: () => Promise<void>
  rematch: () => Promise<void>

  setError: (msg: string | null) => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [clientId, setClientId] = useState<string>("")
  const [local, setLocal] = useState<LocalUIState>(defaultLocal)
  const localRef = useRef(local)
  localRef.current = local
  const clientIdRef = useRef(clientId)
  clientIdRef.current = clientId

  // Hydrate from sessionStorage on first client paint.
  useEffect(() => {
    const m = loadMembership()
    setClientId(m.clientId)
    setLocal((p) => ({
      ...p,
      roomCode: m.roomCode ?? p.roomCode,
      role: m.role ?? p.role,
      view:
        m.roomCode && m.role
          ? m.role === "A"
            ? "host-lobby"
            : "join-lobby"
          : p.view,
    }))
    setHydrated(true)
  }, [])

  // Persist membership ONLY when we have a real room. Never persist nulls
  // — that would erase a valid prior session if state momentarily clears.
  useEffect(() => {
    if (!hydrated || !clientId) return
    if (local.roomCode && local.role) {
      saveMembership({
        clientId,
        roomCode: local.roomCode,
        role: local.role,
      })
    }
  }, [hydrated, clientId, local.roomCode, local.role])

  const swrKey =
    hydrated && local.roomCode && clientId
      ? `/api/itov/state?code=${encodeURIComponent(
          local.roomCode,
        )}&clientId=${encodeURIComponent(clientId)}`
      : null

  const { data: remote, error: swrError, mutate } = useSWR<PublicRoomState>(
    swrKey,
    fetcher,
    {
      refreshInterval: 500,
      dedupingInterval: 100,
      revalidateOnFocus: true,
      keepPreviousData: true,
      shouldRetryOnError: true,
      errorRetryInterval: 1000,
    },
  )

  // Derive connection status from the latest poll. We are deliberate:
  // - "ok": data is present and not ended
  // - "ended": data is present and server says the match was ended
  // - "lost": no data and we hit a 404 while holding a roomCode
  const connection: ConnectionStatus = useMemo(() => {
    if (!local.roomCode) return "ok"
    if (remote?.ended) return "ended"
    const status = (swrError as Error & { status?: number } | undefined)
      ?.status
    if (status === 404) return "lost"
    return "ok"
  }, [local.roomCode, remote, swrError])

  // Map server phase -> local view. Only reacts when we have fresh data;
  // never wipes local state on transient errors.
  useEffect(() => {
    if (!remote) return
    setLocal((prev) => {
      let next = prev
      if (remote.role && prev.role !== remote.role) {
        next = { ...next, role: remote.role }
      }
      // If the server says the match has ended, we keep the user where
      // they are and let the overlay drive the recovery.
      if (remote.ended) return next
      switch (remote.phase) {
        case "lobby":
          if (next.view !== "host-lobby" && next.view !== "join-lobby") {
            next = {
              ...next,
              view: next.role === "B" ? "join-lobby" : "host-lobby",
            }
          }
          break
        case "selecting":
        case "revealing":
          if (next.view !== "board") next = { ...next, view: "board" }
          break
        case "round-end":
          if (next.view !== "round") next = { ...next, view: "round" }
          break
        case "match-end":
          if (next.view !== "match-end") next = { ...next, view: "match-end" }
          break
      }
      return next
    })
  }, [remote])

  const setError = useCallback((msg: string | null) => {
    setLocal((p) => ({ ...p, lastError: msg }))
  }, [])

  const wipeMembership = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        const m = loadMembership()
        saveMembership({
          clientId: m.clientId,
          roomCode: null,
          role: null,
        })
      } catch {
        // ignore
      }
    }
  }, [])

  const goLanding = useCallback(() => {
    wipeMembership()
    setLocal({ ...defaultLocal })
  }, [wipeMembership])

  const goJoin = useCallback(() => {
    wipeMembership()
    setLocal({ ...defaultLocal, view: "join-lobby" })
  }, [wipeMembership])

  const dismissConnectionIssue = useCallback(() => {
    wipeMembership()
    setLocal({ ...defaultLocal })
  }, [wipeMembership])

  const host = useCallback(async () => {
    try {
      const id = clientIdRef.current || randomId()
      if (!clientIdRef.current) {
        setClientId(id)
        clientIdRef.current = id
      }
      const data = await postAction<{ code: string }>({
        action: "host",
        clientId: id,
      })
      setLocal((p) => ({
        ...p,
        view: "host-lobby",
        roomCode: data.code,
        role: "A",
        lastError: null,
      }))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [setError])

  const join = useCallback(
    async (code: string) => {
      try {
        const id = clientIdRef.current || randomId()
        if (!clientIdRef.current) {
          setClientId(id)
          clientIdRef.current = id
        }
        const data = await postAction<{ code: string; role: PlayerId }>({
          action: "join",
          clientId: id,
          code: code.toUpperCase(),
        })
        setLocal((p) => ({
          ...p,
          view: "join-lobby",
          roomCode: data.code,
          role: data.role ?? "B",
          lastError: null,
        }))
        void mutate()
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [mutate, setError],
  )

  const start = useCallback(async () => {
    if (!localRef.current.roomCode) return
    try {
      await postAction({
        action: "start",
        clientId: clientIdRef.current,
        code: localRef.current.roomCode,
      })
      void mutate()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [mutate, setError])

  const endMatch = useCallback(async () => {
    const code = localRef.current.roomCode
    const id = clientIdRef.current
    if (code && id) {
      try {
        await postAction({ action: "leave", clientId: id, code })
      } catch {
        // best-effort
      }
    }
  }, [])

  const submit = useCallback(
    async (selections: Selections) => {
      if (!localRef.current.roomCode) return
      try {
        await postAction({
          action: "submit",
          clientId: clientIdRef.current,
          code: localRef.current.roomCode,
          selections,
        })
        void mutate()
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [mutate, setError],
  )

  const ackResolutionAction = useCallback(async () => {
    if (!localRef.current.roomCode) return
    try {
      await postAction({
        action: "ack",
        clientId: clientIdRef.current,
        code: localRef.current.roomCode,
      })
      void mutate()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [mutate, setError])

  const continueFromRoundAction = useCallback(async () => {
    if (!localRef.current.roomCode) return
    try {
      await postAction({
        action: "continue",
        clientId: clientIdRef.current,
        code: localRef.current.roomCode,
      })
      void mutate()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [mutate, setError])

  const rematchAction = useCallback(async () => {
    if (!localRef.current.roomCode) return
    try {
      await postAction({
        action: "rematch",
        clientId: clientIdRef.current,
        code: localRef.current.roomCode,
      })
      setLocal((p) => ({ ...p, view: "host-lobby" }))
      void mutate()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [mutate, setError])

  const value = useMemo<GameContextValue>(
    () => ({
      local,
      remote: remote ?? null,
      clientId,
      connection,
      goLanding,
      goJoin,
      dismissConnectionIssue,
      host,
      join,
      start,
      endMatch,
      submit,
      ackResolution: ackResolutionAction,
      continueFromRound: continueFromRoundAction,
      rematch: rematchAction,
      setError,
    }),
    [
      local,
      remote,
      clientId,
      connection,
      goLanding,
      goJoin,
      dismissConnectionIssue,
      host,
      join,
      start,
      endMatch,
      submit,
      ackResolutionAction,
      continueFromRoundAction,
      rematchAction,
      setError,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error("useGame must be used within a GameProvider")
  return ctx
}
