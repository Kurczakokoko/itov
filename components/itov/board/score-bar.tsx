"use client"

import { MATCH_TARGET } from "@/lib/itov/constants"
import { cn } from "@/lib/utils"

interface ScoreBarProps {
  /** Score for the local player. */
  selfScore: number
  /** Score for the opponent. */
  oppScore: number
  /** Round number (1-based). */
  round: number
}

/**
 * Top score bar. Shows pip rows for each player and the current round number.
 * Pips fill in pinky->thumb finger colors to subtly echo the round screen.
 */
export function ScoreBar({ selfScore, oppScore, round }: ScoreBarProps) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-2">
      <PipRow score={oppScore} label="OPP" align="left" />
      <div className="font-display text-foreground-dim text-[10px] tracking-[0.3em] uppercase">
        Round <span className="text-foreground tabular-nums">{round}</span>
      </div>
      <PipRow score={selfScore} label="YOU" align="right" />
    </div>
  )
}

function PipRow({
  score,
  label,
  align,
}: {
  score: number
  label: string
  align: "left" | "right"
}) {
  const pips = Array.from({ length: MATCH_TARGET }, (_, i) => i < score)
  // Order pips so highest-index pip appears closest to the center label,
  // matching the "fingers fill in toward the thumb" feeling.
  const ordered = align === "left" ? [...pips].reverse() : pips
  return (
    <div className="flex items-center gap-2">
      {align === "right" && (
        <span className="font-display text-foreground-faint text-[9px] tracking-[0.3em] uppercase">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        {ordered.map((filled, i) => (
          <Pip
            key={i}
            filled={filled}
            colorIndex={
              align === "left" ? MATCH_TARGET - 1 - i : i
            }
          />
        ))}
      </div>
      {align === "left" && (
        <span className="font-display text-foreground-faint text-[9px] tracking-[0.3em] uppercase">
          {label}
        </span>
      )}
    </div>
  )
}

const PIP_COLORS = [
  "bg-finger-1",
  "bg-finger-2",
  "bg-finger-3",
  "bg-finger-4",
  "bg-finger-5",
]

function Pip({
  filled,
  colorIndex,
}: {
  filled: boolean
  colorIndex: number
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 rounded-full transition-all duration-300",
        filled
          ? cn(PIP_COLORS[colorIndex], "shadow-[0_0_6px_rgba(238,226,205,0.25)]")
          : "border-foreground-faint border bg-transparent",
      )}
    />
  )
}
