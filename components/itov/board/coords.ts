// Helpers translating between absolute board coordinates (server canonical)
// and the player's perspective on screen.
//
// Player A (host) sits at the bottom of the board (y = BOARD_H - 1).
// Player B (joiner) sits at the top of the board (y = 0).
// Both players should see the same view: their pieces at the bottom, opponent
// at the top. For B, this is achieved with a 180° rotation of the board.

import { BOARD_H, BOARD_W } from "@/lib/itov/constants"
import type { Direction, PlayerId } from "@/lib/itov/types"

const FLIP_DIRECTION: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
}

/** Convert an absolute coordinate to the screen coordinate for `role`. */
export function toScreenCoord(
  role: PlayerId,
  x: number,
  y: number,
): { sx: number; sy: number } {
  if (role === "B") {
    return { sx: BOARD_W - 1 - x, sy: BOARD_H - 1 - y }
  }
  return { sx: x, sy: y }
}

/**
 * Convert a UI direction (up = toward opponent on this player's screen) to the
 * absolute direction stored in selections.
 */
export function uiToAbsoluteDirection(
  role: PlayerId,
  uiDir: Direction,
): Direction {
  if (role === "B") return FLIP_DIRECTION[uiDir]
  return uiDir
}

/** Convert an absolute direction to the UI direction for the given player. */
export function absoluteToUiDirection(
  role: PlayerId,
  absDir: Direction,
): Direction {
  if (role === "B") return FLIP_DIRECTION[absDir]
  return absDir
}
