"use client"

import { useGame } from "@/lib/itov/store"
import { ItovButton } from "@/components/itov/itov-button"
import { EndMatchControl } from "@/components/itov/end-match-control"

type Status = "WAITING" | "READY"

export function HostLobbyScreen() {
  const { local, remote, start } = useGame()

  const status: Status = remote?.joinerConnected ? "READY" : "WAITING"
  const isReady = status === "READY"

  return (
    <main className="ritual-grain relative flex min-h-svh flex-col items-center justify-between px-6 py-10">
      {/* End match control sits in the top-right, far from the primary action,
          and requires a confirmation tap. */}
      <div className="absolute top-4 right-4">
        <EndMatchControl label="End" />
      </div>

      <div className="animate-itov-fade-in flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-16">
        <div className="flex flex-col items-center gap-6">
          <div className="font-display text-foreground-dim text-[10px] tracking-[0.4em] uppercase">
            Share this code
          </div>
          <div
            className="font-display text-foreground text-center text-[clamp(3.5rem,18vw,7rem)] leading-none tracking-[0.18em] tabular-nums select-all"
            aria-label={`Room code ${local.roomCode}`}
          >
            {local.roomCode ?? "—"}
          </div>

          <StatusLine status={status} />
        </div>

        <ItovButton
          onClick={() => void start()}
          inactive={!isReady}
          className="w-full"
          aria-label="Start match"
        >
          Start
        </ItovButton>
      </div>

      <div className="text-foreground-faint pointer-events-none select-none text-[10px] tracking-[0.3em] uppercase">
        Host
      </div>
    </main>
  )
}

function StatusLine({ status }: { status: Status }) {
  const label = status === "WAITING" ? "Waiting" : "Ready"
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={
          status === "READY"
            ? "bg-accent size-2 rounded-full"
            : "bg-foreground-dim size-2 rounded-full opacity-60"
        }
      />
      <span
        className={
          "font-display text-xs tracking-[0.4em] uppercase " +
          (status === "READY" ? "text-foreground" : "text-foreground-dim")
        }
      >
        <span>{label}</span>
        {status !== "READY" && <span className="animate-ellipsis" />}
      </span>
    </div>
  )
}
