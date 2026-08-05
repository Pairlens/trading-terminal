// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import { POSTER_MORPH } from '../store/store-shell'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'
import { isCommunityEntry } from '@/lib/plugins/community-tier'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

/**
 * Theme palette tile — same 152×188 poster footprint as plugin cards, but the
 * poster is the theme's preview colors as equal vertical stripes.
 */
export function ThemeStoreCard({
  entry,
  active,
  layoutId,
  onClick,
}: {
  entry: RegistryPluginEntry
  active: boolean
  /** Shared-element id — the tile morphs into the product-page palette. */
  layoutId?: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  const { manifest, tagline } = entry
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const colors = manifest.theme?.previewColors
  const swatches = (colors ? (isDark ? colors.dark : colors.light) : []).slice(
    0,
    5,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'pl-store-lift w-[152px] shrink-0 text-left',
        'focus-visible:outline-none focus-visible:[&>div:first-child]:ring-2 focus-visible:[&>div:first-child]:ring-ring',
      )}
    >
      <motion.div
        layoutId={layoutId}
        transition={POSTER_MORPH}
        className="relative flex h-[188px] flex-col overflow-hidden border border-border"
        style={{ borderRadius: 17 }}
      >
        {swatches.map((color, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
        {isCommunityEntry(entry) && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur-sm">
            {t('pluginStore.communityBadge', 'Community')}
          </span>
        )}
        {active && (
          <span className="absolute bottom-2.5 right-3 rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--chart-2)] backdrop-blur-sm">
            {t('pluginStore.applied', 'Applied')}
          </span>
        )}
      </motion.div>
      <p className="mt-2 truncate text-[13px] font-semibold text-foreground">
        {pluginTitle(manifest)}
      </p>
      <p className="truncate text-[11px] text-muted-foreground/80">
        {pluginDescription(manifest) || tagline}
      </p>
    </button>
  )
}
