"use client"

import type { Direction, MoveType, Piece, PlayerId } from "@/lib/itov/types"
import { cn } from "@/lib/utils"

interface PieceTokenProps {
  piece: Piece
  viewerRole: PlayerId
  /**
   * If a move + direction is queued for this piece, render the animated indicator.
   *
   * `direction` here is **UI-relative** — i.e. "up" means "toward the top of
   * THIS player's screen". Callers must convert absolute board directions to
   * UI directions via `absoluteToUiDirection` before passing.
   */
  queuedMove?: { move: MoveType; direction: Direction } | null
  /** Highlight ring (e.g., currently selected for assignment). */
  selected?: boolean
  /** Show as "needs assignment". */
  unassigned?: boolean
  /** Eliminated pulse / shatter. */
  eliminating?: boolean
  /** Callback when the piece is tapped (used in piece picker row). */
  onClick?: () => void
  /** Visual size in pixels. */
  size: number
}

const COLOR_FILL: Record<Piece["color"], string> = {
  blue: "var(--piece-blue)",
  green: "var(--piece-green)",
  olive: "var(--piece-olive)",
  red: "var(--piece-red)",
}

const COLOR_FILL_OPP: Record<Piece["color"], string> = {
  blue: "var(--piece-blue-opp)",
  green: "var(--piece-green-opp)",
  olive: "var(--piece-olive-opp)",
  red: "var(--piece-red-opp)",
}

// The indicator span natively extends DOWN from a top-center origin. CSS
// `rotate(Xdeg)` rotates clockwise as seen on screen. Starting from "down":
//   0°   → south (down)
//   90°  → west  (left)   — 6 o'clock rotates CW to 9 o'clock
//   180° → north (up)
//   270° → east  (right)  — 6 o'clock rotates CW to 3 o'clock
const ROT_DEG: Record<Direction, number> = {
  down: 0,
  left: 90,
  up: 180,
  right: 270,
}

export function PieceToken({
  piece,
  viewerRole,
  queuedMove,
  selected,
  unassigned,
  eliminating,
  onClick,
  size,
}: PieceTokenProps) {
  const isOwnPiece = piece.owner === viewerRole
  const fill = isOwnPiece
    ? COLOR_FILL[piece.color]
    : COLOR_FILL_OPP[piece.color]

  const indicatorDir: Direction | null = queuedMove
    ? queuedMove.direction
    : null

  // Movement extension for the indicator (px, scaled by size).
  const oneStep = Math.round(size * 0.32)
  const twoStep = Math.round(size * 0.55)

  let extension = 0
  let animationClass = ""
  if (queuedMove) {
    if (queuedMove.move === "hold") {
      extension = Math.round(size * 0.1)
      animationClass = "animate-hold-loop"
    } else if (queuedMove.move === "strike") {
      extension = oneStep
      animationClass = "animate-strike-loop"
    } else if (queuedMove.move === "feint") {
      extension = oneStep
      animationClass = "animate-feint-loop"
    } else if (queuedMove.move === "advance") {
      extension = twoStep
      animationClass = "animate-advance-loop"
    }
  }

  const showIndicator = queuedMove != null && indicatorDir != null
  const indicatorHeight = extension + Math.round(size * 0.18)

  if (showIndicator && indicatorDir) {
    console.log(
      "[v0][itov][piece-token] render indicator",
      JSON.stringify({
        pieceId: piece.id,
        owner: piece.owner,
        viewerRole,
        move: queuedMove?.move,
        directionPassedIn: indicatorDir,
        rotateDeg: ROT_DEG[indicatorDir],
      }),
    )
  }

  const Comp: React.ElementType = onClick ? "button" : "div"

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={`${piece.color} piece${eliminating ? " eliminated" : ""}`}
      className={cn(
        "group relative flex select-none items-center justify-center transition-[opacity,transform] duration-300",
        eliminating && "animate-shatter",
        unassigned && "animate-pulse-soft",
        onClick && "cursor-pointer",
      )}
      style={{ width: size, height: size }}
    >
      {/*
        Indicator structure:
        - Outer wrapper: positions at piece center (50%/50%) and applies the
          rotation. NO animation here, so the rotation is never overwritten.
        - Inner wrapper: the loop animation lives here (translate/scale only).
          Because it's nested inside the rotated parent, every animated
          translate inherits the parent's rotation transform.
        - Inside the inner wrapper, the line+arrow tip are positioned absolutely.
      */}
      {showIndicator && indicatorDir && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-0"
          style={{
            left: "50%",
            top: "50%",
            width: 2,
            height: indicatorHeight,
            transformOrigin: "50% 0%",
            transform: `translate(-50%, 0) rotate(${ROT_DEG[indicatorDir]}deg)`,
          }}
        >
          <span
            className={cn("absolute inset-0 block", animationClass)}
            style={
              {
                transformOrigin: "50% 0%",
                "--dx": "0px",
                "--dy": "0px",
              } as React.CSSProperties
            }
          >
            {/* Line: bright at the far end (under the arrow tip), fading toward the body. */}
            <span
              className="absolute inset-x-0 mx-auto block w-px"
              style={{
                top: 0,
                height: "100%",
                background:
                  "linear-gradient(to bottom, transparent 0%, var(--foreground) 100%)",
                opacity: 0.85,
              }}
            />
            {/* Arrow tip at the far end of the span (pointing outward). */}
            <span
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: -1,
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderTop: "5px solid var(--foreground)",
              }}
            />
          </span>
        </span>
      )}

      {/* Body */}
      <span
        className={cn(
          "relative z-10 block",
          selected
            ? "ring-accent ring-offset-background ring-2 ring-offset-2"
            : "",
        )}
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: fill,
          borderRadius: 6,
          border: `1px solid var(--foreground)`,
          boxShadow: "inset 0 0 0 1px rgba(238,226,205,0.18)",
        }}
      />

      {/* Center dot — small accent inside body */}
      <span
        aria-hidden
        className="absolute z-20 size-1 rounded-full"
        style={{
          background: isOwnPiece
            ? "var(--foreground)"
            : "var(--foreground-dim)",
        }}
      />

      {/* Unassigned hint dot */}
      {unassigned && (
        <span
          aria-hidden
          className="bg-accent absolute -top-1 -right-1 z-30 size-2 rounded-full"
        />
      )}
    </Comp>
  )
}
