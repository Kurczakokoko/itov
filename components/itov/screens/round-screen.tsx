"use client"

import { useEffect, useRef, useState } from "react"
import { ItovButton } from "@/components/itov/itov-button"
import { ItovLogo } from "@/components/itov/itov-logo"
import { Hand } from "@/components/itov/round/hand"
import { SpinningPortal } from "@/components/itov/round/portal"
import { useGame } from "@/lib/itov/store"
import { EndMatchControl } from "@/components/itov/end-match-control"
import type { PlayerId } from "@/lib/itov/types"

/**
 * Round screen — shown between rounds and at match end.
 *
 * Visual structure (per UI flow §9):
 *   1. ITOV logo at top
 *   2. The spinning square / portal in the centre
 *   3. The two hands inside the portal (opp on top, you on bottom)
 *
 * The portal acts as a rotating-square clipping mask. The hands are
 * counter-rotated inside so they read upright while the four edges of
 * the square sweep around them.
 */
export function RoundScreen() {
  const { remote, local, continueFromRound, rematch } = useGame()
  if (!remote || !local.role) return null
  const role: PlayerId = local.role

  const isMatchEnd = remote.phase === "match-end"
  const myScore = role === "A" ? remote.scoreA : remote.scoreB
  const oppScore = role === "A" ? remote.scoreB : remote.scoreA
  const matchWinner = remote.matchWinner
  const youWon = matchWinner === role

  // Track when a finger newly appears for the entrance flourish.
  const prevMyScore = useRef(myScore)
  const prevOppScore = useRef(oppScore)
  const [flashSide, setFlashSide] = useState<"top" | "bottom" | null>(null)
  useEffect(() => {
    if (myScore > prevMyScore.current) setFlashSide("bottom")
    else if (oppScore > prevOppScore.current) setFlashSide("top")
    prevMyScore.current = myScore
    prevOppScore.current = oppScore
    if (flashSide) {
      const t = window.setTimeout(() => setFlashSide(null), 900)
      return () => window.clearTimeout(t)
    }
  }, [myScore, oppScore, flashSide])

  return (
    <main className="ritual-grain animate-itov-fade-in flex min-h-svh flex-col items-center px-6 pt-8 pb-10">
      <ItovLogo className="w-32 opacity-90" />

      <div className="text-foreground-dim font-display mt-3 text-[10px] tracking-[0.36em] uppercase">
        {isMatchEnd
          ? youWon
            ? "Match · You Won"
            : "Match · They Won"
          : `Round ${remote.round} · ${
              remote.lastRoundWinner === role ? "You Won" : "They Won"
            }`}
      </div>

      {/* Portal + hands */}
      <div className="relative mx-auto mt-6 flex w-full max-w-md flex-1 items-center justify-center">
        <SpinningPortal>
          {/* Hands layout: opponent at top (flipped), player at bottom. */}
          <div className="absolute inset-0 flex flex-col items-center justify-between py-8">
            {/* Opponent's hand — fingers point down toward player */}
            <div
              className={`flex w-full justify-center ${
                flashSide === "top" ? "animate-pulse-soft" : ""
              }`}
            >
              <Hand
                fingers={oppScore}
                side="top"
                className="max-w-[180px] sm:max-w-[200px]"
              />
            </div>

            {/* Center contested gap */}
            <div className="font-display text-foreground-faint pointer-events-none text-[9px] tracking-[0.4em] uppercase">
              {oppScore} : {myScore}
            </div>

            {/* Player's hand — fingers point up */}
            <div
              className={`flex w-full justify-center ${
                flashSide === "bottom" ? "animate-pulse-soft" : ""
              }`}
            >
              <Hand
                fingers={myScore}
                side="bottom"
                className="max-w-[180px] sm:max-w-[200px]"
              />
            </div>
          </div>
        </SpinningPortal>
      </div>

      {/* Action area */}
      <div className="mt-6 flex w-full max-w-xs flex-col items-center gap-3">
        {isMatchEnd ? (
          <MatchEndActions
            youWon={youWon}
            isHost={role === "A"}
            onRematch={() => void rematch()}
          />
        ) : (
          <RoundContinue
            selfAcked={remote.selfAcked}
            opponentAcked={remote.opponentAcked}
            onContinue={() => void continueFromRound()}
          />
        )}
      </div>
    </main>
  )
}

// ---------- Sub-components ----------

interface RoundContinueProps {
  selfAcked: boolean
  opponentAcked: boolean
  onContinue: () => void
}

function RoundContinue({
  selfAcked,
  opponentAcked,
  onContinue,
}: RoundContinueProps) {
  return (
    <>
      <ItovButton
        variant="primary"
        onClick={onContinue}
        inactive={selfAcked}
        className="w-full"
      >
        {selfAcked ? "Ready" : "Continue"}
      </ItovButton>
      <div className="text-foreground-dim font-display text-[10px] tracking-[0.32em] uppercase">
        {selfAcked
          ? opponentAcked
            ? "Resuming"
            : "Waiting for opponent"
          : opponentAcked
            ? "Opponent ready"
            : "Press to continue"}
        {selfAcked && !opponentAcked && (
          <span className="animate-ellipsis ml-1" />
        )}
      </div>
    </>
  )
}

interface MatchEndActionsProps {
  youWon: boolean
  isHost: boolean
  onRematch: () => void
}

function MatchEndActions({
  youWon,
  isHost,
  onRematch,
}: MatchEndActionsProps) {
  return (
    <>
      <div className="text-foreground font-display text-center text-sm tracking-[0.32em] uppercase">
        {youWon ? "Victory" : "Defeat"}
      </div>
      {isHost ? (
        <ItovButton variant="primary" onClick={onRematch} className="w-full">
          Rematch
        </ItovButton>
      ) : (
        <div className="text-foreground-dim font-display text-[10px] tracking-[0.32em] uppercase">
          Awaiting host&apos;s rematch<span className="animate-ellipsis ml-1" />
        </div>
      )}
      <div className="mt-2">
        <EndMatchControl label="Leave" />
      </div>
    </>
  )
}
