"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ItovLogo } from "@/components/itov/itov-logo"
import { BoardGrid } from "@/components/itov/board/board-grid"
import { ScoreBar } from "@/components/itov/board/score-bar"
import { SelectionTimer } from "@/components/itov/board/timer"
import {
  SelectionControls,
  type PendingAssignment,
} from "@/components/itov/board/selection-controls"
import {
  absoluteToUiDirection,
  toScreenCoord,
  uiToAbsoluteDirection,
} from "@/components/itov/board/coords"
import { useGame } from "@/lib/itov/store"
import type {
  Direction,
  MoveType,
  Piece,
  PlayerId,
  ResolutionEvent,
  Selections,
} from "@/lib/itov/types"
import { RESOLUTION_ORDER } from "@/lib/itov/constants"
import { EndMatchControl } from "@/components/itov/end-match-control"

export function BoardScreen() {
  const { remote, local, submit, ackResolution } = useGame()
  if (!remote || !local.role || !remote.code) {
    return null
  }
  const role = local.role

  const selfScore = role === "A" ? remote.scoreA : remote.scoreB
  const oppScore = role === "A" ? remote.scoreB : remote.scoreA

  return (
    <main className="ritual-grain relative flex min-h-svh flex-col items-stretch px-4 pt-2 pb-6">
      <ScoreBar
        selfScore={selfScore}
        oppScore={oppScore}
        round={remote.round}
      />

      <div className="my-2 flex items-center justify-center">
        <ItovLogo className="w-28 opacity-90" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        {remote.phase === "selecting" && (
          <SelectionPhase
            // Re-mount the selection phase at the start of every selection
            // cycle (each exchange within a round bumps `selectingStartedAt`),
            // so locally-pending move assignments don't leak across exchanges.
            key={`select-${remote.selectingStartedAt ?? 0}`}
            role={role}
            pieces={remote.pieces}
            selectionDeadline={remote.selectionDeadline ?? null}
            onSubmit={(s) => void submit(s)}
            submitted={remote.selfSubmitted}
            opponentSubmitted={remote.opponentSubmitted}
            existingSelections={remote.selfSelections}
          />
        )}

        {remote.phase === "revealing" && remote.pendingResolution && (
          <RevealPhase
            // Stable per-resolution key — without this, the animation
            // restarted on every 500ms SWR poll and never finished.
            key={`reveal-${remote.revealId}`}
            role={role}
            initialPieces={remote.pieces}
            events={remote.pendingResolution.events}
            finalPieces={remote.pendingResolution.pieces}
            selectionsA={remote.revealSelectionsA}
            selectionsB={remote.revealSelectionsB}
            selfAcked={remote.selfAcked}
            opponentAcked={remote.opponentAcked}
            onComplete={() => void ackResolution()}
          />
        )}
      </div>

      <div className="mt-auto pt-4 text-center">
        <EndMatchControl label="Forfeit" />
      </div>
    </main>
  )
}

// ---------- Selection Phase ----------

interface SelectionPhaseProps {
  role: PlayerId
  pieces: Piece[]
  selectionDeadline: number | null
  onSubmit: (selections: Selections) => void
  submitted: boolean
  opponentSubmitted: boolean
  existingSelections: Selections | null
}

function SelectionPhase({
  role,
  pieces,
  selectionDeadline,
  onSubmit,
  submitted,
  opponentSubmitted,
  existingSelections,
}: SelectionPhaseProps) {
  // Sort own pieces left-to-right as they appear on this viewer's screen.
  // For player B (joiner) the board is rotated 180°, so absolute-X-ascending
  // would walk right-to-left on screen. Sorting by screen-X keeps the
  // initial selection and auto-advance flow visually left-to-right for both
  // host and joiner.
  const ownAlivePieces = useMemo(
    () =>
      pieces
        .filter((p) => p.owner === role && p.alive)
        .slice()
        .sort(
          (a, b) =>
            toScreenCoord(role, a.x, a.y).sx -
            toScreenCoord(role, b.x, b.y).sx,
        ),
    [pieces, role],
  )

  const [pending, setPending] = useState<Record<string, PendingAssignment>>(
    () => {
      const initial: Record<string, PendingAssignment> = {}
      if (existingSelections) {
        for (const id of Object.keys(existingSelections)) {
          const a = existingSelections[id]
          // selfSelections from server is in absolute coords; convert to UI.
          initial[id] = {
            move: a.move,
            direction: absoluteToUiDirection(role, a.direction),
          }
        }
      }
      return initial
    },
  )

  // Auto-select the first unassigned piece.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return ownAlivePieces[0]?.id ?? null
  })

  useEffect(() => {
    if (!selectedId || !ownAlivePieces.find((p) => p.id === selectedId)) {
      const firstUnassigned = ownAlivePieces.find(
        (p) => !pending[p.id]?.move || !pending[p.id]?.direction,
      )
      setSelectedId(firstUnassigned?.id ?? ownAlivePieces[0]?.id ?? null)
    }
  }, [ownAlivePieces, selectedId, pending])

  const setMove = useCallback((id: string, move: MoveType) => {
    setPending((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { direction: null }), move },
    }))
  }, [])
  const setDirection = useCallback((id: string, direction: Direction) => {
    setPending((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { move: null }), direction },
    }))
  }, [])
  const clearPiece = useCallback((id: string) => {
    setPending((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Auto-advance to next unassigned piece after both move and direction are set.
  const prevCompleteCount = useRef(0)
  useEffect(() => {
    const completed = ownAlivePieces.filter(
      (p) => pending[p.id]?.move && pending[p.id]?.direction,
    )
    if (completed.length > prevCompleteCount.current) {
      const next = ownAlivePieces.find(
        (p) =>
          (!pending[p.id]?.move || !pending[p.id]?.direction) &&
          p.id !== selectedId,
      )
      if (next) setSelectedId(next.id)
    }
    prevCompleteCount.current = completed.length
  }, [pending, ownAlivePieces, selectedId])

  const totalAssigned = ownAlivePieces.filter(
    (p) => pending[p.id]?.move && pending[p.id]?.direction,
  ).length

  // Build the selections payload. Partial assignments are normalized
  // (rather than dropped), so anything the player started picking still
  // produces a meaningful move:
  //   - move + direction → use as-is.
  //   - direction only   → hold facing that direction (lock the facing).
  //   - move only        → omitted; the server's engine defaults missing
  //                        entries to `hold @ piece.facing` already, which
  //                        is the desired "hold in place" fallback.
  //   - nothing          → omitted (same fallback as above).
  const handleConfirm = useCallback(() => {
    const sel: Selections = {}
    for (const p of ownAlivePieces) {
      const a = pending[p.id]
      if (a?.move && a?.direction) {
        sel[p.id] = {
          pieceId: p.id,
          move: a.move,
          direction: uiToAbsoluteDirection(role, a.direction),
        }
      } else if (a?.direction && !a?.move) {
        sel[p.id] = {
          pieceId: p.id,
          move: "hold",
          direction: uiToAbsoluteDirection(role, a.direction),
        }
      }
    }
    console.log("[v0][itov] handleConfirm submit", {
      role,
      pieceCount: Object.keys(sel).length,
      total: ownAlivePieces.length,
    })
    onSubmit(sel)
  }, [ownAlivePieces, pending, role, onSubmit])

  // Build queuedMoves map for the BoardGrid (own pieces only during selection).
  // pending stores UI-relative directions; BoardGrid expects UI-relative as well
  // — pass through directly without converting.
  const queuedMoves: Record<
    string,
    { move: MoveType; direction: Direction } | null
  > = {}
  for (const p of pieces) {
    if (p.owner !== role) continue
    const a = pending[p.id]
    if (a?.move && a?.direction) {
      queuedMoves[p.id] = { move: a.move, direction: a.direction }
    } else {
      queuedMoves[p.id] = null
    }
  }
  const unassignedIds = new Set(
    ownAlivePieces
      .filter((p) => !pending[p.id]?.move || !pending[p.id]?.direction)
      .map((p) => p.id),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
          {submitted ? "Locked" : "Assign"}
        </div>
        <SelectionTimer deadline={selectionDeadline} />
        <div className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
          {opponentSubmitted ? "Opp ✓" : "Opp …"}
        </div>
      </div>

      <BoardGrid
        pieces={pieces}
        viewerRole={role}
        queuedMoves={queuedMoves}
        selectedPieceId={selectedId}
        unassignedIds={unassignedIds}
        onPieceClick={(p) => setSelectedId(p.id)}
      />

      <SelectionControls
        livePieces={pieces}
        viewerRole={role}
        selectedPieceId={selectedId}
        pending={pending}
        onSelectPiece={setSelectedId}
        onSelectMove={setMove}
        onSelectDirection={setDirection}
        onClearPiece={clearPiece}
        onConfirm={handleConfirm}
        submitted={submitted}
        opponentSubmitted={opponentSubmitted}
        totalAssigned={totalAssigned}
        totalPieces={ownAlivePieces.length}
      />
    </div>
  )
}

// ---------- Reveal Phase ----------

interface RevealPhaseProps {
  role: PlayerId
  initialPieces: Piece[]
  events: ResolutionEvent[]
  finalPieces: Piece[]
  selectionsA: Selections | null
  selectionsB: Selections | null
  selfAcked: boolean
  opponentAcked: boolean
  onComplete: () => void
}

const PHASE_DURATION_MS: Record<MoveType, number> = {
  hold: 600,
  strike: 700,
  feint: 600,
  advance: 800,
}

function RevealPhase({
  role,
  initialPieces,
  events,
  finalPieces,
  selectionsA,
  selectionsB,
  selfAcked,
  opponentAcked,
  onComplete,
}: RevealPhaseProps) {
  const [renderPieces, setRenderPieces] = useState<Piece[]>(() =>
    initialPieces.map((p) => ({ ...p })),
  )
  const [eliminating, setEliminating] = useState<Set<string>>(new Set())
  const [phaseLabel, setPhaseLabel] = useState<string>("Reveal")

  const completedRef = useRef(false)

  // Build complete queuedMoves map from BOTH selections so all indicators are
  // visible during reveal. Server selections are absolute → convert to UI.
  const queuedMoves = useMemo(() => {
    const map: Record<
      string,
      { move: MoveType; direction: Direction } | null
    > = {}
    if (selectionsA) {
      for (const id of Object.keys(selectionsA)) {
        const a = selectionsA[id]
        map[id] = {
          move: a.move,
          direction: absoluteToUiDirection(role, a.direction),
        }
      }
    }
    if (selectionsB) {
      for (const id of Object.keys(selectionsB)) {
        const a = selectionsB[id]
        map[id] = {
          move: a.move,
          direction: absoluteToUiDirection(role, a.direction),
        }
      }
    }
    return map
    // role doesn't change during a reveal; selections are stable per revealId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionsA, selectionsB])

  // Single-shot animation loop. The parent component re-keys this entire
  // component when a new resolution arrives (revealId changes), so this
  // effect only ever runs once per resolution.
  useEffect(() => {
    completedRef.current = false
    setRenderPieces(initialPieces.map((p) => ({ ...p })))
    setEliminating(new Set())

    let cancelled = false
    const sleep = (ms: number) =>
      new Promise<void>((res) => window.setTimeout(res, ms))

    const run = async () => {
      // Read pause: indicators visible, no movement yet.
      setPhaseLabel("Reveal")
      await sleep(700)
      if (cancelled) return

      for (const phase of RESOLUTION_ORDER) {
        const phaseEvents = events.filter((e) => e.phase === phase)
        if (phaseEvents.length === 0) {
          setPhaseLabel(labelFor(phase))
          await sleep(180)
          if (cancelled) return
          continue
        }

        setPhaseLabel(labelFor(phase))

        const moves = phaseEvents.filter((e) => e.kind === "move")
        const elims = phaseEvents.filter((e) => e.kind === "elimination")
        const elimIds = new Set(elims.map((e) => e.pieceId))

        setRenderPieces((prev) =>
          prev.map((p) => {
            const m = moves.find((e) => e.pieceId === p.id)
            if (m && m.to) return { ...p, x: m.to.x, y: m.to.y }
            return p
          }),
        )
        if (elimIds.size > 0) {
          setEliminating((prev) => new Set([...prev, ...elimIds]))
        }

        await sleep(PHASE_DURATION_MS[phase])
        if (cancelled) return

        if (elimIds.size > 0) {
          setRenderPieces((prev) =>
            prev.map((p) =>
              elimIds.has(p.id) ? { ...p, alive: false } : p,
            ),
          )
          setEliminating((prev) => {
            const next = new Set(prev)
            for (const id of elimIds) next.delete(id)
            return next
          })
        }
      }

      setPhaseLabel("Settle")
      await sleep(450)
      if (cancelled) return
      setRenderPieces(finalPieces.map((p) => ({ ...p })))
      await sleep(200)
      if (cancelled || completedRef.current) return
      completedRef.current = true
      console.log("[v0][itov] reveal animation complete -> ack")
      onComplete()
    }
    void run()
    return () => {
      cancelled = true
    }
    // Mount-only: re-mount happens via parent's `key={reveal-${revealId}}`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
          {phaseLabel}
        </div>
        <div className="font-display text-foreground text-[10px] tracking-[0.32em] uppercase">
          Resolve
        </div>
        <div className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
          {opponentAcked ? "Opp ✓" : selfAcked ? "Wait" : "…"}
        </div>
      </div>

      <BoardGrid
        pieces={renderPieces}
        viewerRole={role}
        queuedMoves={queuedMoves}
        eliminatingIds={eliminating}
      />

      <div className="border-border bg-surface/30 text-foreground-dim font-display flex items-center justify-center rounded border p-4 text-center text-[10px] tracking-[0.32em] uppercase">
        {selfAcked
          ? opponentAcked
            ? "Resolving"
            : "Waiting for opponent"
          : "Reading"}
        {selfAcked && !opponentAcked && (
          <span className="animate-ellipsis ml-1" />
        )}
      </div>
    </div>
  )
}

function labelFor(phase: MoveType): string {
  switch (phase) {
    case "hold":
      return "Hold"
    case "strike":
      return "Strike"
    case "feint":
      return "Feint"
    case "advance":
      return "Advance"
  }
}
