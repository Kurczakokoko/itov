"use client"

import { useState } from "react"
import { useGame } from "@/lib/itov/store"
import { ItovLogo } from "@/components/itov/itov-logo"
import { ItovButton } from "@/components/itov/itov-button"
import { CourseScreen } from "@/components/itov/screens/course-screen"

export function LandingScreen() {
  const { host, goJoin, local } = useGame()
  const [courseOpen, setCourseOpen] = useState(false)

  if (courseOpen) {
    return <CourseScreen onClose={() => setCourseOpen(false)} />
  }

  return (
    <main className="ritual-grain relative flex min-h-svh flex-col items-center justify-between px-6 py-10">
      <div className="animate-itov-fade-in flex w-full max-w-md flex-1 flex-col items-center justify-center gap-12">
        <ItovLogo className="w-72 md:w-96" priority />

        <div className="flex w-full flex-col items-stretch gap-4">
          <ItovButton onClick={() => void host()} aria-label="Host a new match">
            Host
          </ItovButton>
          <ItovButton onClick={goJoin} aria-label="Join an existing match">
            Join
          </ItovButton>
          <ItovButton
            variant="ghost"
            onClick={() => setCourseOpen(true)}
            aria-label="Open the how-to-play course"
          >
            Course
          </ItovButton>
          {local.lastError && (
            <div className="font-display text-destructive mt-2 text-center text-[10px] tracking-[0.3em] uppercase">
              {local.lastError}
            </div>
          )}
        </div>
      </div>

      <div className="text-foreground-faint pointer-events-none select-none text-[10px] tracking-[0.3em] uppercase">
        ITOV · v1.0
      </div>
    </main>
  )
}
