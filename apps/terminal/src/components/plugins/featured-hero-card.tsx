// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'

import { pluginBrand, pluginPosterSrc } from './plugin-brand'
import { PluginBrandTile } from './plugin-icon'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'

const ROTATE_MS = 4800

/**
 * Auto-rotating spotlight hero — the storefront marquee. Cycles through the
 * registry's featured plugins; pauses on hover, while a product page is open,
 * and under reduced motion.
 */
export function SpotlightHero({
  entries,
  categoryLabel,
  isActive,
  busyPluginId,
  paused,
  onInstall,
  onDetails,
}: {
  entries: Array<RegistryPluginEntry>
  categoryLabel: (categoryId: string) => string
  isActive: (pluginId: string) => boolean
  busyPluginId: string | null
  /** External pause (product page open, tab hidden). */
  paused?: boolean
  onInstall: (entry: RegistryPluginEntry) => void
  onDetails: (entry: RegistryPluginEntry) => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const count = entries.length
  const stop = paused || hovered || reduceMotion || count <= 1

  useEffect(() => {
    if (stop) return
    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % count),
      ROTATE_MS,
    )
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stop, count])

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  )

  if (count === 0) return null
  const entry = entries[Math.min(index, count - 1)]
  const { manifest, tagline, featuredTitle, featuredText } = entry
  const brand = pluginBrand(manifest.id, manifest.name)
  const active = isActive(manifest.id)
  const busy = busyPluginId === manifest.id

  return (
    <section
      className="relative h-[472px] w-full overflow-hidden rounded-[22px] border border-border"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Per-plugin gradient wash */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(100deg, var(--card) 32%, ${brand.heroWash} 100%)`,
        }}
      />

      {/* Orb + rings, anchored right */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[12%] top-1/2 flex -translate-y-1/2 translate-x-1/2 items-center justify-center"
      >
        <div
          className="absolute size-[440px] rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${brand.glow}, transparent 66%)`,
          }}
        />
        <span
          className="pl-store-ring absolute size-[330px] rounded-full border"
          style={{
            borderColor:
              'color-mix(in oklch, var(--foreground) 14%, transparent)',
            animation: 'pl-store-spin 34s linear infinite',
          }}
        />
        <span
          className="pl-store-ring absolute size-[400px] rounded-full border border-dashed"
          style={{
            borderColor:
              'color-mix(in oklch, var(--foreground) 9%, transparent)',
            animation: 'pl-store-spin-reverse 52s linear infinite',
          }}
        />
        <AiOrb size="248px" state="idle" colors={brand.orbColors} />
      </div>

      {/* Left scrim keeps the copy legible over the wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, var(--card) 32%, transparent 74%)',
        }}
      />

      {/* Content — keyed so each slide replays the enter animation */}
      <div
        key={manifest.id}
        className="pl-store-heroin relative z-10 flex h-full max-w-[60%] flex-col justify-center px-[52px]"
      >
        <PluginBrandTile
          id={manifest.id}
          name={manifest.name}
          src={pluginPosterSrc(entry)}
          size={44}
          iconSize={26}
          className="mb-5"
        />
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
            {t('pluginStore.spotlight', 'Spotlight')}
          </span>
          <span className="size-[5px] rounded-full bg-primary" />
          <span className="text-[11px] text-muted-foreground">
            {categoryLabel(entry.category)} · {manifest.author}
          </span>
        </div>
        <h2 className="mt-4 max-w-[15ch] font-serif text-[50px] font-semibold leading-[0.99] tracking-[-0.03em] text-foreground">
          {featuredTitle ?? manifest.name}
        </h2>
        <p className="mt-4 max-w-[47ch] text-[15px] leading-[1.6] text-muted-foreground">
          {featuredText ?? tagline}
        </p>
        <div className="mt-[26px] flex items-center gap-[13px]">
          <Button
            size="lg"
            disabled={busy}
            onClick={() => (active ? onDetails(entry) : onInstall(entry))}
          >
            {busy
              ? t('pluginStore.installing', 'Installing…')
              : active
                ? t('pluginStore.managePlugin', 'Manage plugin')
                : t('pluginStore.install', 'Install')}
          </Button>
          <Button size="lg" variant="outline" onClick={() => onDetails(entry)}>
            {t('pluginStore.details', 'Details')}
          </Button>
          {active && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--chart-2)]">
              <span className="size-1.5 rounded-full bg-[var(--chart-2)]" />
              {t('pluginStore.installedActive', 'Installed & active')}
            </span>
          )}
        </div>
      </div>

      {/* Prev / next */}
      {count > 1 && (
        <>
          <HeroArrow side="left" onClick={() => goTo(index - 1)} />
          <HeroArrow side="right" onClick={() => goTo(index + 1)} />
          {/* Dot pager */}
          <div className="absolute bottom-6 left-[52px] z-10 flex items-center gap-1.5">
            {entries.map((e, i) => (
              <button
                key={e.manifest.id}
                type="button"
                aria-label={t('pluginStore.goToSlide', { n: i + 1 })}
                onClick={() => goTo(i)}
                className={cn(
                  'h-1 rounded-[2px] transition-all',
                  i === index
                    ? 'w-[26px] bg-foreground/80'
                    : 'w-[10px] bg-foreground/25 hover:bg-foreground/40',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function HeroArrow({
  side,
  onClick,
}: {
  side: 'left' | 'right'
  onClick: () => void
}) {
  const { t } = useTranslation()
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={
        side === 'left'
          ? t('pluginStore.previousSlide')
          : t('pluginStore.nextSlide')
      }
      onClick={onClick}
      className={cn(
        'absolute top-1/2 z-10 flex size-[34px] -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/70 hover:text-foreground',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
