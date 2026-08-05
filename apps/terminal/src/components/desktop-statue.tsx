// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Desktop-app hero: the marble hands presenting the machine, run through the
// same duotone treatment as the sign-in statue so the two dialogs read as one
// family. The treatment itself lives in duotone-image.tsx.
//
// ARTWORK NOTE: `desktop-statue.webp` is currently a stand-in copy of
// `sign-in-statue.webp`. Dropping the marble-hands render at that exact path
// is the only change needed — the artwork wants a pure black ground (the
// duotone pass alpha-keys it so the subject floats frameless) and reads best
// with its chromatic accents intact, since those are what the vivid-ink pass
// turns into the rainbow.

import { cn } from '@pairlens/ui/lib/utils'

import statueUrl from './desktop-statue.webp'
import { DuotoneImage } from '@/components/duotone-image'

/**
 * The full hero panel: gallery-dark ground, duotone artwork, floor fade, and
 * an iris aurora that lets the content side's glow drift across the seam.
 * Scoped `dark` so it keeps the same look in both color modes, matching
 * SignInStatueScene.
 */
export function DesktopStatueScene({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'dark relative overflow-hidden bg-background text-sidebar-foreground',
        className,
      )}
    >
      <DuotoneImage
        src={statueUrl}
        className="absolute inset-0 object-[50%_35%]"
      />

      {/* Fade the artwork toward the panel floor, using the (dark-scoped)
          background so theme plugins recolor ground and artwork together. */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background/85 via-background/35 to-transparent" />

      {/* Continuation of the content side's glow so it drifts across the seam
          instead of dying at the panel edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[8%] -right-[12%] h-[48%] w-[46%] rounded-full opacity-20 blur-[100px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .45), transparent 68%)',
        }}
      />

      {children}
    </div>
  )
}
