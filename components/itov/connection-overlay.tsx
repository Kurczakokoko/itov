"use client"

import { useGame } from "@/lib/itov/store"
import { ItovButton } from "@/components/itov/itov-button"

/**
 * Surfaces connection issues without ever silently navigating the user away.
 *
 * - "lost"  → poll 404 while we hold a roomCode (stale dev state, host's
 *             leave grace expired, etc). Shows "Match unavailable".
 * - "ended" → server reports the match was formally ended by either player.
 *             Shows who ended it. The user explicitly returns to landing.
 *
 * Sits above all content; only renders when an issue exists.
 */
export function ConnectionOverlay() {
  const { connection, remote, local, dismissConnectionIssue } = useGame()
  if (connection === "ok") return null

  const youEnded = !!remote?.endedSelf
  const title =
    connection === "ended"
      ? youEnded
        ? "You ended the match"
        : local.role
          ? "Opponent ended the match"
          : "Match ended"
      : "Match unavailable"
  const body =
    connection === "ended"
      ? "Return to the lobby to start another."
      : "The room has expired or was closed. Return to the lobby."

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm px-6"
    >
      <div className="border-border bg-surface text-foreground animate-itov-fade-in flex w-full max-w-sm flex-col items-center gap-6 rounded-md border p-8 text-center">
        <div className="font-display text-foreground text-base tracking-[0.32em] uppercase">
          {title}
        </div>
        <div className="font-display text-foreground-dim text-[11px] tracking-[0.28em] uppercase leading-relaxed">
          {body}
        </div>
        <ItovButton
          variant="primary"
          onClick={dismissConnectionIssue}
          className="w-full"
        >
          Return to Lobby
        </ItovButton>
      </div>
    </div>
  )
}
