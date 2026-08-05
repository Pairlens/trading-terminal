// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Desktop-app hero: the marble hands presenting the machine, run through the
// same duotone treatment as the sign-in statue so the two dialogs read as one
// family. The treatment itself lives in duotone-image.tsx.
//
// There is one render per platform, and the scene shows the one matching the
// machine you are reading it on — the pitch is "install this HERE", so a Linux
// user being shown a MacBook is a small but real credibility leak. An
// unrecognised OS (a phone, an odd UA) falls back to the macOS frame rather
// than to nothing.
//
// ARTWORK NOTE — how the three desktop-statue-*.webp were prepared, in case
// they are ever regenerated. The source renders are NOT in the repo (1.3 MB of
// PNG each); all three take the identical pipeline, measured rather than
// guessed:
//   1. Trim the dead black above the glow. The subject starts ~23% down in
//      every render, so the top 280px goes, leaving ~55px of headroom above
//      the glow. Keep the FULL width: the glow reaches both edges and the
//      hands are the composition.
//   2. Boost saturation ~1.6x. The duotone pass only routes a pixel to vivid
//      ink when max(r,g,b) > 50 and it clears a saturation smoothstep, and the
//      lid's glow is a soft falloff into black, so most of the rainbow fails
//      the brightness gate and lands on the grey ramp instead. Saturating the
//      SOURCE lifts it over both thresholds without touching the shared
//      treatment, which also drives the sign-in and onboarding art. modulate()
//      scales in HSL, so pure black stays pure black and the ground still
//      alpha-keys cleanly.
//   3. Feather the bottom and both side edges to black. The render was cut by
//      its own frame: the forearms end flat at the bottom and the robes run
//      into the left and right borders. Under `contain` those cuts sit in open
//      panel and read as a mistake, so they are faded out instead — which also
//      drops them under the alpha-key threshold, dissolving the subject into
//      the ground rather than stopping at a hard line.
//   4. Encode webp q88 (48-75 KB; the Linux frame is largest, its stickers
//      carry the most detail).
// The ground must stay pure black: the pass flood-fills from the borders and
// keys it to transparent, which is what lets the subject float frameless.
//
// The Linux frame was expected to need a gentler boost, since its stickers
// give it ~30% more chromatic pixels than the other two (17.4% of bright
// pixels vs 13.2% for macOS). Measured at 1.6x it reads fine — the stickers
// stay legible without going garish — so all three share one setting.

import { cn } from '@pairlens/ui/lib/utils'

import macosUrl from './desktop-statue-macos.webp'
import windowsUrl from './desktop-statue-windows.webp'
import linuxUrl from './desktop-statue-linux.webp'
import type { DesktopOs } from '@/lib/desktop-download'
import { DuotoneImage } from '@/components/duotone-image'

const ARTWORK: Record<DesktopOs, string> = {
  macos: macosUrl,
  windows: windowsUrl,
  linux: linuxUrl,
}

/**
 * The full hero panel: gallery-dark ground, duotone artwork, floor fade, and
 * an iris aurora that lets the content side's glow drift across the seam.
 * Scoped `dark` so it keeps the same look in both color modes, matching
 * SignInStatueScene.
 */
export function DesktopStatueScene({
  os,
  className,
  children,
}: {
  /** Which machine to show. `null` (phone, unknown UA) falls back to macOS. */
  os?: DesktopOs | null
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
      {/* `contain`, not the DuotoneImage default of `cover`. The composition is
          nearly square (two hands framing the machine) while this band is a
          narrow column, so cover crops away both hands and leaves an anonymous
          grey slab. Contain keeps the whole gesture; the ground is alpha-keyed
          to transparent, so the empty band above and below is just panel.
          Sitting at 60% rather than centred puts the subject on the eye line
          and lets the feathered forearms trail into the floor fade. */}
      <DuotoneImage
        src={ARTWORK[os ?? 'macos']}
        className="absolute inset-0 object-contain object-[50%_60%]"
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
