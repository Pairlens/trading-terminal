// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Real venue/exchange logo on a uniform light "app-icon" tile — the logos
// come from mixed sources (some transparent, some white/dark backgrounds), so a
// consistent light tile normalizes them. Venues without a bundled logo (e.g.
// Alpaca) fall back to a brand-hued monogram on the same tile. Dependency-free
// so Astro can render it statically (zero JS) in the marquee and the React
// slot-machine / affiliate islands can reuse it verbatim.

import { LOGO_IDS } from '@/lib/site'

interface VenueIconProps {
  /** Matches `public/venues/<id>.png`. */
  id: string
  name: string
  mono: string
  hue: string
  size?: number
  radius?: number
  className?: string
}

export function VenueIcon({
  id,
  name,
  mono,
  hue,
  size = 36,
  radius = 10,
  className = '',
}: VenueIconProps) {
  const hasLogo = LOGO_IDS.has(id)
  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#f4f4f5',
        boxShadow:
          'inset 0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      {hasLogo ? (
        <img
          src={`/venues/${id}.png`}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          style={{ padding: Math.round(size * 0.18) }}
        />
      ) : (
        <span
          className="font-mono font-semibold leading-none"
          style={{
            fontSize: size * (mono.length > 1 ? 0.34 : 0.42),
            color: `color-mix(in oklch, ${hue} 60%, black)`,
          }}
          aria-hidden="true"
        >
          {mono}
        </span>
      )}
    </span>
  )
}
