// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Brand-hued monogram chip. Presentational and dependency-free so Astro can
// render it statically (zero JS) in the marquee, and the slot-machine island
// can reuse the exact same mark. We render clean monograms rather than remote
// logos — faster, private, and no third-party trademark assets to ship.

interface VenueMarkProps {
  mono: string
  hue: string
  size?: number
  radius?: number
  className?: string
}

export function VenueMark({
  mono,
  hue,
  size = 36,
  radius = 10,
  className = '',
}: VenueMarkProps) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center font-mono font-semibold leading-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * (mono.length > 1 ? 0.34 : 0.42),
        color: hue,
        background: `color-mix(in oklch, ${hue} 18%, transparent)`,
        border: `1px solid color-mix(in oklch, ${hue} 32%, transparent)`,
        boxShadow: `inset 0 1px 0 color-mix(in oklch, white 10%, transparent)`,
      }}
      aria-hidden="true"
    >
      {mono}
    </span>
  )
}
