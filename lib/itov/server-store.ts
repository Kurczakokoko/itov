// Server-side authoritative state for ITOV matches.
//
// Rooms live in process memory keyed by a 5-character code, persisted across
// HMR via `globalThis.__itovRoomsV3`. In a production deploy you would back
// this with Redis/Supabase; for a single-instance demo it is sufficient.
//
// IMPORTANT design property: `leaveRoom` does NOT immediately drop the room.
// It marks `endedAt` so clients can show a graceful "match ended" overlay
// for a short grace window. After the window, the room is purged. This
// prevents accidental Leave taps from silently 404'ing both peers' polling.

import {
  isRoundOver,
  makeStartingPieces,
  resolveExchange,
} from "./engine"
import { MATCH_TARGET, SELECTION_TIMER_SECONDS } from "./constants"
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

// ---------- Global registry (HMR safe) ----------

const ROOM_TTL_MS = 60 * 60 * 1000 // 1h hard cap
const ENDED_GRACE_MS = 30 * 1000 // 30s after ended -> purge

interface GlobalCache {
  rooms: Map<string, Room>
  /** Last sweep time; we sweep at most once a second on read. */
  lastSweep: number
}

const g = globalThis as unknown as { __itovRoomsV3?: GlobalCache }
if (!g.__itovRoomsV3) {
  g.__itovRoomsV3 = { rooms: new Map(), lastSweep: 0 }
  console.log("[v0][itov] server-store: initialized fresh global cache")
} else {
  console.log("[v0][itov] server-store: reusing existing global cache", {
    roomCount: g.__itovRoomsV3.rooms.size,
  })
}
const cache: GlobalCache = g.__itovRoomsV3

function sweep() {
  const now = Date.now()
  if (now - cache.lastSweep < 1000) return
  cache.lastSweep = now
  for (const [code, room] of cache.rooms) {
    if (room.endedAt && now - room.endedAt > ENDED_GRACE_MS) {
      cache.rooms.delete(code)
      console.log("[v0][itov] sweep: purged ended room", { code })
      continue
    }
    if (now - room.updatedAt > ROOM_TTL_MS) {
      cache.rooms.delete(code)
      console.log("[v0][itov] sweep: purged stale room", { code })
    }
  }
}

// ---------- Helpers ----------

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
function generateRoomCode(): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let s = ""
    for (let i = 0; i < 5; i++) {
      s += ROOM_CODE_ALPHABET[
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
      ]
    }
    if (!cache.rooms.has(s)) return s
  }
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

// ---------- Public API: actions ----------

export function createRoom(hostClientId: string): Room {
  sweep()
  // If this client already hosts an active (not-ended) room, return it
  // instead of creating a new one. Prevents a stray double-host click from
  // orphaning the existing room.
  for (const room of cache.rooms.values()) {
    if (room.hostClientId === hostClientId && !room.endedAt) {
      console.log("[v0][itov] createRoom: reusing existing room", {
        code: room.code,
      })
      return touch(room)
    }
  }

  const code = generateRoomCode()
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
  cache.rooms.set(code, room)
  console.log("[v0][itov] createRoom", {
    code,
    hostClientId,
    totalRooms: cache.rooms.size,
  })
  return room
}

export function joinRoom(
  code: string,
  joinerClientId: string,
):
  | { ok: true; room: Room; role: PlayerId }
  | { ok: false; error: string } {
  sweep()
  const room = cache.rooms.get(norm(code))
  if (!room) {
    console.log("[v0][itov] joinRoom: room not found", { code: norm(code) })
    return { ok: false, error: "Room not found" }
  }
  if (room.endedAt) {
    return { ok: false, error: "Match has ended" }
  }
  // Same client rejoining (e.g., reload) is always allowed.
  if (room.joinerClientId === joinerClientId) {
    room.joinerReady = true
    touch(room)
    return { ok: true, room, role: "B" }
  }
  if (room.hostClientId === joinerClientId) {
    return {
      ok: false,
      error: "You're hosting this room — open a second tab to join",
    }
  }
  if (room.phase !== "lobby") {
    return { ok: false, error: "Match already in progress" }
  }
  if (room.joinerClientId && room.joinerClientId !== joinerClientId) {
    return { ok: false, error: "Room is full" }
  }
  room.joinerClientId = joinerClientId
  room.joinerReady = true // auto-ready on join
  touch(room)
  console.log("[v0][itov] joinRoom (auto-ready)", {
    code: room.code,
    joinerClientId,
  })
  return { ok: true, room, role: "B" }
}

/**
 * Mark the room as ended (NOT destroyed). Both clients will keep being able
 * to read state for ENDED_GRACE_MS so they can render a graceful overlay.
 */
export function leaveRoom(code: string, clientId: string): void {
  const room = cache.rooms.get(norm(code))
  if (!room) return
  const role = roleOf(room, clientId)
  if (!role) return
  if (room.endedAt) return // already ended
  room.endedAt = Date.now()
  room.endedBy = role
  touch(room)
  console.log("[v0][itov] leaveRoom -> ended", {
    code: room.code,
    by: role,
  })
}

/** Legacy ready endpoint — auto-ready makes this a no-op success. */
export function setJoinerReady(
  code: string,
  clientId: string,
): Room | null {
  const room = cache.rooms.get(norm(code))
  if (!room || room.endedAt) return null
  if (clientId !== room.joinerClientId) return null
  room.joinerReady = true
  return touch(room)
}

export function startMatch(
  code: string,
  clientId: string,
): { ok: true; room: Room } | { ok: false; error: string } {
  const room = cache.rooms.get(norm(code))
  if (!room) return { ok: false, error: "Room not found" }
  if (room.endedAt) return { ok: false, error: "Match has ended" }
  if (clientId !== room.hostClientId) {
    return { ok: false, error: "Only host can start" }
  }
  if (!room.joinerClientId) {
    return { ok: false, error: "Waiting for opponent" }
  }
  if (room.phase !== "lobby") {
    // Idempotent: already started, just return current state.
    return { ok: true, room }
  }
  Object.assign(room, freshMatchState())
  room.phase = "selecting"
  room.selectingStartedAt = Date.now()
  console.log("[v0][itov] startMatch", { code: room.code })
  return { ok: true, room: touch(room) }
}

export function submitSelections(
  code: string,
  clientId: string,
  selections: Selections,
):
  | { ok: true; room: Room }
  | { ok: false; error: string } {
  const room = cache.rooms.get(norm(code))
  if (!room) return { ok: false, error: "Room not found" }
  if (room.endedAt) return { ok: false, error: "Match has ended" }
  const role = roleOf(room, clientId)
  if (!role) return { ok: false, error: "Not a player in this room" }
  if (room.phase !== "selecting") {
    // Late submit is a no-op success.
    return { ok: true, room }
  }
  if (role === "A") room.selectionsA = selections
  else room.selectionsB = selections
  maybeResolve(room)
  return { ok: true, room: touch(room) }
}

export function ackResolution(
  code: string,
  clientId: string,
): Room | null {
  const room = cache.rooms.get(norm(code))
  if (!room || room.endedAt) return null
  const role = roleOf(room, clientId)
  if (!role) return null
  if (room.phase !== "revealing") return room
  if (role === "A") room.ackA = true
  else room.ackB = true
  if (room.ackA && room.ackB) advanceFromReveal(room)
  return touch(room)
}

export function continueFromRound(
  code: string,
  clientId: string,
): Room | null {
  const room = cache.rooms.get(norm(code))
  if (!room || room.endedAt) return null
  const role = roleOf(room, clientId)
  if (!role) return null
  if (room.phase !== "round-end") return room
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
  return touch(room)
}

export function rematch(code: string, clientId: string): Room | null {
  const room = cache.rooms.get(norm(code))
  if (!room || room.endedAt) return null
  if (clientId !== room.hostClientId) return null
  if (room.phase !== "match-end") return null
  Object.assign(room, freshMatchState())
  if (room.joinerClientId) room.joinerReady = true
  return touch(room)
}

/** Selection timer tick (called on every state read). */
function tickRoom(room: Room): void {
  if (
    room.phase === "selecting" &&
    room.selectingStartedAt &&
    Date.now() - room.selectingStartedAt >= SELECTION_TIMER_SECONDS * 1000
  ) {
    if (!room.selectionsA) room.selectionsA = {}
    if (!room.selectionsB) room.selectionsB = {}
    maybeResolve(room)
    touch(room)
  }
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

export function getPublicState(
  code: string,
  clientId: string,
): PublicRoomState | null {
  sweep()
  const room = cache.rooms.get(norm(code))
  if (!room) return null

  // Selection-timer tick (skipped if already ended).
  if (!room.endedAt) tickRoom(room)

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
