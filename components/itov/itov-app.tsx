"use client"

import { GameProvider, useGame } from "@/lib/itov/store"
import { LandingScreen } from "@/components/itov/screens/landing-screen"
import { HostLobbyScreen } from "@/components/itov/screens/host-lobby-screen"
import { JoinLobbyScreen } from "@/components/itov/screens/join-lobby-screen"
import { BoardScreen } from "@/components/itov/screens/board-screen"
import { RoundScreen } from "@/components/itov/screens/round-screen"
import { ErrorToast } from "@/components/itov/error-toast"
import { ConnectionOverlay } from "@/components/itov/connection-overlay"

export function ItovApp() {
  return (
    <GameProvider>
      <Router />
      <ErrorToast />
      <ConnectionOverlay />
    </GameProvider>
  )
}

function Router() {
  const { local } = useGame()
  switch (local.view) {
    case "landing":
      return <LandingScreen />
    case "host-lobby":
      return <HostLobbyScreen />
    case "join-lobby":
      return <JoinLobbyScreen />
    case "board":
      return <BoardScreen />
    case "round":
    case "match-end":
      return <RoundScreen />
    default:
      return <LandingScreen />
  }
}
