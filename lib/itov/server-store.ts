// Server-side authoritative state for ITOV matches.
//
// Room state lives in Upstash Redis (see ./redis.ts). Each room is stored
// as a single JSON value keyed by code; mutations are serialized via a
// per-room distributed lock so that simultaneous submits / acks from both
// players resolve correctly.
//
// IMPORTANT design property: `leaveRoom` does NOT immediately drop the room.
// It marks `endedAt` so clients can show a graceful "match ended" overlay
// for a short grace window. After the window, the room's TTL lapses or it
// is treated as not-found.

import {
  isRoundOver,
  makeStartingPieces,
  resolveExchange,
} from "./engine"
import { MATCH_TARGET, SELECTION_TIMER_SECONDS } from "./constants"
import {
  hostIndexKey,
  readRoom,
  redis,
  ROOM_TTL_SECONDS,
  withRoomLock,
  writeRoom,
} from "./redis"
import type {
  ExchangeResult,
  Piece,
  PlayerId,
  Selections,
} from "./types"

// ---------- Types ----------

export type RoomPhase =
  | "lobby" // waiting for joiner; both auto-ready
  | "selecting" // both players assigning moves
  | "revealing" // both submitted, animating resolution
  | "round-end" // round screen
  | "match-end" // round screen w/ rematch

export interface Room {
  code: string

  // Players
  hostClientId: string
  joinerClientId: string | null
  joinerReady: boolean

  // Match state
  phase: RoomPhase
  round: number
  scoreA: number
  scoreB: number
  pieces: Piece[]

  // Per-exchange selections (null = not yet committed)
  selectionsA: Selections | null
  selectionsB: Selections | null

  // Resolution carried while phase === "revealing"
  pendingResolution: ExchangeResult | null
  /** Stable id for the current pendingResolution. Increments each new resolve. */
  revealId: number

  // Acknowledgements
  ackA: boolean
  ackB: boolean

  // Round/match outcome cached for round screen
  lastRoundWinner: PlayerId | null
  matchWinner: PlayerId | null

  // Selection timer
  selectingStartedAt: number | null

  // Lifecycle
  createdAt: number
  updatedAt: number
  /** Set when a player formally ended the match. Triggers a graceful overlay. */
  endedAt: number | null
  /** Which client ended the match. */
  endedBy: PlayerId | null
  /** Bumped every time the room mutates so clients can detect changes. */
  version: number
}

// ---------- Constants ----------

const ENDED_GRACE_MS = 30 * 1000 // 30s after ended -> treat as gone

// ---------- Helpers ----------

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

async function generateRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    let s = ""
    for (let i = 0; i < 5; i++) {
      s += ROOM_CODE_ALPHABET[
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
      ]
    }
    const exists = await readRoom(s)
    if (!exists) return s
  }
  // Fallback to a longer code; collision odds are astronomical.
  let s = ""
  for (let i = 0; i < 6; i++) {
    s += ROOM_CODE_ALPHABET[
      Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
    ]
  }
  return s
}

function norm(code: string): string {
  return code.trim().toUpperCase()
}

function touch(room: Room): Room {
  room.updatedAt = Date.now()
  room.version += 1
  return room
}

function freshMatchState(): Pick<
  Room,
  | "phase"
  | "round"
  | "scoreA"
  | "scoreB"
  | "pieces"
  | "selectionsA"
  | "selectionsB"
  | "pendingResolution"
  | "revealId"
  | "ackA"
  | "ackB"
  | "lastRoundWinner"
  | "matchWinner"
  | "selectingStartedAt"
> {
  return {
    phase: "lobby",
    round: 1,
    scoreA: 0,
    scoreB: 0,
    pieces: makeStartingPieces(),
    selectionsA: null,
    selectionsB: null,
    pendingResolution: null,
    revealId: 0,
    ackA: false,
    ackB: false,
    lastRoundWinner: null,
    matchWinner: null,
    selectingStartedAt: null,
  }
}

function roleOf(room: Room, clientId: string): PlayerId | null {
  if (clientId === room.hostClientId) return "A"
  if (clientId === room.joinerClientId) return "B"
  return null
}

/**
 * Treat a room as gone if its end-grace window has elapsed. Callers that
 * receive `null` from here should respond with a 404 / "room not found",
 * mirroring the previous in-memory behavior.
 */
function isExpired(room: Room): boolean {
  return !!room.endedAt && Date.now() - room.endedAt > ENDED_GRACE_MS
}

// ---------- Public API: actions ----------

export async function createRoom(hostClientId: string): Promise<Room> {
  // If this client recently hosted, return the existing active room
  // instead of creating a duplicate. This prevents stray double-host
  // clicks from orphaning rooms.
  const existingCode = (await redis.get(hostIndexKey(hostClientId))) as
    | string
    | null
  if (existingCode) {
    const existing = await readRoom(existingCode)
    if (existing && !existing.endedAt) {
      console.log("[v0][itov] createRoom: reusing existing room", {
        code: existing.code,
      })
      // Refresh timestamps so the room's TTL extends.
      const refreshed = touch(existing)
      await writeRoom(refreshed)
      return refreshed
    }
  }

  const code = await generateRoomCode()
  const now = Date.now()
  const room: Room = {
    code,
    hostClientId,
    joinerClientId: null,
    joinerReady: false,
    ...freshMatchState(),
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    endedBy: null,
    version: 1,
  }
  await writeRoom(room)
  await redis.set(hostIndexKey(hostClientId), code, {
    ex: ROOM_TTL_SECONDS,
  })
  console.log("[v0][itov] createRoom", { code, hostClientId })
  return room
}

export async function joinRoom(
  code: string,
  joinerClientId: string,
): Promise<
  { ok: true; room: Room; role: PlayerId } | { ok: false; error: string }
> {
  return withRoomLock(norm(code), (room) => {
    if (!room || isExpired(room)) {
      console.log("[v0][itov] joinRoom: room not found", { code: norm(code) })
      return { value: { ok: false, error: "Room not found" } as const }
    }
    if (room.endedAt) {
      return { value: { ok: false, error: "Match has ended" } as const }
    }
    // Same client rejoining (e.g., reload) is always allowed.
    if (room.joinerClientId === joinerClientId) {
      room.joinerReady = true
      return {
        value: { ok: true, room, role: "B" } as const,
        save: touch(room),
      }
    }
    if (room.hostClientId === joinerClientId) {
      return {
        value: {
          ok: false,
          error: "You're hosting this room — open a second tab to join",
        } as const,
      }
    }
    if (room.phase !== "lobby") {
      return {
        value: { ok: false, error: "Match already in progress" } as const,
      }
    }
    if (room.joinerClientId && room.joinerClientId !== joinerClientId) {
      return { value: { ok: false, error: "Room is full" } as const }
    }
    room.joinerClientId = joinerClientId
    room.joinerReady = true // auto-ready on join
    console.log("[v0][itov] joinRoom (auto-ready)", {
      code: room.code,
      joinerClientId,
    })
    return {
      value: { ok: true, room, role: "B" } as const,
      save: touch(room),
    }
  })
}

/**
 * Mark the room as ended (NOT destroyed). Both clients will keep being able
 * to read state for ENDED_GRACE_MS so they can render a graceful overlay.
 */
export async function leaveRoom(
  code: string,
  clientId: string,
): Promise<void> {
  await withRoomLock(norm(code), (room) => {
    if (!room) return { value: undefined }
    const role = roleOf(room, clientId)
    if (!role) return { value: undefined }
    if (room.endedAt) return { value: undefined } // already ended
    room.endedAt = Date.now()
    room.endedBy = role
    console.log("[v0][itov] leaveRoom -> ended", {
      code: room.code,
      by: role,
    })
    return { value: undefined, save: touch(room) }
  })
}

/** Legacy ready endpoint — auto-ready makes this a no-op success. */
export async function setJoinerReady(
  code: string,
  clientId: string,
): Promise<Room | null> {
  return withRoomLock(norm(code), (room) => {
    if (!room || room.endedAt) return { value: null }
    if (clientId !== room.joinerClientId) return { value: null }
    room.joinerReady = true
    const next = touch(room)
    return { value: next, save: next }
  })
}

export async function startMatch(
  code: string,
  clientId: string,
): Promise<{ ok: true; room: Room } | { ok: false; error: string }> {
  return withRoomLock(norm(code), (room) => {
    if (!room || isExpired(room)) {
      return { value: { ok: false, error: "Room not found" } as const }
    }
    if (room.endedAt) {
      return { value: { ok: false, error: "Match has ended" } as const }
    }
    if (clientId !== room.hostClientId) {
      return { value: { ok: false, error: "Only host can start" } as const }
    }
    if (!room.joinerClientId) {
      return { value: { ok: false, error: "Waiting for opponent" } as const }
    }
    if (room.phase !== "lobby") {
      // Idempotent: already started, just return current state.
      return { value: { ok: true, room } as const }
    }
    Object.assign(room, freshMatchState())
    room.phase = "selecting"
    room.selectingStartedAt = Date.now()
    const next = touch(room)
    console.log("[v0][itov] startMatch", { code: room.code })
    return { value: { ok: true, room: next } as const, save: next }
  })
}

export async function submitSelections(
  code: string,
  clientId: string,
  selections: Selections,
): Promise<
  { ok: true; room: Room } | { ok: false; error: string }
> {
  return withRoomLock(norm(code), (room) => {
    if (!room || isExpired(room)) {
      return { value: { ok: false, error: "Room not found" } as const }
    }
    if (room.endedAt) {
      return { value: { ok: false, error: "Match has ended" } as const }
    }
    const role = roleOf(room, clientId)
    if (!role) {
      return {
        value: { ok: false, error: "Not a player in this room" } as const,
      }
    }
    if (room.phase !== "selecting") {
      // Late submit is a no-op success.
      return { value: { ok: true, room } as const }
    }
    if (role === "A") room.selectionsA = selections
    else room.selectionsB = selections
    maybeResolve(room)
    const next = touch(room)
    return { value: { ok: true, room: next } as const, save: next }
  })
}

export async function ackResolution(
  code: string,
  clientId: string,
): Promise<Room | null> {
  return withRoomLock(norm(code), (room) => {
    if (!room || room.endedAt) return { value: null }
    const role = roleOf(room, clientId)
    if (!role) return { value: null }
    if (room.phase !== "revealing") return { value: room }
    if (role === "A") room.ackA = true
    else room.ackB = true
    if (room.ackA && room.ackB) advanceFromReveal(room)
    const next = touch(room)
    return { value: next, save: next }
  })
}

export async function continueFromRound(
  code: string,
  clientId: string,
): Promise<Room | null> {
  return withRoomLock(norm(code), (room) => {
    if (!room || room.endedAt) return { value: null }
    const role = roleOf(room, clientId)
    if (!role) return { value: null }
    if (room.phase !== "round-end") return { value: room }
    if (role === "A") room.ackA = true
    else room.ackB = true
    if (room.ackA && room.ackB) {
      room.pieces = makeStartingPieces()
      room.round += 1
      room.selectionsA = null
      room.selectionsB = null
      room.pendingResolution = null
      room.ackA = false
      room.ackB = false
      room.lastRoundWinner = null
      room.phase = "selecting"
      room.selectingStartedAt = Date.now()
    }
    const next = touch(room)
    return { value: next, save: next }
  })
}

export async function rematch(
  code: string,
  clientId: string,
): Promise<Room | null> {
  return withRoomLock(norm(code), (room) => {
    if (!room || room.endedAt) return { value: null }
    if (clientId !== room.hostClientId) return { value: null }
    if (room.phase !== "match-end") return { value: null }
    Object.assign(room, freshMatchState())
    if (room.joinerClientId) room.joinerReady = true
    const next = touch(room)
    return { value: next, save: next }
  })
}

/** Selection timer tick — pure check + mutation. Only call under lock. */
function tickRoom(room: Room): boolean {
  if (
    room.phase === "selecting" &&
    room.selectingStartedAt &&
    Date.now() - room.selectingStartedAt >= SELECTION_TIMER_SECONDS * 1000
  ) {
    if (!room.selectionsA) room.selectionsA = {}
    if (!room.selectionsB) room.selectionsB = {}
    maybeResolve(room)
    touch(room)
    return true
  }
  return false
}

// ---------- Internal transitions ----------

function maybeResolve(room: Room): void {
  if (!room.selectionsA || !room.selectionsB) return
  const result = resolveExchange(
    room.pieces,
    room.selectionsA,
    room.selectionsB,
  )
  room.pendingResolution = result
  room.revealId += 1
  room.phase = "revealing"
  room.ackA = false
  room.ackB = false
  console.log("[v0][itov] resolve -> revealing", {
    code: room.code,
    revealId: room.revealId,
    events: result.events.length,
  })
}

function advanceFromReveal(room: Room): void {
  if (!room.pendingResolution) return
  const newPieces = room.pendingResolution.pieces
  const check = isRoundOver(newPieces)
  room.pieces = newPieces
  room.selectionsA = null
  room.selectionsB = null
  room.pendingResolution = null
  room.ackA = false
  room.ackB = false
  if (check.over) {
    if (check.mutualWipe) {
      room.pieces = makeStartingPieces()
      room.phase = "selecting"
      room.selectingStartedAt = Date.now()
      return
    }
    const winner = check.winner!
    if (winner === "A") room.scoreA += 1
    else room.scoreB += 1
    room.lastRoundWinner = winner
    if (room.scoreA >= MATCH_TARGET) {
      room.matchWinner = "A"
      room.phase = "match-end"
      return
    }
    if (room.scoreB >= MATCH_TARGET) {
      room.matchWinner = "B"
      room.phase = "match-end"
      return
    }
    room.phase = "round-end"
    return
  }
  room.phase = "selecting"
  room.selectingStartedAt = Date.now()
}

// ---------- Public API: queries ----------

export interface PublicRoomState {
  code: string
  phase: RoomPhase
  role: PlayerId | null

  // Lobby
  joinerConnected: boolean
  joinerReady: boolean

  // Match
  round: number
  scoreA: number
  scoreB: number
  pieces: Piece[]

  // Selection visibility
  selfSubmitted: boolean
  opponentSubmitted: boolean
  selfSelections: Selections | null

  // Reveal
  revealSelectionsA: Selections | null
  revealSelectionsB: Selections | null
  pendingResolution: ExchangeResult | null
  revealId: number
  selfAcked: boolean
  opponentAcked: boolean

  // Round screen
  lastRoundWinner: PlayerId | null
  matchWinner: PlayerId | null

  // Timer
  selectingStartedAt: number | null
  selectionDeadline: number | null

  // Lifecycle (drives "match ended" overlay on clients)
  ended: boolean
  endedBy: PlayerId | null
  endedAt: number | null
  endedSelf: boolean

  version: number
  serverNow: number
}

/**
 * Pure projection: room -> client-visible state for `clientId`.
 * Use this after a write action so we don't re-acquire the lock.
 */
export function roomToPublicState(
  room: Room,
  clientId: string,
): PublicRoomState {
  const role = roleOf(room, clientId)
  const showResolution = room.phase === "revealing"

  return {
    code: room.code,
    phase: room.phase,
    role,

    joinerConnected: !!room.joinerClientId,
    joinerReady: room.joinerReady,

    round: room.round,
    scoreA: room.scoreA,
    scoreB: room.scoreB,
    pieces: room.pieces,

    selfSubmitted:
      role === "A"
        ? room.selectionsA !== null
        : role === "B"
          ? room.selectionsB !== null
          : false,
    opponentSubmitted:
      role === "A"
        ? room.selectionsB !== null
        : role === "B"
          ? room.selectionsA !== null
          : false,
    selfSelections:
      role === "A"
        ? room.selectionsA
        : role === "B"
          ? room.selectionsB
          : null,

    revealSelectionsA: showResolution ? room.selectionsA : null,
    revealSelectionsB: showResolution ? room.selectionsB : null,
    pendingResolution: showResolution ? room.pendingResolution : null,
    revealId: room.revealId,
    selfAcked: role === "A" ? room.ackA : role === "B" ? room.ackB : false,
    opponentAcked:
      role === "A" ? room.ackB : role === "B" ? room.ackA : false,

    lastRoundWinner: room.lastRoundWinner,
    matchWinner: room.matchWinner,

    selectingStartedAt: room.selectingStartedAt,
    selectionDeadline: room.selectingStartedAt
      ? room.selectingStartedAt + SELECTION_TIMER_SECONDS * 1000
      : null,

    ended: !!room.endedAt,
    endedBy: room.endedBy,
    endedAt: room.endedAt,
    endedSelf: !!room.endedAt && room.endedBy === role,

    version: room.version,
    serverNow: Date.now(),
  }
}

/**
 * Read the room and project it for the given client.
 *
 * Fast path: most reads don't mutate, so we skip the lock and just GET.
 * If the selection timer has lapsed we re-read under the lock to apply
 * the auto-resolve transition atomically.
 */
export async function getPublicState(
  code: string,
  clientId: string,
): Promise<PublicRoomState | null> {
  const c = norm(code)
  const room = await readRoom(c)
  if (!room) return null
  if (isExpired(room)) return null

  // Fast path: no timer tick needed.
  const needsTick =
    !room.endedAt &&
    room.phase === "selecting" &&
    room.selectingStartedAt !== null &&
    Date.now() - room.selectingStartedAt >=
      SELECTION_TIMER_SECONDS * 1000

  if (!needsTick) {
    return roomToPublicState(room, clientId)
  }

  // Slow path: mutate under lock so timer expiry is applied exactly once.
  return withRoomLock(c, (latest) => {
    if (!latest || isExpired(latest)) {
      return { value: null }
    }
    const ticked = tickRoom(latest)
    return {
      value: roomToPublicState(latest, clientId),
      save: ticked ? latest : undefined,
    }
  })
}
