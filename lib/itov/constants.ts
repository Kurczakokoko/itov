import type { Direction, MoveType, PieceColor, PlayerId } from "./types"

export const BOARD_W = 9
export const BOARD_H = 6

/** Player A is bottom row (row H-1), Player B is top row (row 0). */
export const ROW_A = BOARD_H - 1
export const ROW_B = 0

/** Columns occupied by each side's 4 pieces. */
export const STARTING_COLUMNS = [1, 3, 5, 7] as const

/** Piece color assignment per starting column index (left -> right). */
export const PIECE_COLORS: PieceColor[] = ["blue", "green", "olive", "red"]

export const SELECTION_TIMER_SECONDS = 30

export const MATCH_TARGET = 5

export const ALL_MOVES: MoveType[] = ["hold", "strike", "feint", "advance"]

export const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"]

/** Resolution order. */
export const RESOLUTION_ORDER: MoveType[] = [
  "hold",
  "strike",
  "feint",
  "advance",
]

/** Default initial facing per player (toward the opponent). */
export const DEFAULT_FACING: Record<PlayerId, Direction> = {
  A: "up",
  B: "down",
}

/** Direction -> unit vector. y grows downward. */
export const DIR_VEC: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

export const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
}
