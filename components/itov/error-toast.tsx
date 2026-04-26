"use client"

import { useEffect } from "react"
import { useGame } from "@/lib/itov/store"

/**
 * Tiny ambient toast for surfacing transient errors from server actions
 * (room not found, full, etc). Sits at the bottom of the screen, never
 * intercepts taps, fades on its own.
 */
export function ErrorToast() {
  const { local, setError } = useGame()
  const { lastError } = local

  useEffect(() => {
    if (!lastError) return
    const t = window.setTimeout(() => setError(null), 4500)
    return () => window.clearTimeout(t)
  }, [lastError, setError])

  if (!lastError) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4"
    >
      <div className="border-border bg-surface-2/95 text-foreground font-display animate-itov-fade-in pointer-events-auto rounded-sm border px-4 py-2 text-[10px] tracking-[0.28em] uppercase shadow-lg">
        {lastError}
      </div>
    </div>
  )
}
