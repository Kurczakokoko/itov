"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SpinningPortalProps {
  /** Content rendered inside the rotating-square clipping mask. */
  children: ReactNode
  /** Optional class for outer wrapper (controls size). */
  className?: string
}

/**
 * The Round Screen's signature element.
 *
 * Visual model
 * ------------
 * • An outer square container rotates clockwise.
 * • The container has `overflow: hidden`, so its bounds form a *rotating
 *   square clipping mask* (4 straight edges that sweep around) — exactly the
 *   "camera aperture made of four straight lines rotating together" described
 *   in the UI flow doc.
 * • Inside, the hands are wrapped in a counter-rotating element so they read
 *   visually upright at all times while still being clipped by the rotating
 *   square edges.
 * • A wireframe overlay (the four-node interaction graph: corners + cross
 *   diagonals) is drawn on top, also rotating, to give the structure a
 *   visible frame.
 *
 * The wireframe is the same graph the ITOV logo encodes: 4 nodes (one per
 * move) connected by edges and diagonals. Spinning here is a deliberate echo
 * of the logo "coming alive" between rounds.
 */
export function SpinningPortal({ children, className }: SpinningPortalProps) {
  return (
    <div
      className={cn(
        "relative aspect-square w-full max-w-[440px]",
        className,
      )}
      aria-hidden="false"
    >
      {/* Faint backdrop ring — gives the portal weight without competing. */}
      <div
        className="border-border-strong/40 pointer-events-none absolute inset-0 rounded-[2px] border"
        style={{ transform: "rotate(45deg) scale(0.92)" }}
      />

      {/* Rotating clip container. overflow:hidden creates the rotating-square mask. */}
      <div className="animate-spin-slow absolute inset-0 overflow-hidden">
        {/* Counter-rotating content keeps hands visually upright. */}
        <div className="counter-spin-slow absolute inset-0">{children}</div>
      </div>

      {/* Wireframe overlay: edges + cross-diagonals + corner nodes. */}
      <svg
        viewBox="0 0 100 100"
        className="animate-spin-slow pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Square frame */}
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.85"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
        {/* Cross diagonals — the interaction-graph cross-connections */}
        <line
          x1="2"
          y1="2"
          x2="98"
          y2="98"
          stroke="var(--foreground-dim)"
          strokeOpacity="0.55"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="98"
          y1="2"
          x2="2"
          y2="98"
          stroke="var(--foreground-dim)"
          strokeOpacity="0.55"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Corner nodes — the four moves */}
        {[
          [2, 2],
          [98, 2],
          [98, 98],
          [2, 98],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle
              cx={cx}
              cy={cy}
              r="2.2"
              fill="var(--background)"
              stroke="var(--foreground)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>

      {/* Local CSS for counter-rotation (mirrors animate-spin-slow timing). */}
      <style jsx>{`
        :global(.counter-spin-slow) {
          animation: itov-counter-spin-slow 18s linear infinite;
        }
        @keyframes itov-counter-spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }
      `}</style>
    </div>
  )
}
