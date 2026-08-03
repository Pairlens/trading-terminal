// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Welcome-frame hero: the Pairlens statue as a gallery backdrop behind the
// first headline, in the same duotone language as the sign-in scene. The
// treatment itself lives in components/duotone-image.tsx.

import { cn } from '@pairlens/ui'

import statueUrl from './welcome-statue.webp'
import { DuotoneImage } from '@/components/duotone-image'

/**
 * Elliptical falloff centered on the bust. The artwork's ground is pure
 * black, so without this it would read as a pasted rectangle over the
 * onboarding page's warm-graphite (dark) or paper (light) ground — the mask
 * dissolves every edge into whatever `--background` happens to be.
 */
const STATUE_MASK =
  'radial-gradient(64% 58% at 50% 34%, #000 24%, rgba(0,0,0,.5) 54%, transparent 88%)'

/**
 * The ground wash that seats the stage copy: the page background rises over
 * the statue's chest so the headline never sits on busy marble.
 */
const GROUND_WASH =
  'linear-gradient(to top, var(--background) 30%, color-mix(in oklch, var(--background) 78%, transparent) 55%, transparent 88%)'

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
      <div
        className="absolute left-1/2 top-[2%] aspect-[1600/901] w-[min(1040px,106vw)] -translate-x-1/2 bg-black"
        style={{ maskImage: STATUE_MASK, WebkitMaskImage: STATUE_MASK }}
      >
        <DuotoneImage src={statueUrl} className="opacity-90" />
      </div>

      <div className="absolute inset-0" style={{ background: GROUND_WASH }} />
    </div>
  )
}
