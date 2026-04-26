"use client"

import { useEffect, useMemo, useState } from "react"
import { ALL_MOVES } from "@/lib/itov/constants"
import type {
  Direction,
  MoveType,
  Piece,
  PlayerId,
} from "@/lib/itov/types"
import { toScreenCoord } from "./coords"
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

/**
 * Single-screen selection control panel.
 *
 * Layout (top → bottom):
 *   1. Pieces row (own pieces, horizontal)
 *   2. Move type row (4 buttons, full width)
 *   3. Bottom row: [Lock-in big button] + [Direction 3x3 pad]
 *
 * Lock behavior:
 *   - All pieces fully assigned → single click submits.
 *   - Partial assignments → first click "arms" the button (mirrors the
 *     EndMatchControl confirmation pattern); a second click within 4s
 *     submits. The button auto-disarms after 4s of inactivity, and
 *     also when the user touches any picker (any change to `pending`).
 */
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
  const remaining = Math.max(0, totalPieces - totalAssigned)

  // Confirmation arming for partial submits. Mirrors EndMatchControl.
  const [armed, setArmed] = useState(false)

  // Auto-disarm 4s after arming.
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])

  // Disarm whenever the user touches a picker (`pending` reference changes).
  useEffect(() => {
    setArmed(false)
  }, [pending])

  const handleLockClick = () => {
    if (submitted) return
    if (allAssigned) {
      onConfirm()
      return
    }
    if (armed) {
      setArmed(false)
      onConfirm()
    } else {
      setArmed(true)
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Pieces row */}
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

      {/* Submitted: replace control panel with status block */}
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
      ) : (
        <div className="border-border bg-surface/70 flex flex-col gap-3 rounded border p-3 backdrop-blur-sm">
          {/* Title row */}
          <div className="font-display text-foreground-dim flex items-center justify-between text-[10px] tracking-[0.32em] uppercase">
            <span>
              {selectedPiece
                ? `${selectedPiece.color} piece`
                : "Pick a piece"}
            </span>
            {selectedPiece && (
              <button
                type="button"
                onClick={() => onClearPiece(selectedPiece.id)}
                className="hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Move row */}
          <div className="grid grid-cols-4 gap-2">
            {ALL_MOVES.map((m) => {
              const active = selectedAssignment?.move === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    selectedPiece && onSelectMove(selectedPiece.id, m)
                  }
                  disabled={!selectedPiece}
                  className={cn(
                    "font-display flex h-10 items-center justify-center rounded-sm border text-[10px] tracking-[0.3em] uppercase transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-strong text-foreground-dim hover:text-foreground hover:border-foreground/60",
                    !selectedPiece && "cursor-not-allowed opacity-40",
                  )}
                  aria-pressed={active}
                >
                  {m}
                </button>
              )
            })}
          </div>

          {/* Bottom row: Lock + Direction pad */}
          <div className="grid grid-cols-[1fr_auto] items-stretch gap-3">
            {/* Lock button — fills remaining space, matches dir-pad height */}
            <button
              type="button"
              onClick={handleLockClick}
              aria-label={
                armed
                  ? "Confirm lock-in with unassigned pieces"
                  : "Lock in moves"
              }
              className={cn(
                "font-display flex flex-col items-center justify-center rounded-sm border tracking-[0.32em] uppercase transition-colors",
                armed
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : allAssigned
                    ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                    : "border-border-strong text-foreground-dim hover:border-foreground/60 hover:text-foreground",
              )}
            >
              <span className="text-sm leading-tight">
                {armed ? "Confirm" : "Lock"}
              </span>
              <span className="text-sm leading-tight">
                {armed ? "submit" : "in"}
              </span>
              {!allAssigned && (
                <span
                  className={cn(
                    "mt-1.5 text-[9px] tracking-[0.3em]",
                    armed ? "text-destructive/80" : "text-foreground-faint",
                  )}
                >
                  {remaining} unset
                </span>
              )}
            </button>

            {/* Direction pad */}
            <div className="grid grid-cols-3 grid-rows-3 gap-1">
              <span />
              <DirButton
                dir="up"
                label="↑"
                active={selectedAssignment?.direction === "up"}
                disabled={!selectedPiece}
                onClick={() =>
                  selectedPiece &&
                  onSelectDirection(selectedPiece.id, "up")
                }
              />
              <span />
              <DirButton
                dir="left"
                label="←"
                active={selectedAssignment?.direction === "left"}
                disabled={!selectedPiece}
                onClick={() =>
                  selectedPiece &&
                  onSelectDirection(selectedPiece.id, "left")
                }
              />
              <div className="border-foreground-faint flex size-10 items-center justify-center rounded-full border border-dashed">
                <span className="bg-foreground-faint size-1 rounded-full" />
              </div>
              <DirButton
                dir="right"
                label="→"
                active={selectedAssignment?.direction === "right"}
                disabled={!selectedPiece}
                onClick={() =>
                  selectedPiece &&
                  onSelectDirection(selectedPiece.id, "right")
                }
              />
              <span />
              <DirButton
                dir="down"
                label="↓"
                active={selectedAssignment?.direction === "down"}
                disabled={!selectedPiece}
                onClick={() =>
                  selectedPiece &&
                  onSelectDirection(selectedPiece.id, "down")
                }
              />
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DirButton({
  dir,
  label,
  active,
  disabled,
  onClick,
}: {
  dir: Direction
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Direction ${dir}`}
      aria-pressed={active}
      className={cn(
        "flex size-10 items-center justify-center rounded-sm border text-base transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-foreground-dim hover:border-foreground/60 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {label}
    </button>
  )
}
