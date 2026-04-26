"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "ghost" | "danger"

interface ItovButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** When true, button is dim and not interactive. */
  inactive?: boolean
}

/**
 * The single button language for ITOV. Sharp corners, occult-ritual lettering,
 * a single accent color that lights up when interactive.
 */
export const ItovButton = React.forwardRef<HTMLButtonElement, ItovButtonProps>(
  (
    {
      className,
      variant = "primary",
      inactive = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDim = inactive || disabled

    const base =
      "font-display relative inline-flex h-14 select-none items-center justify-center px-8 text-sm font-semibold uppercase tracking-[0.32em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"

    const variants: Record<Variant, string> = {
      primary: cn(
        // Live state: cream border, cream text, hover fills with cream
        "border bg-transparent",
        isDim
          ? "border-foreground-faint text-foreground-faint"
          : "border-foreground text-foreground hover:bg-foreground hover:text-background active:bg-foreground/90",
      ),
      ghost: cn(
        "border-0 bg-transparent",
        isDim
          ? "text-foreground-faint"
          : "text-foreground-dim hover:text-foreground",
      ),
      danger: cn(
        "border bg-transparent",
        isDim
          ? "border-foreground-faint text-foreground-faint"
          : "border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground",
      ),
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], className)}
        disabled={isDim}
        aria-disabled={isDim}
        {...props}
      >
        {children}
      </button>
    )
  },
)
ItovButton.displayName = "ItovButton"
