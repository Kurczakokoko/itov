"use client"

import { useEffect, useState } from "react"
import { useGame } from "@/lib/itov/store"

interface Props {
  /** Optional verb shown in the button text (default "End match"). */
  label?: string
  className?: string
}

/**
 * Two-step confirmation for ending a match. The first tap reveals a
 * "Tap to confirm" state; a second tap within 4s actually fires the
 * action. Auto-resets if the user looks away. Prevents the catastrophic
 * single-tap-on-Leave bug.
 */
export function EndMatchControl({ label = "End match", className }: Props) {
  const { endMatch } = useGame()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])

  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false)
          void endMatch()
        } else {
          setArmed(true)
        }
      }}
      className={
        "font-display text-[10px] tracking-[0.32em] uppercase transition-colors " +
        (armed
          ? "text-destructive"
          : "text-foreground-faint hover:text-foreground-dim ") +
        (className ? " " + className : "")
      }
      aria-live="polite"
    >
      {armed ? "Tap to confirm" : label}
    </button>
  )
}
