"use client"

import { useEffect, useRef, useState } from "react"
import { BOARD_H, BOARD_W } from "@/lib/itov/constants"
import { toScreenCoord } from "./coords"
import { PieceToken } from "./piece-token"
import type { Direction, MoveType, Piece, PlayerId } from "@/lib/itov/types"

export interface BoardGridProps {
  pieces: Piece[]
  viewerRole: PlayerId
  queuedMoves?: Record<string, { move: MoveType; direction: Direction } | null>
  selectedPieceId?: string | null
  eliminatingIds?: Set<string>
  unassignedIds?: Set<string>
  onPieceClick?: (piece: Piece) => void
}

export function BoardGrid({
  pieces,
  viewerRole,
  queuedMoves,
  selectedPieceId,
  eliminatingIds,
  unassignedIds,
  onPieceClick,
}: BoardGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [cellSize, setCellSize] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const cell = Math.floor(w / BOARD_W)
      if (cell > 0) setCellSize(cell)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const innerW = cellSize * BOARD_W
  const innerH = cellSize * BOARD_H

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full"
      style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}
    >
      {cellSize > 0 && (
        <div
          className="absolute inset-0 mx-auto"
          style={{ width: innerW, height: innerH }}
        >
          <GridLines cellSize={cellSize} />
          {pieces.map((p) => {
            if (!p.alive && !eliminatingIds?.has(p.id)) return null
            const { sx, sy } = toScreenCoord(viewerRole, p.x, p.y)
            const left = sx * cellSize
            const top = sy * cellSize
            const queued = queuedMoves?.[p.id] ?? null
            const isSelf = p.owner === viewerRole
            return (
              <div
                key={p.id}
                className="absolute transition-all duration-300 ease-out"
                style={{
                  left,
                  top,
                  width: cellSize,
                  height: cellSize,
                }}
              >
                <PieceToken
                  piece={p}
                  viewerRole={viewerRole}
                  queuedMove={queued}
                  selected={selectedPieceId === p.id}
                  unassigned={isSelf && unassignedIds?.has(p.id)}
                  eliminating={eliminatingIds?.has(p.id)}
                  onClick={
                    isSelf && onPieceClick && p.alive
                      ? () => onPieceClick(p)
                      : undefined
                  }
                  size={cellSize}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GridLines({ cellSize }: { cellSize: number }) {
  const w = cellSize * BOARD_W
  const h = cellSize * BOARD_H
  const lines: React.ReactElement[] = []
  for (let i = 1; i < BOARD_W; i++) {
    lines.push(
      <line
        key={`v-${i}`}
        x1={i * cellSize}
        y1={0}
        x2={i * cellSize}
        y2={h}
        stroke="var(--border)"
        strokeWidth={1}
      />,
    )
  }
  for (let j = 1; j < BOARD_H; j++) {
    lines.push(
      <line
        key={`h-${j}`}
        x1={0}
        y1={j * cellSize}
        x2={w}
        y2={j * cellSize}
        stroke="var(--border)"
        strokeWidth={1}
      />,
    )
  }
  return (
    <svg
      className="absolute inset-0"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        fill="transparent"
        stroke="var(--border-strong)"
        strokeWidth={1}
      />
      {lines}
    </svg>
  )
}
