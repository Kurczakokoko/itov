"use client"

import { useEffect, useState } from "react"
import { SELECTION_TIMER_SECONDS } from "@/lib/itov/constants"

interface TimerProps {
  /** Server-side deadline (epoch ms) when the selection phase ends. */
  deadline: number | null
}

/**
 * Selection timer.
 *
 * The displayed remaining time is computed strictly as `deadline - Date.now()`.
 * We deliberately do NOT use a server-vs-client offset adjustment here —
 * recomputing that offset on every SWR poll caused the displayed seconds to
 * jitter forwards and backwards because each poll measured a different network
 * latency. Both clients are within human-scale tolerance of real time, so the
 * deadline alone is a stable reference.
 */
export function SelectionTimer({ deadline }: TimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [])

  if (!deadline) return null

  const remainingMs = Math.max(0, deadline - now)
  const remaining = Math.ceil(remainingMs / 1000)
  const fraction = Math.max(
    0,
    Math.min(1, remainingMs / (SELECTION_TIMER_SECONDS * 1000)),
  )
  const dash = 100 * fraction
  const isUrgent = remaining <= 5

  return (
    <div className="relative flex size-12 items-center justify-center">
      <svg viewBox="0 0 36 36" className="size-12 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          strokeWidth="2"
          className="stroke-foreground-faint"
        />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className={
            isUrgent
              ? "stroke-destructive transition-[stroke-dashoffset]"
              : "stroke-accent transition-[stroke-dashoffset]"
          }
          strokeDasharray={`${dash} 100`}
          pathLength={100}
        />
      </svg>
      <span
        className={
          "font-display absolute text-sm tabular-nums " +
          (isUrgent ? "text-destructive" : "text-foreground")
        }
      >
        {remaining}
      </span>
    </div>
  )
}
