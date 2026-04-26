import { NextResponse } from "next/server"
import { getPublicState } from "@/lib/itov/server-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const clientId = searchParams.get("clientId")
  if (!code || !clientId) {
    return NextResponse.json(
      { error: "Missing code or clientId" },
      { status: 400 },
    )
  }
  try {
    const state = await getPublicState(code, clientId)
    if (!state) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }
    return NextResponse.json(state)
  } catch (err) {
    console.error("[v0][itov] state error", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    )
  }
}
