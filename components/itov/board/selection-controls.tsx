"use client"

import { useMemo } from "react"
import { ItovButton } from "@/components/itov/itov-button"
import type {
  Direction,
  MoveType,
  Piece,
  PlayerId,
} from "@/lib/itov/types"
import { toScreenCoord } from "./coords"
import { MovePicker } from "./move-picker"
import { PieceToken } from "./piece-token"
import { cn } from "@/lib/utils"

export interface PendingAssignment {
  move: MoveType | null
  /** UI-relative direction (up = toward opponent on this player's screen). */
  direction: Direction | null
}

interface SelectionControlsProps {
  livePieces: Piece[]
  viewerRole: PlayerId
  selectedPieceId: string | null
  pending: Record<string, PendingAssignment>
  onSelectPiece: (id: string) => void
  onSelectMove: (id: string, move: MoveType) => void
  onSelectDirection: (id: string, direction: Direction) => void
  onClearPiece: (id: string) => void
  onConfirm: () => void
  submitted: boolean
  opponentSubmitted: boolean
  /** Total alive pieces requiring assignment. */
  totalAssigned: number
  totalPieces: number
}

export function SelectionControls({
  livePieces,
  viewerRole,
  selectedPieceId,
  pending,
  onSelectPiece,
  onSelectMove,
  onSelectDirection,
  onClearPiece,
  onConfirm,
  submitted,
  opponentSubmitted,
  totalAssigned,
  totalPieces,
}: SelectionControlsProps) {
  // Order own pieces left-to-right as they appear on this viewer's screen,
  // so the picker order matches the board layout for both host and joiner.
  const ownPieces = useMemo(
    () =>
      livePieces
        .filter((p) => p.owner === viewerRole && p.alive)
        .slice()
        .sort(
          (a, b) =>
            toScreenCoord(viewerRole, a.x, a.y).sx -
            toScreenCoord(viewerRole, b.x, b.y).sx,
        ),
    [livePieces, viewerRole],
  )
  const selectedPiece =
    ownPieces.find((p) => p.id === selectedPieceId) ?? null
  const selectedAssignment = selectedPiece
    ? pending[selectedPiece.id]
    : null
  const allAssigned = totalAssigned >= totalPieces

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Piece picker row */}
      <div className="border-border bg-surface/40 flex items-center justify-between gap-2 rounded border p-3">
        <div className="font-display text-foreground-dim self-start text-[10px] tracking-[0.32em] uppercase">
          Pieces
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          {ownPieces.map((p) => {
            const has =
              !!pending[p.id]?.move && !!pending[p.id]?.direction
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPiece(p.id)}
                aria-pressed={selectedPieceId === p.id}
                aria-label={`Select ${p.color} piece`}
                className={cn(
                  "relative flex size-12 shrink-0 items-center justify-center rounded transition-colors",
                  selectedPieceId === p.id
                    ? "ring-foreground/80 ring-2"
                    : "ring-0",
                  submitted && "opacity-50",
                )}
                disabled={submitted}
              >
                <PieceToken
                  piece={p}
                  viewerRole={viewerRole}
                  queuedMove={
                    pending[p.id]?.move && pending[p.id]?.direction
                      ? {
                          // pending stores UI-relative directions; PieceToken
                          // expects UI-relative directions. No conversion.
                          move: pending[p.id]!.move!,
                          direction: pending[p.id]!.direction!,
                        }
                      : null
                  }
                  size={44}
                  unassigned={!has}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Picker or status */}
      {submitted ? (
        <div className="border-border bg-surface/40 flex flex-col items-center gap-2 rounded border p-6">
          <div className="bg-accent size-2 rounded-full" />
          <div className="font-display text-foreground text-xs tracking-[0.32em] uppercase">
            Locked in
          </div>
          <div className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
            <span>
              {opponentSubmitted
                ? "Opponent ready"
                : "Waiting for opponent"}
            </span>
            {!opponentSubmitted && <span className="animate-ellipsis" />}
          </div>
        </div>
      ) : selectedPiece ? (
        <MovePicker
          title={`${selectedPiece.color} piece`}
          move={selectedAssignment?.move ?? null}
          direction={selectedAssignment?.direction ?? null}
          onSelectMove={(m) => onSelectMove(selectedPiece.id, m)}
          onSelectDirection={(d) =>
            onSelectDirection(selectedPiece.id, d)
          }
          onClear={() => onClearPiece(selectedPiece.id)}
        />
      ) : (
        <div className="border-border bg-surface/30 text-foreground-dim font-display flex h-32 items-center justify-center rounded border text-center text-[10px] tracking-[0.32em] uppercase">
          Tap a piece to assign a move
        </div>
      )}

      {/* Confirm */}
      {!submitted && (
        <ItovButton
          onClick={onConfirm}
          inactive={!allAssigned}
          className="w-full"
        >
          {allAssigned
            ? "Lock in"
            : `Assign ${totalPieces - totalAssigned} more`}
        </ItovButton>
      )}
    </div>
  )
}
