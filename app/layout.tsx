import type { Metadata, Viewport } from "next"
import { Cinzel, Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cinzel",
  display: "swap",
})

export const metadata: Metadata = {
  title: "ITOV — First to Five",
  description:
    "A 1v1 game of reads. Four moves, four directions. First to five rounds wins the match.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#17282a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cinzel.variable} bg-background`}
    >
      <body className="font-sans antialiased text-foreground min-h-screen">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
