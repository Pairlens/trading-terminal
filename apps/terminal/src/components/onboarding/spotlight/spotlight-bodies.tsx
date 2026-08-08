// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Sparkles } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { ChartLineIcon } from '@pairlens/ui/components/ui/chart-line'
import { LayersIcon } from '@pairlens/ui/components/ui/layers'
import { WaypointsIcon } from '@pairlens/ui/components/ui/waypoints'
import { WorkflowIcon } from '@pairlens/ui/components/ui/workflow'

import type { ComponentType } from 'react'
import type { PointIcon } from './spotlight-steps'
import type { ColorMode } from '@/lib/settings/color-mode'
import {
  COUNTRIES,
  POPULAR_COUNTRY_CODES,
  countryFlag,
  countryName,
} from '@/lib/countries'
import { COLOR_MODES } from '@/lib/settings/color-mode'

// ── Shared bits ─────────────────────────────────────────────────────

export type RenderOption = {
  value: string
  label: string
  sub?: string
  /** Emoji flag shown before the label (language step). */
  flag?: string
  /** Serif currency symbol shown before the label (currency step). */
  symbol?: string
  /** Mono kind tag on the right (venues step). */
  tag?: string
  /** Spectrum dot color (risk step). */
  dotColor?: string
  selected: boolean
  onSelect: () => void
}

const HOVER_BORDER =
  'hover:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))]'

// ── Rotating greeting (language step) ───────────────────────────────
// Apple-style hello screen: the first-run title cycles a greeting in each
// supported language. Deliberately NOT from the i18n catalog — it renders
// before a language is chosen, so the words themselves are the content.

const GREETINGS = [
  'Hello', // en
  'Hola', // es
  '你好', // zh
  'Привет', // ru
  'Bonjour', // fr
  'Olá', // pt
  'Hallo', // de
  'Ciao', // it
  'こんにちは', // ja
  '안녕하세요', // ko
  'Xin chào', // vi
  'Merhaba', // tr
  'Halo', // id
  // zh-Hant shares 你好 with zh — not repeated.
  'สวัสดี', // th
  'Привіт', // uk
  'Cześć', // pl
]

const GREETING_HOLD_MS = 2100
const GREETING_FADE_MS = 260

/**
 * Cycles greetings with a soft cross-fade. `srLabel` is the stable
 * screen-reader title (the visual rotation is decorative).
 */
export function RotatingGreeting({
  reduceMotion,
  srLabel,
  className,
}: {
  reduceMotion: boolean
  srLabel: string
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (reduceMotion) return
    let fade: ReturnType<typeof setTimeout>
    const cycle = setInterval(() => {
      setVisible(false)
      fade = setTimeout(() => {
        setIndex((i) => (i + 1) % GREETINGS.length)
        setVisible(true)
      }, GREETING_FADE_MS)
    }, GREETING_HOLD_MS)
    return () => {
      clearInterval(cycle)
      clearTimeout(fade)
    }
  }, [reduceMotion])

  return (
    <h2
      className={cn(
        'text-balance font-serif text-[44px] font-semibold leading-[1.04] tracking-[-0.02em] text-foreground max-md:text-4xl',
        className,
      )}
    >
      <span className="sr-only">{srLabel}</span>
      <span
        aria-hidden
        className={cn(
          'inline-block min-h-[1.04em] transition-[opacity,transform] ease-out',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5',
        )}
        style={{ transitionDuration: `${GREETING_FADE_MS}ms` }}
      >
        {reduceMotion ? GREETINGS[0] : GREETINGS[index]}
      </span>
    </h2>
  )
}

/** Inset primary ring + soft halo used by every selectable surface. */
function SelectedRing({ radius }: { radius: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: radius,
        boxShadow:
          'inset 0 0 0 1.5px var(--primary), 0 0 0 4px color-mix(in oklch, var(--primary) 16%, transparent)',
      }}
    />
  )
}

function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute flex items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground',
        className,
      )}
    >
      ✓
    </span>
  )
}

export function AutoAdvanceHint() {
  const { t } = useTranslation()
  return (
    <span className="text-xs text-muted-foreground opacity-70">
      {t('onboarding.nav.selectHint')}
    </span>
  )
}

// ── Story value points ──────────────────────────────────────────────

const POINT_ICONS: Record<
  Exclude<PointIcon, 'check'>,
  ComponentType<{ size?: number }>
> = {
  layers: LayersIcon,
  waypoints: WaypointsIcon,
  chart: ChartLineIcon,
  workflow: WorkflowIcon,
}

function PointGlyph({ icon, size }: { icon: PointIcon; size: number }) {
  if (icon === 'check') {
    return (
      <span
        className="font-bold leading-none"
        style={{ fontSize: size * 0.75 }}
      >
        ✓
      </span>
    )
  }
  const Icon = POINT_ICONS[icon]
  return <Icon size={size} />
}

export function StoryPointsVertical({
  icons,
  labels,
}: {
  icons: Array<PointIcon>
  labels: Array<string>
}) {
  return (
    <div className="mx-auto mt-1.5 flex w-full max-w-[460px] flex-col gap-0.5">
      {icons.map((icon, i) => (
        <div key={i} className="flex items-center gap-3 py-2 text-left">
          <span className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-[color-mix(in_oklch,var(--primary)_13%,transparent)] text-primary">
            <PointGlyph icon={icon} size={17} />
          </span>
          <span className="text-[14.5px] text-foreground">{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

export function StoryPointsHorizontal({
  icons,
  labels,
}: {
  icons: Array<PointIcon>
  labels: Array<string>
}) {
  return (
    <div className="mx-auto mt-2 flex w-full max-w-[730px] justify-center gap-3 max-md:flex-col">
      {icons.map((icon, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col items-center gap-2.5 rounded-[15px] border border-border bg-[color-mix(in_oklch,var(--card)_55%,transparent)] px-3 py-[18px] text-center"
        >
          <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--primary)_13%,transparent)] text-primary">
            <PointGlyph icon={icon} size={20} />
          </span>
          <span className="text-[12.5px] leading-[1.4] text-foreground">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

export function VenueChips({ chips }: { chips: Array<string> }) {
  return (
    <div className="mt-2.5 flex max-w-[520px] flex-wrap justify-center gap-2">
      {chips.map((chip, i) => (
        <span
          key={chip}
          className="pl-onb-chip rounded-full border border-border bg-card px-[13px] py-1.5 font-mono text-xs text-muted-foreground"
          style={{
            animation: 'pl-onb-float 4.5s ease-in-out infinite',
            animationDelay: `${i * 0.55}s`,
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

// ── Choice layouts ──────────────────────────────────────────────────

export function OptionGrid({ options }: { options: Array<RenderOption> }) {
  return (
    <div className="mx-auto grid w-full max-w-[660px] grid-cols-3 gap-[11px] max-md:grid-cols-2 max-sm:grid-cols-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={opt.onSelect}
          className={cn(
            'relative flex min-h-[74px] cursor-pointer flex-col items-start gap-[3px] rounded-xl border border-border bg-card px-[15px] py-[13px] text-left text-foreground transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
            'hover:-translate-y-[3px] hover:shadow-[0_12px_30px_-16px_rgba(0,0,0,.7)]',
            HOVER_BORDER,
          )}
        >
          <span className="flex w-full items-center gap-2">
            {opt.flag && (
              <span className="text-xl leading-none">{opt.flag}</span>
            )}
            {opt.symbol && (
              <span className="min-w-5 text-center font-serif text-xl leading-none text-primary">
                {opt.symbol}
              </span>
            )}
            <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
              {opt.label}
            </span>
          </span>
          {opt.sub && (
            <span className="text-xs text-muted-foreground">{opt.sub}</span>
          )}
          {opt.selected && (
            <>
              <SelectedRing radius={12} />
              <CheckBadge className="right-2 top-2 size-[17px]" />
            </>
          )}
        </button>
      ))}
    </div>
  )
}

export function OptionRows({ options }: { options: Array<RenderOption> }) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[9px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={opt.onSelect}
          className={cn(
            'relative flex w-full cursor-pointer items-center gap-3.5 rounded-[13px] border border-border bg-card px-[17px] py-[15px] text-left text-foreground transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
            'hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-16px_rgba(0,0,0,.7)]',
            HOVER_BORDER,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
              {opt.label}
            </span>
            {opt.sub && (
              <span className="text-xs text-muted-foreground">{opt.sub}</span>
            )}
          </span>
          {opt.tag && (
            <span className="flex-none font-mono text-[10.5px] tracking-[0.06em] text-primary">
              {opt.tag}
            </span>
          )}
          <span className="size-[22px] flex-none rounded-full border-[1.5px] border-border" />
          {opt.selected && (
            <>
              <SelectedRing radius={13} />
              <span className="absolute right-[17px] top-1/2 flex size-[22px] -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                ✓
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Country picker ──────────────────────────────────────────────────
// The onboarding collects the exact country (same source of truth as the
// settings dialog — connector routing + geo-restriction need it), not a
// coarse region. Popular shortlist first; typing searches the full list
// by localized name (Intl.DisplayNames), English name, or ISO code.

export function CountryPicker({
  value,
  onSelect,
}: {
  value: string | undefined
  onSelect: (code: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')

  const localized = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        code: c.code,
        name: countryName(c.code, i18n.language),
        english: c.label,
      })),
    [i18n.language],
  )

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) {
      const byCode = new Map(localized.map((c) => [c.code, c]))
      return POPULAR_COUNTRY_CODES.map((code) => byCode.get(code)!).filter(
        Boolean,
      )
    }
    return localized
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.english.toLowerCase().includes(q) ||
          c.code.toLowerCase().startsWith(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
  }, [q, localized, i18n.language])

  const rowClass = cn(
    'relative flex w-full cursor-pointer items-center gap-3 rounded-[13px] border border-border bg-card px-[15px] py-[11px] text-left text-foreground transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
    HOVER_BORDER,
  )

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[9px]">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('onboarding.country.searchPlaceholder')}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-[13px] border border-border bg-card px-[17px] py-[13px] text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] focus:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
      />
      <div className="flex max-h-[min(296px,38vh)] flex-col gap-[9px] overflow-y-auto pb-0.5">
        {results.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onSelect(c.code)}
            className={rowClass}
          >
            <span className="text-xl leading-none">{countryFlag(c.code)}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">
              {c.name}
            </span>
            <span className="flex-none font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">
              {c.code}
            </span>
            {value === c.code && (
              <>
                <SelectedRing radius={13} />
                <CheckBadge className="right-[13px] top-1/2 size-[18px] -translate-y-1/2" />
              </>
            )}
          </button>
        ))}
        {q && results.length === 0 && (
          <div className="rounded-[13px] border border-dashed border-border px-[17px] py-[15px] text-center text-[13px] text-muted-foreground">
            {t('onboarding.country.noResults')}
          </div>
        )}
        {!q && (
          <button
            type="button"
            onClick={() => onSelect('')}
            className={rowClass}
          >
            <span className="text-xl leading-none">🌐</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                {t('onboarding.country.global')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('onboarding.country.globalSub')}
              </span>
            </span>
            {value === '' && (
              <>
                <SelectedRing radius={13} />
                <CheckBadge className="right-[13px] top-1/2 size-[18px] -translate-y-1/2" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export function RiskSpectrum({ options }: { options: Array<RenderOption> }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto mt-1 flex w-full max-w-[600px] flex-col gap-[15px]">
      <div className="flex items-center gap-[11px]">
        <span className="text-[11px] text-muted-foreground">
          {t('onboarding.risk.calmer')}
        </span>
        <span className="h-1.5 flex-1 rounded-[3px] bg-[linear-gradient(90deg,var(--up),var(--primary),var(--down))] opacity-75" />
        <span className="text-[11px] text-muted-foreground">
          {t('onboarding.risk.hotter')}
        </span>
      </div>
      <div className="flex gap-2.5 max-md:flex-col">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={opt.onSelect}
            className={cn(
              'relative flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-[14px] border border-border bg-card px-2.5 py-[18px] text-foreground transition-[transform,border-color] duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-[3px]',
              HOVER_BORDER,
            )}
          >
            <span
              className="size-[26px] rounded-full"
              style={{
                background: opt.dotColor,
                boxShadow: `0 0 18px -2px ${opt.dotColor}`,
              }}
            />
            <span className="text-sm font-semibold tracking-[-0.01em]">
              {opt.label}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {opt.sub}
            </span>
            {opt.selected && <SelectedRing radius={14} />}
          </button>
        ))}
      </div>
    </div>
  )
}

const ASSET_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  cex: LayersIcon,
  dex: WaypointsIcon,
  equities: ChartLineIcon,
}

export function AssetCards({ options }: { options: Array<RenderOption> }) {
  return (
    <div className="mx-auto grid w-full max-w-[700px] grid-cols-3 gap-[13px] max-md:grid-cols-1">
      {options.map((opt) => {
        const Icon = ASSET_ICONS[opt.value] ?? LayersIcon
        return (
          <button
            key={opt.value}
            type="button"
            onClick={opt.onSelect}
            className={cn(
              // Below `sm` the three cards are stacked, so the 166px floor that
              // squares them off in a row instead pushes the third card under the
              // fold. Content height is enough once they are rows.
              'relative flex min-h-[166px] cursor-pointer flex-col items-start gap-[9px] rounded-2xl border border-border bg-card p-[19px] text-left text-foreground transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)] max-sm:min-h-0 max-sm:p-4',
              'hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,.7)]',
              HOVER_BORDER,
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--primary)_13%,transparent)] text-primary">
              <Icon size={24} />
            </span>
            <span className="font-serif text-[19px] font-semibold">
              {opt.label}
            </span>
            <span className="text-[12.5px] leading-[1.45] text-muted-foreground">
              {opt.sub}
            </span>
            {opt.selected && (
              <>
                <SelectedRing radius={16} />
                <CheckBadge className="right-3 top-3 size-[19px] text-[11px]" />
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Theme tiles ─────────────────────────────────────────────────────

/** One mock window in a single color mode; positioned by the caller. */
function ModePanel({
  mode,
  className,
  style,
}: {
  mode: 'light' | 'dark'
  className?: string
  style?: React.CSSProperties
}) {
  const light = mode === 'light'
  return (
    <span
      className={cn('block overflow-hidden', className)}
      style={{
        background: light ? 'oklch(98% 0 0)' : 'oklch(13% 0 0)',
        border: light
          ? '1px solid rgba(0,0,0,.08)'
          : '1px solid rgba(255,255,255,.08)',
        ...style,
      }}
    >
      <span
        className="absolute left-[11px] top-[11px] h-2 w-[44%] rounded"
        style={{ background: light ? 'oklch(84% 0 0)' : 'oklch(30% 0 0)' }}
      />
      <span
        className="absolute left-[11px] top-[25px] h-2 w-[64%] rounded"
        style={{ background: light ? 'oklch(90% 0 0)' : 'oklch(24% 0 0)' }}
      />
      <span
        className="absolute bottom-[11px] left-[11px] h-[11px] w-[30px] rounded-md"
        style={{
          background: light ? 'oklch(0.52 0.16 278)' : 'oklch(0.72 0.13 278)',
        }}
      />
    </span>
  )
}

/**
 * Tile artwork per color mode. `system` shows both halves split on the
 * diagonal — the same visual shorthand the OS uses for "follow the system".
 */
function ThemePreview({ mode }: { mode: ColorMode }) {
  if (mode !== 'system') {
    return (
      <ModePanel
        mode={mode}
        className="relative h-[66px] w-full rounded-[10px]"
      />
    )
  }
  return (
    <span className="relative block h-[66px] w-full overflow-hidden rounded-[10px]">
      <ModePanel mode="light" className="absolute inset-0 rounded-[10px]" />
      <ModePanel
        mode="dark"
        className="absolute inset-0 rounded-[10px]"
        style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}
      />
    </span>
  )
}

export function ThemeTiles({
  theme,
  onPick,
}: {
  theme: ColorMode
  onPick: (theme: ColorMode) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto grid w-full max-w-[560px] grid-cols-3 gap-[13px] max-md:grid-cols-1">
      {COLOR_MODES.map(({ value }) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className={cn(
            'relative flex cursor-pointer flex-col gap-2.5 rounded-[15px] border border-border bg-card p-[13px] transition-[transform,border-color] duration-200 hover:-translate-y-[3px]',
            HOVER_BORDER,
          )}
        >
          <ThemePreview mode={value} />
          <span className="text-[13.5px] font-semibold text-foreground">
            {t(`onboarding.themeStep.${value}`)}
          </span>
          {theme === value && <SelectedRing radius={15} />}
        </button>
      ))}
    </div>
  )
}

// ── Palette picker ──────────────────────────────────────────────────
// The bundled `theme:override` plugins, offered right where the color mode
// is chosen. Names and swatches come from each plugin's manifest, so this
// row shows exactly what Settings → Appearance shows later.

/** The stock Warm Precision look — mirrors the settings section's chips. */
const DEFAULT_SWATCHES = {
  light: ['#2e2c27', '#e8e4d9', '#9a9589'],
  dark: ['#e8e4d9', '#1a1a1a', '#9a9589'],
}

export function ThemePalettes({
  themes,
  activeId,
  isDark,
  onPick,
}: {
  themes: Array<{
    id: string
    name: string
    swatches: { light: Array<string>; dark: Array<string> }
  }>
  activeId: string | null
  isDark: boolean
  onPick: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const mode = isDark ? 'dark' : 'light'
  const chips = [
    {
      id: null,
      name: t('onboarding.themeStep.defaultTheme'),
      colors: DEFAULT_SWATCHES[mode],
    },
    ...themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      colors: theme.swatches[mode].slice(0, 3),
    })),
  ]

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-2.5">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {t('onboarding.themeStep.paletteTitle')}
      </span>
      {/* Seventeen bundled themes: three rows sit on stage, the rest scroll —
          the bottom fade is the only hint the step needs. */}
      <div
        className="flex max-h-[min(178px,25vh)] w-full flex-wrap justify-center gap-2 overflow-y-auto px-1 pb-1"
        style={{
          maskImage:
            'linear-gradient(to bottom, #000 74%, rgba(0,0,0,.35) 94%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, #000 74%, rgba(0,0,0,.35) 94%, transparent)',
        }}
      >
        {chips.map((chip) => (
          <button
            key={chip.id ?? 'default'}
            type="button"
            onClick={() => onPick(chip.id)}
            className={cn(
              'relative flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-3.5 text-foreground transition-[transform,border-color] duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-px',
              HOVER_BORDER,
            )}
          >
            <span aria-hidden className="flex -space-x-1">
              {chip.colors.map((color, i) => (
                <span
                  key={i}
                  className="size-[11px] rounded-full ring-1 ring-[color-mix(in_oklch,var(--foreground)_14%,transparent)]"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="text-[12.5px] font-medium tracking-[-0.01em]">
              {chip.name}
            </span>
            {activeId === chip.id && <SelectedRing radius={999} />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Legal flip card ─────────────────────────────────────────────────

export function LegalCard({
  cardRef,
  items,
  accepted,
  page,
  onToggle,
  onFirstSet,
}: {
  cardRef: React.RefObject<HTMLDivElement | null>
  items: Array<string>
  accepted: Array<number>
  page: 0 | 1
  onToggle: (index: number) => void
  onFirstSet: () => void
}) {
  const { t } = useTranslation()
  const pageItems =
    page === 0
      ? items.slice(0, 4).map((text, i) => ({ text, index: i }))
      : items.slice(4).map((text, i) => ({ text, index: i + 4 }))

  return (
    <div className="mx-auto mt-1.5 flex w-full max-w-[600px] flex-col gap-[13px]">
      <div className="w-full" style={{ perspective: 1400 }}>
        <div
          ref={cardRef}
          className="max-h-[min(322px,44vh)] overflow-y-auto rounded-2xl border border-border bg-card shadow-[0_24px_60px_-34px_rgba(0,0,0,.85)] will-change-[transform,opacity]"
        >
          {pageItems.map(({ text, index }) => {
            const isAccepted = accepted.includes(index)
            return (
              <button
                key={index}
                type="button"
                role="checkbox"
                aria-checked={isAccepted}
                onClick={() => onToggle(index)}
                className="flex w-full cursor-pointer items-start gap-3.5 border-b border-[color-mix(in_oklch,var(--border)_55%,transparent)] bg-transparent px-[18px] py-[15px] text-left text-foreground transition-colors last:border-b-0 hover:bg-[color-mix(in_oklch,var(--primary)_7%,transparent)]"
              >
                {isAccepted ? (
                  <span className="mt-px flex size-[21px] flex-none items-center justify-center rounded-[7px] bg-primary text-xs font-bold text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_15%,transparent)]">
                    ✓
                  </span>
                ) : (
                  <span className="mt-px block size-[21px] flex-none rounded-[7px] border-[1.5px] border-[color-mix(in_oklch,var(--muted-foreground)_50%,transparent)]" />
                )}
                <span className="text-[13.5px] leading-normal">{text}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'size-[7px] rounded-full',
              page === 0
                ? 'bg-primary'
                : 'bg-[color-mix(in_oklch,var(--muted-foreground)_38%,transparent)]',
            )}
          />
          <span
            className={cn(
              'size-[7px] rounded-full',
              page === 1
                ? 'bg-primary'
                : 'bg-[color-mix(in_oklch,var(--muted-foreground)_38%,transparent)]',
            )}
          />
        </span>
        <span>
          {page === 0
            ? t('onboarding.legal.hintFirst')
            : t('onboarding.legal.hintSecond')}
        </span>
        {page === 1 && (
          <button
            type="button"
            onClick={onFirstSet}
            className="cursor-pointer border-none bg-transparent p-0 text-xs text-primary"
          >
            ‹ {t('onboarding.legal.firstSet')}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-[11px] py-1 text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-primary">
            {accepted.length}/{items.length}
          </span>
          <span>{t('onboarding.legal.acknowledged')}</span>
        </span>
      </div>
    </div>
  )
}

// ── Account benefits card ───────────────────────────────────────────

export function AccountBenefits() {
  const { t } = useTranslation()
  const rows = [
    { Icon: Sparkles, id: 'ai' },
    { Icon: WorkflowIcon, id: 'sync' },
    { Icon: WaypointsIcon, id: 'community' },
  ] as const
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4">
      {rows.map(({ Icon, id }) => (
        <div key={id} className="flex items-center gap-3">
          <span className="flex text-primary">
            <Icon size={20} />
          </span>
          <div className="text-left">
            <div className="text-[13.5px] font-semibold">
              {t(`onboarding.account.benefits.${id}.title`)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(`onboarding.account.benefits.${id}.sub`)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Summary recap ───────────────────────────────────────────────────

export function SummaryGrid({
  rows,
}: {
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="mx-auto grid w-full max-w-[560px] grid-cols-2 gap-x-[22px] gap-y-0.5 max-md:grid-cols-1">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 border-b border-border py-[9px]"
        >
          <span className="text-[12.5px] text-muted-foreground">
            {row.label}
          </span>
          <span className="text-right text-[13px] font-semibold">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function summaryValue(value: string | undefined | null): string {
  return value && value.length > 0 ? value : '—'
}
