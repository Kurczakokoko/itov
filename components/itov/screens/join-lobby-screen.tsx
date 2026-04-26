"use client"

import { useState } from "react"
import { useGame } from "@/lib/itov/store"
import { ItovButton } from "@/components/itov/itov-button"
import { EndMatchControl } from "@/components/itov/end-match-control"

export function JoinLobbyScreen() {
  const { local, goLanding } = useGame()
  const hasJoined = !!local.roomCode

  return (
    <main className="ritual-grain relative flex min-h-svh flex-col items-center justify-between px-6 py-10">
      {/* If we're not yet in a room, the top-right is a plain "Back" link.
          Once we're in a room, it becomes the confirmation-gated end control. */}
      <div className="absolute top-4 right-4">
        {hasJoined ? (
          <EndMatchControl label="Leave" />
        ) : (
          <button
            type="button"
            onClick={goLanding}
            className="text-foreground-faint hover:text-foreground-dim font-display text-[10px] tracking-[0.32em] uppercase transition-colors"
          >
            Back
          </button>
        )}
      </div>

      <div className="animate-itov-fade-in flex w-full max-w-md flex-1 flex-col items-center justify-center gap-12">
        {!hasJoined ? <CodeEntry /> : <WaitingBlock />}
      </div>

      <div className="text-foreground-faint pointer-events-none select-none text-[10px] tracking-[0.3em] uppercase">
        Join
      </div>
    </main>
  )
}

function CodeEntry() {
  const { join, local } = useGame()
  const [code, setCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const trimmed = code.trim()
  const valid = trimmed.length >= 4 && !submitting

  const submit = async () => {
    if (!valid) return
    setSubmitting(true)
    try {
      await join(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <label className="font-display text-foreground-dim text-xs tracking-[0.4em] uppercase">
        Enter Code
      </label>
      <input
        autoFocus
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        value={code}
        maxLength={6}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit()
        }}
        className="font-display text-foreground w-full bg-transparent text-center text-[clamp(2.75rem,14vw,5rem)] leading-none tracking-[0.25em] tabular-nums caret-transparent outline-none"
        aria-label="Room code"
      />
      <ItovButton inactive={!valid} onClick={() => void submit()} className="w-full">
        {submitting ? "Joining" : "Join"}
      </ItovButton>
      {local.lastError && (
        <div className="font-display text-destructive text-center text-[10px] tracking-[0.3em] uppercase">
          {local.lastError}
        </div>
      )}
    </div>
  )
}

function WaitingBlock() {
  const { local } = useGame()

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <div className="font-display text-foreground-dim text-[10px] tracking-[0.4em] uppercase">
          In room
        </div>
        <div
          className="font-display text-foreground text-center text-[clamp(2.5rem,12vw,4rem)] leading-none tracking-[0.2em] tabular-nums"
          aria-label={`Room code ${local.roomCode}`}
        >
          {local.roomCode}
        </div>
      </div>
      <div className="font-display text-foreground-dim text-center text-xs tracking-[0.32em] uppercase">
        <span>Waiting for host</span>
        <span className="animate-ellipsis" />
      </div>
    </>
  )
}
