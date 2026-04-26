// ITOV core types. Pure data — no UI.

export type PlayerId = "A" | "B"

export type MoveType = "hold" | "strike" | "feint" | "advance"

export type Direction = "up" | "down" | "left" | "right"

export type PieceColor = "blue" | "green" | "olive" | "red"

export interface Piece {
  id: string
  owner: PlayerId
  color: PieceColor
  /** column 0..BOARD_W-1 */
  x: number
  /** row 0..BOARD_H-1 (0 is top, H-1 is bottom) */
  y: number
  alive: boolean
  /** Last facing direction (used as default Hold direction). */
  facing: Direction
}

export interface Assignment {
  pieceId: string
  move: MoveType
  direction: Direction
}

export interface Selections {
  /** Map from piece id -> assignment. Missing entries default to Hold @ piece.facing. */
  [pieceId: string]: Assignment
}

export interface ResolutionEvent {
  /** Phase at which this event occurred. */
  phase: MoveType
  /** Description of effect. */
  kind: "move" | "attack" | "block-friendly" | "elimination" | "edge-stop"
  pieceId: string
  /** For attack/elimination/move: relevant target piece id. */
  targetPieceId?: string
  /** For move: from -> to. */
  from?: { x: number; y: number }
  to?: { x: number; y: number }
}

export interface ExchangeResult {
  /** Final state of all pieces (alive flag updated). */
  pieces: Piece[]
  /** Ordered events for animation/replay. */
  events: ResolutionEvent[]
}

export interface RoundState {
  pieces: Piece[]
}

export interface MatchState {
  scoreA: number
  scoreB: number
  /** Round number, 1-based. */
  round: number
  pieces: Piece[]
  phase:
    | "selecting"
    | "revealing"
    | "resolving"
    | "round-end"
    | "match-end"
  selectionsA: Selections
  selectionsB: Selections
  lastEvents: ResolutionEvent[]
  /** Winner of last round (for round-end transition). */
  lastRoundWinner?: PlayerId
  matchWinner?: PlayerId
}
