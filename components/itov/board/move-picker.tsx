"use client"

import { ALL_MOVES } from "@/lib/itov/constants"
import type { Direction, MoveType } from "@/lib/itov/types"
import { cn } from "@/lib/utils"

interface MovePickerProps {
  /** Currently picked move (UI-relative or absolute — caller decides). */
  move: MoveType | null
  /** Currently picked direction (UI-relative). */
  direction: Direction | null
  onSelectMove: (move: MoveType) => void
  onSelectDirection: (direction: Direction) => void
  onClear?: () => void
  /** Title shown above (e.g., the piece color). */
  title?: string
}

/**
 * Two-step picker: choose a move type, then a UI direction.
 * The direction wheel uses the player's own perspective (up = toward opponent).
 */
export function MovePicker({
  move,
  direction,
  onSelectMove,
  onSelectDirection,
  onClear,
  title,
}: MovePickerProps) {
  return (
    <div className="border-border bg-surface/70 flex flex-col gap-4 rounded border p-4 backdrop-blur-sm">
      {title && (
        <div className="font-display text-foreground-dim flex items-center justify-between text-[10px] tracking-[0.32em] uppercase">
          <span>{title}</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Move row */}
      <div className="grid grid-cols-4 gap-2">
        {ALL_MOVES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMove(m)}
            className={cn(
              "font-display flex h-12 items-center justify-center rounded-sm border text-[10px] tracking-[0.3em] uppercase transition-colors",
              move === m
                ? "border-foreground bg-foreground text-background"
                : "border-border-strong text-foreground-dim hover:text-foreground hover:border-foreground/60",
            )}
            aria-pressed={move === m}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Direction pad */}
      <div className="flex justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          <span />
          <DirButton
            dir="up"
            label="↑"
            active={direction === "up"}
            onClick={() => onSelectDirection("up")}
          />
          <span />
          <DirButton
            dir="left"
            label="←"
            active={direction === "left"}
            onClick={() => onSelectDirection("left")}
          />
          <div className="border-foreground-faint flex size-12 items-center justify-center rounded-full border border-dashed">
            <span className="bg-foreground-faint size-1 rounded-full" />
          </div>
          <DirButton
            dir="right"
            label="→"
            active={direction === "right"}
            onClick={() => onSelectDirection("right")}
          />
          <span />
          <DirButton
            dir="down"
            label="↓"
            active={direction === "down"}
            onClick={() => onSelectDirection("down")}
          />
          <span />
        </div>
      </div>
    </div>
  )
}

function DirButton({
  dir,
  label,
  active,
  onClick,
}: {
  dir: Direction
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Direction ${dir}`}
      aria-pressed={active}
      className={cn(
        "flex size-12 items-center justify-center rounded-sm border text-lg transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-foreground-dim hover:text-foreground hover:border-foreground/60",
      )}
    >
      {label}
    </button>
  )
}
