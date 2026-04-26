import Image from "next/image"
import { cn } from "@/lib/utils"

interface ItovLogoProps {
  /** Tailwind size classes — e.g. "w-72 md:w-96". */
  className?: string
  priority?: boolean
}

/**
 * The ITOV logo — a horizontal diamond glyph with the four-move interaction
 * graph rendered as occult lettering. Anchor of every screen.
 */
export function ItovLogo({ className, priority = false }: ItovLogoProps) {
  return (
    <div className={cn("relative", className)} role="img" aria-label="ITOV logo">
      <Image
        src="/itov-logo.png"
        alt="ITOV — interaction graph of the four moves"
        width={1500}
        height={1000}
        priority={priority}
        className="h-auto w-full select-none"
        draggable={false}
      />
    </div>
  )
}
