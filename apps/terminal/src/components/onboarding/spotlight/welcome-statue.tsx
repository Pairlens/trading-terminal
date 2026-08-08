// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Welcome-frame hero: the Pairlens statue, big — the marketing landing's
// opening shot translated into the spotlight. The duotone treatment maps the
// artwork onto the active theme's own palette (components/duotone-image.tsx),
// so its ground IS the page background in every mode and no vignette box is
// needed; only a bottom wash seats the headline copy.

import { cn } from '@pairlens/ui'

import statueUrl from './welcome-statue.webp'
import { DuotoneImage } from '@/components/duotone-image'

/** Side fades so the artwork's edges never cut hard on narrow viewports. */
const EDGE_MASK =
  'linear-gradient(to right, transparent 0, #000 12%, #000 88%, transparent 100%)'

/**
 * Width of the artwork box (its height follows the 1600×901 source aspect).
 * Both terms are floors, and together they keep the hero covering the frame
 * at any window size — an absolute px cap left it floating as an island on
 * large desktop windows: faded side edges and a hard cut across the chest.
 *
 * - `192vh` drives normal windows: 192/1.776 ≈ 108vh tall, so against the
 *   -7% top bleed the artwork's cropped bottom always lands past the fold,
 *   whatever the aspect ratio.
 * - `112vw` takes over on very wide, short windows, where that height is no
 *   longer enough to reach both sides — the artwork keeps bleeding past the
 *   edges, so the side fades read as a vignette instead of a cut.
 */
const HERO_WIDTH = 'max(112vw, 192vh)'

/**
 * The ground wash that seats the stage copy: the page background rises over
 * the statue's chest so the headline never sits on busy marble.
 */
const GROUND_WASH =
  'linear-gradient(to top, var(--background) 8%, color-mix(in oklch, var(--background) 70%, transparent) 30%, transparent 62%)'

/**
 * Mounted for the whole flow (one canvas pass, done during the language
 * step) and revealed only while the welcome frame is on stage — fading and
 * drifting out with the step transition instead of popping.
 */
export function WelcomeStatue({
  active,
  reduceMotion,
}: {
  active: boolean
  reduceMotion: boolean
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-[1] overflow-hidden ease-[cubic-bezier(.22,1,.36,1)]',
        active ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: reduceMotion ? '220ms' : '820ms',
        transform: reduceMotion || active ? 'none' : 'scale(1.035)',
      }}
    >
      {/* Glow seated behind the head — the marketing hero's halo, in the
          active theme's primary. */}
      <div
        // A 120px blur over a viewport-spanning box is real tile memory on a
        // phone GPU, and the source is already a radial gradient with a soft
        // falloff — below the mobile breakpoint 48px reads the same and costs
        // a fraction. Desktop keeps the wide halo.
        className="absolute left-1/2 top-[-6%] h-[46%] w-[min(1100px,80vw)] -translate-x-1/2 rounded-full opacity-25 blur-[120px] max-md:blur-[48px]"
        style={{
          background:
            'radial-gradient(closest-side, var(--primary), transparent 72%)',
        }}
      />

      {/* The statue itself — full-bleed so the face dominates the top of the
          frame the way the landing page opens. */}
      <div
        className="absolute left-1/2 top-[-7%] aspect-[1600/901] -translate-x-1/2"
        style={{
          width: HERO_WIDTH,
          maskImage: EDGE_MASK,
          WebkitMaskImage: EDGE_MASK,
        }}
      >
        <DuotoneImage src={statueUrl} />
      </div>

      <div className="absolute inset-0" style={{ background: GROUND_WASH }} />
    </div>
  )
}
