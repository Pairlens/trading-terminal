// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import { POSTER_MORPH } from '../store/store-shell'
import { pluginBrand, pluginPosterSrc } from './plugin-brand'
import { PluginPosterArt } from './plugin-icon'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'
import { isCommunityEntry } from '@/lib/plugins/community-tier'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

/** Entries updated within this window get an "Updated" poster badge. */
const UPDATED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function posterBadge(entry: RegistryPluginEntry): string | null {
  if (!entry.updatedAt) return null
  const age = Date.now() - new Date(entry.updatedAt).getTime()
  if (Number.isNaN(age) || age > UPDATED_WINDOW_MS) return null
  return entry.versions && entry.versions.length > 1 ? 'Updated' : 'New'
}

/**
 * Poster shelf card — 152×188 brand-tint poster with the plugin's brand icon
 * centered on a tile (monogram fallback), an action label, and name + tagline
 * below. The whole card opens the product page.
 */
export function PluginStoreCard({
  entry,
  installed,
  active,
  installing,
  platformBadge,
  layoutId,
  onClick,
}: {
  entry: RegistryPluginEntry
  installed: boolean
  active: boolean
  installing?: boolean
  platformBadge?: string | null
  /** Shared-element id — the poster morphs into the product-page visual. */
  layoutId?: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  const { manifest, tagline } = entry
  const brand = pluginBrand(manifest.id, manifest.name)
  const badge =
    platformBadge ??
    (isCommunityEntry(entry)
      ? t('pluginStore.communityBadge', 'Community')
      : posterBadge(entry))

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
        className="relative flex h-[188px] items-center justify-center overflow-hidden"
        style={{
          borderRadius: 14,
          background: `linear-gradient(160deg, color-mix(in oklch, ${brand.tint} 42%, var(--card)), var(--card))`,
        }}
      >
        <PluginPosterArt
          id={manifest.id}
          name={manifest.name}
          src={pluginPosterSrc(entry)}
        />
        {badge && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur-sm">
            {badge}
          </span>
        )}
        <span
          className={cn(
            'absolute bottom-2.5 right-3 text-[11px] font-semibold',
            installing
              ? 'text-primary'
              : active || installed
                ? 'text-[var(--chart-2)]'
                : 'text-primary',
          )}
        >
          {installing
            ? t('pluginStore.installing', 'Installing…')
            : active || installed
              ? t('pluginStore.installedLabel', 'Installed')
              : t('pluginStore.install', 'Install')}
        </span>
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
