// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Sign-in hero: the Pairlens statue as a smooth iris duotone with vivid
// rainbow lenses. The treatment itself lives in duotone-image.tsx.

import { cn } from '@pairlens/ui/lib/utils'

import statueUrl from './sign-in-statue.webp'
import { DuotoneImage } from '@/components/duotone-image'

/**
 * The full statue panel: gallery-dark ground, duotone statue, floor fade,
 * and the magenta aurora continuation that lets the form side's glow drift
 * across the seam. Scoped `dark` so it keeps the same look in both color
 * modes. Shared by the /sign-in page and the sign-in dialog; extra content
 * (the page's benefits card) rides in as children.
 */
export function SignInStatueScene({
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
      <SignInStatue className="absolute inset-0" />

      {/* Fade the artwork toward the panel floor. Uses the (dark-scoped)
          background so active theme plugins recolor the ground with the
          artwork — the duotone ramp reads the same scoped variables. */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background/85 via-background/35 to-transparent" />

      {/* Continuation of the form side's magenta aurora so its glow drifts
          across the seam instead of dying at the panel edge. */}
      <div
        aria-hidden
        className="pl-si-aurora pointer-events-none absolute -bottom-[8%] -right-[12%] h-[48%] w-[46%] rounded-full opacity-20 blur-[100px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .45), transparent 68%)',
        }}
      />

      {children}
    </div>
  )
}

/** The duotone statue image, cropped toward the face by default. */
export function SignInStatue({ className }: { className?: string }) {
  return (
    <DuotoneImage
      src={statueUrl}
      className={cn('object-[50%_20%]', className)}
    />
  )
}
