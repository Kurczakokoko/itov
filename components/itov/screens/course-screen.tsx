"use client"

import { useCallback, useEffect, useState } from "react"
import { ItovButton } from "@/components/itov/itov-button"
import { cn } from "@/lib/utils"

// ---------- Visual primitives ----------
//
// Mini-board cells and pieces built from the same primitives as the live game
// (colored squares with cream arrow indicators) so the course reads as a
// continuation of the game's visual language, not a separate manual.

type PieceColor = "blue" | "green" | "olive" | "red"
type Direction = "up" | "down" | "left" | "right"
type MoveType = "hold" | "strike" | "feint" | "advance"

interface DiagramPiece {
  /** 0-based column from the left of the diagram. */
  x: number
  /** 0-based row from the top of the diagram. */
  y: number
  color: PieceColor
  /** True for "you" (saturated), false for opponent (desaturated). */
  own?: boolean
  /** If set, draws an arrow indicator in this direction. */
  arrow?: Direction
  /** Visual length of the indicator. Defaults based on `move`. */
  move?: MoveType
  /** Render as eliminated (X overlay, dim). */
  dead?: boolean
  /** Highlight the cell underneath. */
  highlight?: "good" | "bad" | "neutral"
}

interface MiniBoardProps {
  cols: number
  rows: number
  pieces: DiagramPiece[]
  /** Optional caption rendered under the board. */
  caption?: string
  /** Pixel size of one cell. Defaults to 36. */
  cell?: number
  /** Highlight individual cells (no piece) — useful for showing attack tiles. */
  attackTiles?: { x: number; y: number; tone?: "good" | "bad" }[]
}

const PIECE_FILL: Record<PieceColor, string> = {
  blue: "var(--piece-blue)",
  green: "var(--piece-green)",
  olive: "var(--piece-olive)",
  red: "var(--piece-red)",
}
const PIECE_FILL_OPP: Record<PieceColor, string> = {
  blue: "var(--piece-blue-opp)",
  green: "var(--piece-green-opp)",
  olive: "var(--piece-olive-opp)",
  red: "var(--piece-red-opp)",
}

// Same rotation table as the live PieceToken: indicator natively points DOWN,
// CSS rotate is CW on screen, so 90° = west, 270° = east.
const ROT_DEG: Record<Direction, number> = {
  down: 0,
  left: 90,
  up: 180,
  right: 270,
}

function MiniBoard({
  cols,
  rows,
  pieces,
  caption,
  cell = 36,
  attackTiles,
}: MiniBoardProps) {
  const width = cols * cell
  const height = rows * cell

  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className="border-border-strong bg-surface relative rounded-sm border"
        style={{ width, height }}
        aria-hidden
      >
        {/* Grid lines */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)`,
            backgroundSize: `${cell}px ${cell}px`,
            opacity: 0.6,
          }}
        />

        {/* Attack-tile highlights (drawn under pieces) */}
        {attackTiles?.map((t, i) => (
          <div
            key={`atk-${i}`}
            className="absolute"
            style={{
              left: t.x * cell,
              top: t.y * cell,
              width: cell,
              height: cell,
              background:
                t.tone === "good"
                  ? "color-mix(in oklab, var(--accent) 30%, transparent)"
                  : "color-mix(in oklab, var(--destructive) 28%, transparent)",
            }}
          />
        ))}

        {/* Pieces */}
        {pieces.map((p, i) => (
          <DiagramToken
            key={`p-${i}`}
            piece={p}
            cell={cell}
          />
        ))}
      </div>
      {caption && (
        <figcaption className="font-display text-foreground-dim text-center text-[10px] tracking-[0.3em] uppercase">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

function DiagramToken({
  piece,
  cell,
}: {
  piece: DiagramPiece
  cell: number
}) {
  const fill = piece.own
    ? PIECE_FILL[piece.color]
    : PIECE_FILL_OPP[piece.color]
  const bodySize = Math.round(cell * 0.62)
  const left = piece.x * cell + (cell - bodySize) / 2
  const top = piece.y * cell + (cell - bodySize) / 2

  // Arrow length scales with move type (matches live game proportions).
  let extension = 0
  if (piece.arrow) {
    if (piece.move === "advance") extension = Math.round(cell * 0.85)
    else if (piece.move === "strike" || piece.move === "feint")
      extension = Math.round(cell * 0.5)
    else extension = Math.round(cell * 0.18) // hold or default
  }
  const indicatorHeight = extension + Math.round(cell * 0.16)

  // Highlight tone behind the piece.
  let highlightStyle: React.CSSProperties | null = null
  if (piece.highlight) {
    const color =
      piece.highlight === "good"
        ? "var(--accent)"
        : piece.highlight === "bad"
          ? "var(--destructive)"
          : "var(--foreground)"
    highlightStyle = {
      left: piece.x * cell + 2,
      top: piece.y * cell + 2,
      width: cell - 4,
      height: cell - 4,
      border: `1px solid ${color}`,
      opacity: 0.7,
      borderRadius: 4,
    }
  }

  return (
    <>
      {highlightStyle && (
        <div className="pointer-events-none absolute" style={highlightStyle} />
      )}

      {/* Arrow indicator (drawn from piece center) */}
      {piece.arrow && (
        <span
          className="pointer-events-none absolute"
          style={{
            left: piece.x * cell + cell / 2,
            top: piece.y * cell + cell / 2,
            width: 2,
            height: indicatorHeight,
            transformOrigin: "50% 0%",
            transform: `translate(-50%, 0) rotate(${ROT_DEG[piece.arrow]}deg)`,
          }}
        >
          <span
            className="absolute inset-x-0 mx-auto block w-px"
            style={{
              top: 0,
              height: "100%",
              background:
                "linear-gradient(to bottom, transparent 0%, var(--foreground) 100%)",
              opacity: 0.85,
            }}
          />
          <span
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: -1,
              width: 0,
              height: 0,
              borderLeft: "3px solid transparent",
              borderRight: "3px solid transparent",
              borderTop: "5px solid var(--foreground)",
            }}
          />
        </span>
      )}

      {/* Piece body */}
      <div
        className="absolute"
        style={{
          left,
          top,
          width: bodySize,
          height: bodySize,
          background: fill,
          borderRadius: 4,
          border: "1px solid var(--foreground)",
          boxShadow: "inset 0 0 0 1px rgba(238,226,205,0.18)",
          opacity: piece.dead ? 0.18 : 1,
        }}
      />
      {/* Center dot */}
      <div
        className="absolute size-1 rounded-full"
        style={{
          left: piece.x * cell + cell / 2 - 2,
          top: piece.y * cell + cell / 2 - 2,
          background: piece.own
            ? "var(--foreground)"
            : "var(--foreground-dim)",
          opacity: piece.dead ? 0.2 : 1,
        }}
      />
      {/* Eliminated X */}
      {piece.dead && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: piece.x * cell,
            top: piece.y * cell,
            width: cell,
            height: cell,
          }}
        >
          <span
            className="font-display text-destructive text-base"
            aria-hidden
          >
            ×
          </span>
        </div>
      )}
    </>
  )
}

// ---------- Course steps ----------

interface CourseStep {
  /** "1 / 9" label. */
  index: number
  /** Short eyebrow, ALL CAPS. */
  eyebrow: string
  /** Main heading. */
  title: string
  /** One- or two-sentence body (plain copy). */
  body: string
  /** Diagram component. */
  diagram: React.ReactNode
}

function buildSteps(): CourseStep[] {
  return [
    // 1. Goal
    {
      index: 1,
      eyebrow: "The Goal",
      title: "First to five rounds.",
      body:
        "ITOV is a 1v1 duel of pure prediction. Win five rounds before your opponent does. No randomness. No upgrades. Only reads.",
      diagram: (
        <MiniBoard
          cols={9}
          rows={6}
          cell={28}
          pieces={[
            { x: 1, y: 0, color: "blue", own: false },
            { x: 3, y: 0, color: "green", own: false },
            { x: 5, y: 0, color: "olive", own: false },
            { x: 7, y: 0, color: "red", own: false },
            { x: 1, y: 5, color: "blue", own: true },
            { x: 3, y: 5, color: "green", own: true },
            { x: 5, y: 5, color: "olive", own: true },
            { x: 7, y: 5, color: "red", own: true },
          ]}
          caption="You vs them — four pieces each"
        />
      ),
    },

    // 2. The Exchange
    {
      index: 2,
      eyebrow: "The Exchange",
      title: "Both players move at once.",
      body:
        "Each exchange, both players secretly assign one move and one direction to every piece. A 30-second timer counts down. When it hits zero, everything reveals at the same time.",
      diagram: (
        <div className="flex flex-col items-center gap-4">
          <MiniBoard
            cols={5}
            rows={5}
            cell={36}
            pieces={[
              { x: 1, y: 0, color: "blue", own: false, arrow: "down", move: "advance" },
              { x: 3, y: 0, color: "red", own: false, arrow: "down", move: "strike" },
              { x: 1, y: 4, color: "blue", own: true, arrow: "up", move: "feint" },
              { x: 3, y: 4, color: "red", own: true, arrow: "up", move: "hold" },
            ]}
            caption="All four pieces queued — reveal imminent"
          />
          <div className="border-border bg-surface/60 font-display text-foreground-dim flex items-center gap-3 rounded-sm border px-4 py-2 text-[10px] tracking-[0.32em] uppercase">
            <span className="bg-accent size-2 rounded-full" />
            <span>30s timer · default = Hold</span>
          </div>
        </div>
      ),
    },

    // 3. Hold
    {
      index: 3,
      eyebrow: "Move 1 of 4",
      title: "Hold — stay and block.",
      body:
        "The piece does not move. It blocks any incoming attack from the chosen direction. A Hold facing the wrong way is dead weight.",
      diagram: (
        <MiniBoard
          cols={3}
          rows={3}
          cell={56}
          pieces={[
            { x: 1, y: 1, color: "olive", own: true, arrow: "up", move: "hold" },
          ]}
          caption="Stationary · defends upward only"
        />
      ),
    },

    // 4. Strike
    {
      index: 4,
      eyebrow: "Move 2 of 4",
      title: "Strike — step in and hit.",
      body:
        "Move one tile forward and attack the tile you stepped into. Clean, single-target.",
      diagram: (
        <MiniBoard
          cols={3}
          rows={4}
          cell={56}
          pieces={[
            { x: 1, y: 2, color: "blue", own: true, arrow: "up", move: "strike" },
          ]}
          attackTiles={[{ x: 1, y: 1, tone: "good" }]}
          caption="Moves 1 tile · attacks that tile"
        />
      ),
    },

    // 5. Feint
    {
      index: 5,
      eyebrow: "Move 3 of 4",
      title: "Feint — strike without stepping.",
      body:
        "The piece stays put and attacks the tile directly in front of it. Feints punish opponents who try to walk into you.",
      diagram: (
        <MiniBoard
          cols={3}
          rows={4}
          cell={56}
          pieces={[
            { x: 1, y: 2, color: "green", own: true, arrow: "up", move: "feint" },
          ]}
          attackTiles={[{ x: 1, y: 1, tone: "good" }]}
          caption="Doesn't move · attacks tile in front"
        />
      ),
    },

    // 6. Advance
    {
      index: 6,
      eyebrow: "Move 4 of 4",
      title: "Advance — sweep two tiles.",
      body:
        "Move two tiles and attack everything along the way. The only move that can take down two pieces in a single exchange.",
      diagram: (
        <MiniBoard
          cols={3}
          rows={5}
          cell={56}
          pieces={[
            { x: 1, y: 3, color: "red", own: true, arrow: "up", move: "advance" },
          ]}
          attackTiles={[
            { x: 1, y: 2, tone: "good" },
            { x: 1, y: 1, tone: "good" },
          ]}
          caption="Moves 2 tiles · attacks both"
        />
      ),
    },

    // 7. The Cycle
    {
      index: 7,
      eyebrow: "The Cycle",
      title: "Every move beats one.",
      body:
        "Strike beats Hold. Hold beats Advance. Advance beats Feint. Feint beats Strike. There is no best move — only the right read.",
      diagram: <CycleDiagram />,
    },

    // 8. Direction Matters
    {
      index: 8,
      eyebrow: "The Depth",
      title: "Direction is everything.",
      body:
        "Every move only works in its chosen direction. Attack a piece from the side it isn't facing, and its defense doesn't apply — you win automatically. Flanking nullifies everything.",
      diagram: (
        <div className="flex flex-col items-center gap-3">
          <MiniBoard
            cols={5}
            rows={3}
            cell={48}
            pieces={[
              // Hold faces UP (toward what it expects)
              { x: 2, y: 1, color: "olive", own: true, arrow: "up", move: "hold" },
              // Advance comes from the LEFT — flanks the Hold
              { x: 0, y: 1, color: "red", own: false, arrow: "right", move: "advance" },
            ]}
            attackTiles={[
              { x: 1, y: 1, tone: "bad" },
              { x: 2, y: 1, tone: "bad" },
            ]}
            caption="Hold faces up · attacked from the left · Hold loses"
          />
        </div>
      ),
    },

    // 9. Resolution Order
    {
      index: 9,
      eyebrow: "Resolution",
      title: "Order: Hold, Strike, Feint, Advance.",
      body:
        "Once both sides reveal, the four phases play out in this fixed order. The order makes the cycle work: Hold locks in first so it can stop a late Advance; Feint fires after Strike has already committed.",
      diagram: <PhaseStripDiagram />,
    },

    // 10. Match Structure
    {
      index: 10,
      eyebrow: "The Match",
      title: "Win the round, then four more.",
      body:
        "A round ends the moment one player has no living pieces left. Pieces reset between rounds; the score does not. First to five round wins takes the match.",
      diagram: <ScoreLadderDiagram />,
    },
  ]
}

// ---------- Bespoke diagrams used above ----------

function CycleDiagram() {
  // Four nodes arranged in a square; arrows show what beats what.
  const nodes = [
    { label: "Strike", x: 0, y: 0, color: "var(--piece-blue)" },
    { label: "Hold", x: 1, y: 0, color: "var(--piece-olive)" },
    { label: "Advance", x: 1, y: 1, color: "var(--piece-red)" },
    { label: "Feint", x: 0, y: 1, color: "var(--piece-green)" },
  ]
  const cell = 86
  const gap = 14
  const w = nodes[0].x * (cell + gap) + cell
  const total = w + (cell + gap)
  return (
    <div
      className="relative"
      style={{ width: total, height: total }}
      aria-hidden
    >
      {/* Arrows: clockwise loop Strike → Hold → Advance → Feint → Strike */}
      {/* top edge: Strike → Hold */}
      <CycleArrow
        from={{ x: 0 + cell, y: cell / 2 }}
        to={{ x: cell + gap, y: cell / 2 }}
      />
      {/* right edge: Hold → Advance */}
      <CycleArrow
        from={{ x: cell + gap + cell / 2, y: cell }}
        to={{ x: cell + gap + cell / 2, y: cell + gap }}
      />
      {/* bottom edge: Advance → Feint */}
      <CycleArrow
        from={{ x: cell + gap, y: cell + gap + cell / 2 }}
        to={{ x: cell, y: cell + gap + cell / 2 }}
      />
      {/* left edge: Feint → Strike */}
      <CycleArrow
        from={{ x: cell / 2, y: cell + gap }}
        to={{ x: cell / 2, y: cell }}
      />

      {nodes.map((n) => (
        <div
          key={n.label}
          className="absolute flex flex-col items-center justify-center gap-1"
          style={{
            left: n.x * (cell + gap),
            top: n.y * (cell + gap),
            width: cell,
            height: cell,
          }}
        >
          <div
            className="size-8"
            style={{
              background: n.color,
              border: "1px solid var(--foreground)",
              borderRadius: 4,
              boxShadow: "inset 0 0 0 1px rgba(238,226,205,0.18)",
            }}
            aria-hidden
          />
          <span className="font-display text-foreground text-[10px] tracking-[0.3em] uppercase">
            {n.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function CycleArrow({
  from,
  to,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
}) {
  // Single straight cream line with a tip at `to`. Works only for axis-aligned segments.
  const horizontal = from.y === to.y
  const length = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y)
  const left = Math.min(from.x, to.x)
  const top = Math.min(from.y, to.y)
  const goingRight = to.x > from.x
  const goingDown = to.y > from.y

  if (horizontal) {
    return (
      <div
        className="pointer-events-none absolute"
        style={{ left, top: top - 0.5, width: length, height: 1 }}
      >
        <div
          className="absolute inset-0"
          style={{ background: "var(--foreground)", opacity: 0.7 }}
        />
        <span
          className="absolute"
          style={{
            top: -3,
            [goingRight ? "right" : "left"]: -1,
            width: 0,
            height: 0,
            borderTop: "3px solid transparent",
            borderBottom: "3px solid transparent",
            [goingRight ? "borderLeft" : "borderRight"]:
              "5px solid var(--foreground)",
          } as React.CSSProperties}
          aria-hidden
        />
      </div>
    )
  }
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: left - 0.5, top, width: 1, height: length }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "var(--foreground)", opacity: 0.7 }}
      />
      <span
        className="absolute"
        style={{
          left: -3,
          [goingDown ? "bottom" : "top"]: -1,
          width: 0,
          height: 0,
          borderLeft: "3px solid transparent",
          borderRight: "3px solid transparent",
          [goingDown ? "borderTop" : "borderBottom"]:
            "5px solid var(--foreground)",
        } as React.CSSProperties}
        aria-hidden
      />
    </div>
  )
}

function PhaseStripDiagram() {
  const phases: { label: string; color: string }[] = [
    { label: "Hold", color: "var(--piece-olive)" },
    { label: "Strike", color: "var(--piece-blue)" },
    { label: "Feint", color: "var(--piece-green)" },
    { label: "Advance", color: "var(--piece-red)" },
  ]
  return (
    <div className="flex items-center gap-2">
      {phases.map((p, i) => (
        <div key={p.label} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-2">
            <div
              className="size-9"
              style={{
                background: p.color,
                border: "1px solid var(--foreground)",
                borderRadius: 4,
                boxShadow: "inset 0 0 0 1px rgba(238,226,205,0.18)",
              }}
              aria-hidden
            />
            <span className="font-display text-foreground text-[9px] tracking-[0.3em] uppercase">
              {p.label}
            </span>
          </div>
          {i < phases.length - 1 && (
            <span
              className="font-display text-foreground-dim text-xs"
              aria-hidden
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ScoreLadderDiagram() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex size-10 items-center justify-center"
            style={{
              border: "1px solid var(--foreground)",
              borderRadius: 4,
              background: i < 3 ? "var(--accent)" : "transparent",
            }}
            aria-hidden
          >
            <span
              className="font-display text-[10px] tracking-[0.2em] uppercase"
              style={{
                color: i < 3 ? "var(--accent-foreground)" : "var(--foreground-dim)",
              }}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <span className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase">
        First to five
      </span>
    </div>
  )
}

// ---------- Screen ----------

interface CourseScreenProps {
  onClose: () => void
}

export function CourseScreen({ onClose }: CourseScreenProps) {
  const steps = buildSteps()
  const total = steps.length
  const [stepIdx, setStepIdx] = useState(0)
  const step = steps[stepIdx]
  const isFirst = stepIdx === 0
  const isLast = stepIdx === total - 1

  const next = useCallback(() => {
    setStepIdx((i) => Math.min(total - 1, i + 1))
  }, [total])
  const prev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1))
  }, [])

  // Keyboard shortcuts: ←/→ to navigate, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, onClose])

  return (
    <main className="ritual-grain relative flex min-h-svh flex-col items-stretch px-6 py-8">
      {/* Top bar: close + progress */}
      <header className="mx-auto flex w-full max-w-md items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close course"
          className="font-display text-foreground-dim hover:text-foreground text-[10px] tracking-[0.32em] uppercase transition-colors"
        >
          ← Back
        </button>
        <div
          className="font-display text-foreground-dim text-[10px] tracking-[0.32em] uppercase tabular-nums"
          aria-label={`Step ${step.index} of ${total}`}
        >
          {String(step.index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </header>

      {/* Step body */}
      <section
        key={step.index}
        className="animate-itov-fade-in mx-auto flex w-full max-w-md flex-1 flex-col items-stretch justify-center gap-8 py-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="font-display text-accent text-[10px] tracking-[0.4em] uppercase">
            {step.eyebrow}
          </span>
          <h1 className="font-display text-foreground text-balance text-2xl leading-tight tracking-[0.06em] uppercase">
            {step.title}
          </h1>
          <p className="text-foreground-dim text-pretty max-w-sm text-sm leading-relaxed">
            {step.body}
          </p>
        </div>

        <div className="flex justify-center">{step.diagram}</div>
      </section>

      {/* Progress dots */}
      <div className="mx-auto mb-6 flex w-full max-w-md justify-center gap-2">
        {steps.map((s, i) => (
          <button
            type="button"
            key={s.index}
            onClick={() => setStepIdx(i)}
            aria-label={`Go to step ${s.index}`}
            aria-current={i === stepIdx}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === stepIdx
                ? "bg-foreground w-6"
                : "bg-foreground-faint hover:bg-foreground-dim w-1.5",
            )}
          />
        ))}
      </div>

      {/* Footer nav */}
      <footer className="mx-auto flex w-full max-w-md items-stretch gap-3">
        <ItovButton
          variant="ghost"
          onClick={prev}
          inactive={isFirst}
          className="flex-1"
          aria-label="Previous step"
        >
          Back
        </ItovButton>
        {isLast ? (
          <ItovButton
            onClick={onClose}
            className="flex-1"
            aria-label="Finish course"
          >
            Begin
          </ItovButton>
        ) : (
          <ItovButton
            onClick={next}
            className="flex-1"
            aria-label="Next step"
          >
            Next
          </ItovButton>
        )}
      </footer>
    </main>
  )
}
