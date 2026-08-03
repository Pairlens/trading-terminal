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
        className="absolute left-1/2 top-[-6%] h-[46%] w-[min(1100px,80vw)] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{
          background:
            'radial-gradient(closest-side, var(--primary), transparent 72%)',
        }}
      />

      {/* The statue itself — near full-bleed so the face dominates the top
          of the frame the way the landing page opens. */}
      <div
        className="absolute left-1/2 top-[-7%] aspect-[1600/901] w-[min(1560px,140vw)] -translate-x-1/2"
        style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
      >
        <DuotoneImage src={statueUrl} />
      </div>

      <div className="absolute inset-0" style={{ background: GROUND_WASH }} />
    </div>
  )
}
