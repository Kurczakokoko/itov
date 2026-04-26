"use client"

import { cn } from "@/lib/utils"

interface HandProps {
  /** Number of rounds won (0..5). Determines how many fingers are extended. */
  fingers: number
  /** "bottom" = player's hand at bottom of screen (fingers point up).
   *  "top" = opponent's hand at top of screen (fingers point down). */
  side: "top" | "bottom"
  className?: string
}

const FINGER_COLORS = [
  "var(--finger-1)", // pinky
  "var(--finger-2)", // ring
  "var(--finger-3)", // middle
  "var(--finger-4)", // index
  "var(--finger-5)", // thumb (white)
]

// SVG layout constants. The hand is drawn fingers-up.
// Coordinates use a viewBox of 220x260; palm sits at the bottom.
const PALM = { x: 30, y: 130, w: 160, h: 110, rx: 22 }

// Each finger has its base x, width, and an "extended" length (height in px).
// Order: 0=pinky, 1=ring, 2=middle, 3=index, 4=thumb.
const FINGERS = [
  { x: 42, w: 22, len: 70 }, // pinky (shortest)
  { x: 70, w: 24, len: 100 }, // ring
  { x: 100, w: 26, len: 116 }, // middle (tallest)
  { x: 132, w: 24, len: 96 }, // index
  // Thumb is offset to the side and slightly lower, growing outward.
  { x: 168, w: 30, len: 70 }, // thumb (shortest)
]

/**
 * Stylized hand rendered as flat geometric SVG. Renders 0..5 fingers based on
 * `fingers`, ordered pinky -> thumb. Fingers grow in with a brief animation
 * the moment a round is won.
 */
export function Hand({ fingers, side, className }: HandProps) {
  // Flip the hand for the opponent's side.
  const flipped = side === "top"

  return (
    <svg
      viewBox="0 0 220 260"
      className={cn(
        "h-auto w-full max-w-[280px]",
        flipped && "scale-y-[-1]",
        className,
      )}
      role="img"
      aria-label={`Hand showing ${fingers} fingers`}
    >
      {/* Palm */}
      <rect
        x={PALM.x}
        y={PALM.y}
        width={PALM.w}
        height={PALM.h}
        rx={PALM.rx}
        ry={PALM.rx}
        fill="var(--surface-2)"
        stroke="var(--foreground)"
        strokeWidth={2}
      />

      {/* Fingers, drawn pinky -> thumb */}
      {FINGERS.map((f, i) => {
        const visible = i < fingers
        const isThumb = i === 4
        const color = FINGER_COLORS[i]
        // Finger geometry: vertical rounded rect rising from the top of the palm.
        // For thumb, render as a slightly tilted bump on the side.
        const fingerX = f.x
        const fingerW = f.w
        const fingerH = f.len
        const fingerY = PALM.y - fingerH + 14 // slightly overlap the palm
        return (
          <g
            key={i}
            className={visible ? "animate-finger-grow" : undefined}
            style={{
              transformOrigin: `${fingerX + fingerW / 2}px ${PALM.y}px`,
              opacity: visible ? 1 : 0,
              transform: visible
                ? isThumb
                  ? "rotate(20deg)"
                  : "none"
                : "scaleY(0)",
            }}
          >
            <rect
              x={fingerX}
              y={fingerY}
              width={fingerW}
              height={fingerH}
              rx={fingerW / 2}
              ry={fingerW / 2}
              fill={color}
              stroke="var(--foreground)"
              strokeWidth={2}
            />
            {/* Highlight nail/joint mark */}
            <circle
              cx={fingerX + fingerW / 2}
              cy={fingerY + 8}
              r={2.5}
              fill="var(--foreground)"
              opacity={0.5}
            />
          </g>
        )
      })}

      {/* Wrist line */}
      <line
        x1={PALM.x + 18}
        y1={PALM.y + PALM.h - 1}
        x2={PALM.x + PALM.w - 18}
        y2={PALM.y + PALM.h - 1}
        stroke="var(--foreground)"
        strokeWidth={1.5}
        opacity={0.6}
      />
    </svg>
  )
}
