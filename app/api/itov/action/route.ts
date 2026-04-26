import { NextResponse } from "next/server"
import {
  ackResolution,
  continueFromRound,
  createRoom,
  getPublicState,
  joinRoom,
  leaveRoom,
  rematch,
  setJoinerReady,
  startMatch,
  submitSelections,
} from "@/lib/itov/server-store"
import type { Selections } from "@/lib/itov/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ActionBody {
  action:
    | "host"
    | "join"
    | "ready"
    | "start"
    | "submit"
    | "ack"
    | "continue"
    | "rematch"
    | "leave"
  code?: string
  clientId: string
  selections?: Selections
}

function normCode(code: string | undefined): string | null {
  if (!code) return null
  const c = code.trim().toUpperCase()
  return c.length ? c : null
}

export async function POST(req: Request) {
  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { action, clientId } = body
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 })
  }

  console.log("[v0][itov] POST", { action, clientId, code: body.code })

  switch (action) {
    case "host": {
      const room = createRoom(clientId)
      return NextResponse.json({
        ok: true,
        code: room.code,
        role: "A",
        state: getPublicState(room.code, clientId),
      })
    }

    case "join": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const result = joinRoom(code, clientId)
      if (!result.ok) {
        // 400 instead of 404 so SWR doesn't treat it as a "room gone" signal
        // for an unrelated, polled room. The client surfaces this via toast.
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        code: result.room.code,
        role: result.role,
        state: getPublicState(result.room.code, clientId),
      })
    }

    case "ready": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const room = setJoinerReady(code, clientId)
      if (!room) {
        return NextResponse.json({ error: "Not allowed" }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(room.code, clientId),
      })
    }

    case "start": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const result = startMatch(code, clientId)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(result.room.code, clientId),
      })
    }

    case "submit": {
      const code = normCode(body.code)
      if (!code || !body.selections) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 })
      }
      const result = submitSelections(code, clientId, body.selections)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(result.room.code, clientId),
      })
    }

    case "ack": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const room = ackResolution(code, clientId)
      if (!room) {
        return NextResponse.json({ error: "Not allowed" }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(room.code, clientId),
      })
    }

    case "continue": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const room = continueFromRound(code, clientId)
      if (!room) {
        return NextResponse.json({ error: "Not allowed" }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(room.code, clientId),
      })
    }

    case "rematch": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      const room = rematch(code, clientId)
      if (!room) {
        return NextResponse.json({ error: "Not allowed" }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        state: getPublicState(room.code, clientId),
      })
    }

    case "leave": {
      const code = normCode(body.code)
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
      }
      leaveRoom(code, clientId)
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
}
