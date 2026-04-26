import {
  BOARD_H,
  BOARD_W,
  DIR_VEC,
  OPPOSITE,
  PIECE_COLORS,
  ROW_A,
  ROW_B,
  STARTING_COLUMNS,
} from "./constants"
import type {
  Assignment,
  ExchangeResult,
  MoveType,
  Piece,
  PlayerId,
  ResolutionEvent,
  Selections,
} from "./types"

// ---------- Helpers ----------

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_W && y >= 0 && y < BOARD_H
}

export function pieceAt(
  pieces: Piece[],
  x: number,
  y: number,
): Piece | undefined {
  return pieces.find((p) => p.alive && p.x === x && p.y === y)
}

export function makeStartingPieces(): Piece[] {
  const pieces: Piece[] = []
  STARTING_COLUMNS.forEach((col, idx) => {
    pieces.push({
      id: `A-${idx}`,
      owner: "A",
      color: PIECE_COLORS[idx],
      x: col,
      y: ROW_A,
      alive: true,
      facing: "up",
    })
    // B's colors are mirrored so that, from B's seat (board rotated 180°),
    // B's leftmost piece is blue, then green, olive, red — same as A's seat.
    pieces.push({
      id: `B-${idx}`,
      owner: "B",
      color: PIECE_COLORS[STARTING_COLUMNS.length - 1 - idx],
      x: col,
      y: ROW_B,
      alive: true,
      facing: "down",
    })
  })
  return pieces
}

/**
 * Interaction outcome from the attacker's perspective.
 * - "win"  : attacker eliminates defender
 * - "lose" : defender eliminates attacker
 * - "draw" : both survive, no movement effect for the attacker
 *
 * Directionality: if the defender is NOT facing the direction the attack arrives
 * from, it is an automatic attacker win regardless of move matchup.
 */
export function computeOutcome(
  attackerMove: MoveType,
  defenderMove: MoveType,
  defenderProperFacing: boolean,
): "win" | "lose" | "draw" {
  if (!defenderProperFacing) return "win"

  // Same move always draws.
  if (attackerMove === defenderMove) return "draw"

  // Hold ↔ Feint: drawn (Hold doesn't attack; Feint can't reach a properly-facing Hold).
  if (
    (attackerMove === "hold" && defenderMove === "feint") ||
    (attackerMove === "feint" && defenderMove === "hold")
  ) {
    return "draw"
  }

  // Strike ↔ Advance: drawn head-on (collide and cancel).
  if (
    (attackerMove === "strike" && defenderMove === "advance") ||
    (attackerMove === "advance" && defenderMove === "strike")
  ) {
    return "draw"
  }

  // Cycle: strike > hold, hold > advance, advance > feint, feint > strike.
  const beats: Record<MoveType, MoveType> = {
    strike: "hold",
    hold: "advance",
    advance: "feint",
    feint: "strike",
  }
  if (beats[attackerMove] === defenderMove) return "win"
  return "lose"
}

function getAssign(
  p: Piece,
  selectionsA: Selections,
  selectionsB: Selections,
): Assignment {
  const sel = (p.owner === "A" ? selectionsA : selectionsB)[p.id]
  if (sel) return sel
  return { pieceId: p.id, move: "hold", direction: p.facing }
}

// ---------- Resolution ----------

export function resolveExchange(
  pieces: Piece[],
  selectionsA: Selections,
  selectionsB: Selections,
): ExchangeResult {
  // Deep clone pieces so we never mutate caller state.
  const state: Piece[] = pieces.map((p) => ({ ...p }))
  const events: ResolutionEvent[] = []

  // Pre-store every alive piece's chosen assignment for the exchange.
  const assigns: Record<string, Assignment> = {}
  for (const p of state) {
    if (p.alive) assigns[p.id] = getAssign(p, selectionsA, selectionsB)
  }

  // -------- PHASE: HOLD --------
  // Hold pieces lock their facing. They neither move nor attack.
  for (const p of state) {
    if (!p.alive) continue
    const a = assigns[p.id]
    if (a.move === "hold") {
      p.facing = a.direction
      events.push({
        phase: "hold",
        kind: "move",
        pieceId: p.id,
        from: { x: p.x, y: p.y },
        to: { x: p.x, y: p.y },
      })
    }
  }

  // -------- PHASE: STRIKE --------
  runAttackingPhase("strike", state, assigns, events, {
    pathLength: 1,
    moveOnWin: true,
  })

  // -------- PHASE: FEINT --------
  runAttackingPhase("feint", state, assigns, events, {
    pathLength: 1,
    moveOnWin: false,
  })

  // -------- PHASE: ADVANCE --------
  runAttackingPhase("advance", state, assigns, events, {
    pathLength: 2,
    moveOnWin: true,
  })

  // Update facing for any survivor based on its chosen direction.
  for (const p of state) {
    if (!p.alive) continue
    p.facing = assigns[p.id].direction
  }

  return { pieces: state, events }
}

interface PhaseConfig {
  /** Number of tiles the attacker steps through. Strike/Feint=1, Advance=2. */
  pathLength: number
  /** Whether the attacker physically moves into a won tile. Feint=false. */
  moveOnWin: boolean
}

function runAttackingPhase(
  phase: MoveType,
  state: Piece[],
  assigns: Record<string, Assignment>,
  events: ResolutionEvent[],
  cfg: PhaseConfig,
) {
  // Snapshot positions at start of phase.
  // We base interaction outcomes on the snapshot, but check movement
  // collisions on the live state when applying movements at end of phase.
  const snapshot = state.map((p) => ({ ...p }))
  const snapAt = (x: number, y: number) =>
    snapshot.find((p) => p.alive && p.x === x && p.y === y)

  // Pieces acting this phase.
  const actors = state.filter((p) => p.alive && assigns[p.id].move === phase)

  const deaths = new Set<string>()
  // Final intended position for actors that successfully move.
  const intendedMove = new Map<string, { x: number; y: number }>()

  for (const actor of actors) {
    const dir = assigns[actor.id].direction
    const v = DIR_VEC[dir]
    let cx = actor.x
    let cy = actor.y
    let stepped = false

    for (let step = 1; step <= cfg.pathLength; step++) {
      const tx = actor.x + v.dx * step
      const ty = actor.y + v.dy * step

      if (!inBounds(tx, ty)) {
        events.push({
          phase,
          kind: "edge-stop",
          pieceId: actor.id,
          to: { x: tx, y: ty },
        })
        break
      }

      const target = snapAt(tx, ty)

      if (target && target.owner === actor.owner) {
        // Friendly block — stop here. For Strike/Advance this means no movement
        // and no attack on this tile. For Feint, this means no attack (no move anyway).
        events.push({
          phase,
          kind: "block-friendly",
          pieceId: actor.id,
          targetPieceId: target.id,
          to: { x: tx, y: ty },
        })
        break
      }

      if (!target) {
        // Empty tile. For Strike/Advance, advance through. For Feint (no movement),
        // no effect — Feint doesn't fire on empty tiles.
        if (cfg.moveOnWin) {
          cx = tx
          cy = ty
          stepped = true
        }
        continue
      }

      // Enemy at target tile. Compute interaction.
      const defenderAssign = assigns[target.id] ?? {
        pieceId: target.id,
        move: "hold" as MoveType,
        direction: target.facing,
      }
      const defenderProperFacing = defenderAssign.direction === OPPOSITE[dir]
      const outcome = computeOutcome(
        phase,
        defenderAssign.move,
        defenderProperFacing,
      )

      events.push({
        phase,
        kind: "attack",
        pieceId: actor.id,
        targetPieceId: target.id,
        from: { x: actor.x, y: actor.y },
        to: { x: tx, y: ty },
      })

      if (outcome === "win") {
        deaths.add(target.id)
        events.push({
          phase,
          kind: "elimination",
          pieceId: target.id,
        })
        if (cfg.moveOnWin) {
          cx = tx
          cy = ty
          stepped = true
        }
        // Continue along path (relevant for Advance).
        continue
      }

      if (outcome === "lose") {
        deaths.add(actor.id)
        events.push({
          phase,
          kind: "elimination",
          pieceId: actor.id,
        })
        // Attacker dies; do not continue path.
        break
      }

      // Draw — both survive. Stop pathing here.
      break
    }

    if (stepped) {
      intendedMove.set(actor.id, { x: cx, y: cy })
    }
  }

  // Apply deaths first.
  for (const id of deaths) {
    const p = state.find((q) => q.id === id)
    if (p) p.alive = false
  }

  // Apply movements. If a target tile becomes occupied by another mover, the
  // later one stays put (deterministic by actor index/id).
  const occupied = new Set<string>()
  for (const p of state) {
    if (p.alive && !intendedMove.has(p.id)) {
      occupied.add(`${p.x},${p.y}`)
    }
  }

  // Sort actors by id for determinism.
  const sortedMovers = [...intendedMove.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )
  for (const [id, pos] of sortedMovers) {
    const p = state.find((q) => q.id === id)
    if (!p || !p.alive) continue
    const key = `${pos.x},${pos.y}`
    if (occupied.has(key)) {
      // Collision; piece stays put.
      continue
    }
    occupied.add(`${pos.x},${pos.y}`)
    occupied.delete(`${p.x},${p.y}`) // Free up old tile
    events.push({
      phase,
      kind: "move",
      pieceId: p.id,
      from: { x: p.x, y: p.y },
      to: { x: pos.x, y: pos.y },
    })
    p.x = pos.x
    p.y = pos.y
  }
}

// ---------- Round / Match helpers ----------

export function aliveCount(pieces: Piece[], owner: PlayerId): number {
  return pieces.filter((p) => p.alive && p.owner === owner).length
}

export function isRoundOver(pieces: Piece[]): {
  over: boolean
  winner?: PlayerId
  mutualWipe?: boolean
} {
  const a = aliveCount(pieces, "A")
  const b = aliveCount(pieces, "B")
  if (a === 0 && b === 0) return { over: true, mutualWipe: true }
  if (a === 0) return { over: true, winner: "B" }
  if (b === 0) return { over: true, winner: "A" }
  return { over: false }
}
