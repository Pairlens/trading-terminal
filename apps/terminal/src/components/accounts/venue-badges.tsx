// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { cn } from '@pairlens/ui'

import { EXCHANGE_THEME } from './exchange-theme'
import { chainBrand, chainPosterSrc, venuePosterSrc } from './venue-art'
import { usePairlens } from '@/lib/pairlens-provider'

// ---------------------------------------------------------------------------
// Exchange badge
// ---------------------------------------------------------------------------

export function ExchangeBadge({ market }: { market: string }) {
  const { pluginManager } = usePairlens()

  // Bundled high-res marks first — same art the Plugin Store posters use
  const poster = venuePosterSrc(market)
  if (poster) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/85">
        <img
          src={poster}
          alt={market.toUpperCase()}
          className="size-6 rounded-sm object-contain"
        />
      </span>
    )
  }

  // Then static theme, then plugin manifest metadata
  let theme = EXCHANGE_THEME[market]
  if (!theme) {
    const plugin = pluginManager
      .getInstalledPlugins()
      .find(
        (p) =>
          p.manifest.id === `${market}-market-connector` ||
          p.manifest.id === `${market}-dex-connector`,
      )
    const meta = plugin?.manifest.metadata as Record<string, string> | undefined
    if (meta) {
      theme = {
        gradient: meta.gradient ?? 'from-gray-500 to-gray-600',
        accent: 'text-white',
        abbr: meta.abbr ?? market.slice(0, 3).toUpperCase(),
        logoUrl: meta.logoUrl,
        headerImage: meta.headerImage,
      }
    }
  }

  if (!theme) return null
  if (theme.logoUrl) {
    return (
      <img
        src={theme.logoUrl}
        alt={theme.abbr}
        className="size-9 shrink-0 rounded-lg object-contain"
      />
    )
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold tracking-tight',
        theme.gradient,
        theme.accent,
      )}
    >
      {theme.abbr}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chain badge
// ---------------------------------------------------------------------------

export function ChainBadge({
  chain,
  className,
}: {
  chain: string
  className?: string
}) {
  const poster = chainPosterSrc(chain)
  if (poster) {
    return (
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/85',
          className,
        )}
      >
        <img
          src={poster}
          alt={chain}
          className="size-6 rounded-sm object-contain"
        />
      </span>
    )
  }

  const brand = chainBrand(chain)
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-white',
        className,
      )}
      style={{ background: brand.tint }}
    >
      {brand.mono}
    </div>
  )
}
