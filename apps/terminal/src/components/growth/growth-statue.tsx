// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Growth dialog hero: the marble Octocat, run through the same duotone
// treatment as the sign-in statue and the desktop-app hands so all three
// full-bleed dialogs read as one family. The treatment lives in
// duotone-image.tsx.
//
// ARTWORK NOTE — the source render came with a real alpha channel, so the
// prep is lighter than the desktop statues': trim the transparent margins,
// re-add 48px of breathing room, flatten onto pure black (the duotone pass
// flood-fills the ground from the borders and alpha-keys it out; the
// anti-aliased fringe blends toward black, which the keyer's smoothstep
// dissolves cleanly), then webp q88 at 1200px tall (~55 KB).

import { cn } from '@pairlens/ui/lib/utils'

import octocatUrl from './growth-octocat.webp'
import { DuotoneImage } from '@/components/duotone-image'

/**
 * The full hero panel: gallery-dark ground, duotone Octocat, floor fade, and
 * the aurora continuation that lets the content side's glow drift across the
 * seam. Scoped `dark` so it keeps the same look in both color modes,
 * matching SignInStatueScene and DesktopStatueScene.
 */
export function GrowthStatueScene({
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
      {/* `contain`, matching the desktop statue: the statue is a full figure
          on a pedestal while this band is a narrow column, so cover would
          crop it to an anonymous marble slab. The keyed ground makes the
          empty band above and below read as panel. 58% keeps the face on the
          eye line and lets the pedestal sink into the floor fade. */}
      <DuotoneImage
        src={octocatUrl}
        className="absolute inset-0 object-contain object-[50%_58%]"
      />

      {/* Fade the artwork toward the panel floor, using the (dark-scoped)
          background so theme plugins recolor ground and artwork together. */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background/85 via-background/35 to-transparent" />

      {/* Continuation of the content side's glow so it drifts across the
          seam instead of dying at the panel edge. */}
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
