// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The page skin — what the bar pinned to the bottom of /charts restyles. Each
// skin is two halves: a palette the engine paints candles with, and a set of
// design tokens re-pointed on every chart root so the chrome around the
// canvas (labels, chips, price, borders, corners) follows in the same click.
//
// State lives on `window` and every change rides a document event: the bar
// ships as a page script and the charts as React islands, so the two halves
// stay in step even if the bundler never puts them in the same chunk. Nothing
// here imports React — the bar's script must not drag a renderer along.

import { HEX } from './chart-kit'
import type { ChartSkin } from './chart-kit'

export type PaletteId = 'classic' | 'mono' | 'neon' | 'terminal' | 'ocean'
export type SurfaceId = 'graphite' | 'paper' | 'midnight'
export type FontId = 'mono' | 'sans' | 'serif'

export type PageSkin = {
  palette: PaletteId
  surface: SurfaceId
  font: FontId
  radius: number
  grid: boolean
}

export type Palette = {
  id: PaletteId
  name: string
  up: string
  down: string
  ema: string
  bb: string
  rsi: string
  /** Tone for the volume chip. Every palette but Classic reuses its EMA hue. */
  vol: string
}

export type Surface = {
  id: SurfaceId
  name: string
  /** The card itself, and the canvas background. */
  bg: string
  /** Rules, gridlines and borders. */
  grid: string
  text: string
  fg: string
  /** Recessed chrome behind the card: headers, insets. */
  chrome: string
  /** Chip well — lighter than the card on dark surfaces, darker on paper. */
  muted: string
}

/**
 * Colours are literal hex because the engine's WebGL price pass parses them
 * with a hex-only reader. Classic and Graphite resolve to the design system's
 * own dark values, so the page at rest is exactly the page the skin bar
 * starts from and Reset really is a reset.
 */
export const PALETTES: Array<Palette> = [
  {
    id: 'classic',
    name: 'Classic',
    up: HEX.green,
    down: HEX.red,
    ema: HEX.amber,
    bb: HEX.cyan,
    rsi: HEX.magenta,
    vol: HEX.iris,
  },
  {
    id: 'mono',
    name: 'Mono',
    up: '#e8e8ec',
    down: '#70707a',
    ema: '#b9b9c2',
    bb: '#54545c',
    rsi: '#9a9aa4',
    vol: '#b9b9c2',
  },
  {
    id: 'neon',
    name: 'Neon',
    up: '#4ef2c0',
    down: '#ff4d8d',
    ema: '#7c8cff',
    bb: '#2b3a63',
    rsi: '#4ef2c0',
    vol: '#7c8cff',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    up: '#f0b429',
    down: '#e5484d',
    ema: '#f0b429',
    bb: '#5a5a63',
    rsi: '#f0b429',
    vol: '#f0b429',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    up: '#4cc9f0',
    down: '#f72585',
    ema: '#7bdff2',
    bb: '#3a5a8c',
    rsi: '#4cc9f0',
    vol: '#7bdff2',
  },
]

export const SURFACES: Array<Surface> = [
  {
    id: 'graphite',
    name: 'Graphite',
    bg: HEX.card,
    grid: HEX.border,
    text: HEX.mutedForeground,
    fg: HEX.foreground,
    chrome: HEX.background,
    muted: '#171411',
  },
  {
    id: 'paper',
    name: 'Paper',
    bg: '#faf8f3',
    grid: '#e2ddd1',
    text: '#8a8377',
    fg: '#2b2722',
    chrome: '#f2eee5',
    muted: '#ece6d9',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    bg: '#080d1c',
    grid: '#182036',
    text: '#6f81ab',
    fg: '#dbe6ff',
    chrome: '#050a15',
    muted: '#121b31',
  },
]

export const RADIUS_STEPS = [0, 18, 30]

export const DEFAULT_PAGE_SKIN: PageSkin = {
  palette: 'classic',
  surface: 'graphite',
  font: 'mono',
  radius: 18,
  grid: true,
}

const FONT_TOKENS: Record<FontId, string> = {
  mono: '--font-mono',
  sans: '--font-sans',
  serif: '--font-serif',
}

/** Used before the document is around to ask; mirrors the design system. */
const FONT_FALLBACKS: Record<FontId, string> = {
  mono: "'JetBrains Mono Variable', ui-monospace, monospace",
  sans: "'Hanken Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
  serif: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
}

const fontCache = new Map<FontId, string>()

/**
 * A skin assigns all three font tokens on the same element, so handing one of
 * them `var(--font-mono)` there would be a self-reference that resolves to
 * nothing. Read the stack off the root once and assign the literal.
 */
export function fontStackFor(font: FontId): string {
  const cached = fontCache.get(font)
  if (cached) return cached
  if (typeof document === 'undefined') return FONT_FALLBACKS[font]
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(FONT_TOKENS[font])
    .trim()
  const stack = resolved || FONT_FALLBACKS[font]
  fontCache.set(font, stack)
  return stack
}

export const PAGE_SKIN_EVENT = 'pairlens:charts-skin'

declare global {
  interface Window {
    __pairlensPageSkin?: PageSkin
  }
}

export function getPageSkin(): PageSkin {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SKIN
  return window.__pairlensPageSkin ?? DEFAULT_PAGE_SKIN
}

export function setPageSkin(next: PageSkin): void {
  if (typeof window === 'undefined') return
  window.__pairlensPageSkin = next
  document.dispatchEvent(new CustomEvent(PAGE_SKIN_EVENT))
}

export function subscribePageSkin(onChange: () => void): () => void {
  document.addEventListener(PAGE_SKIN_EVENT, onChange)
  return () => document.removeEventListener(PAGE_SKIN_EVENT, onChange)
}

const paletteById = (id: string) => PALETTES.find((p) => p.id === id)
const surfaceById = (id: string) => SURFACES.find((s) => s.id === id)

/** Fold one `data-skin` control into the skin. `null` if it changes nothing. */
export function applySkinControl(
  skin: PageSkin,
  control: string,
): PageSkin | null {
  const [kind, value] = control.split(':')
  if (kind === 'reset') return { ...DEFAULT_PAGE_SKIN }
  if (kind === 'grid') return { ...skin, grid: !skin.grid }
  if (kind === 'radius' && RADIUS_STEPS.includes(Number(value))) {
    return { ...skin, radius: Number(value) }
  }
  if (kind === 'palette' && paletteById(value)) {
    return { ...skin, palette: value as PaletteId }
  }
  if (kind === 'surface' && surfaceById(value)) {
    return { ...skin, surface: value as SurfaceId }
  }
  if (kind === 'font' && value in FONT_TOKENS) {
    return { ...skin, font: value as FontId }
  }
  return null
}

/** Whether a `data-skin` control is the selected one. `null` = stateless. */
export function isSkinControlOn(skin: PageSkin, control: string) {
  const [kind, value] = control.split(':')
  if (kind === 'palette') return skin.palette === value
  if (kind === 'surface') return skin.surface === value
  if (kind === 'font') return skin.font === value
  if (kind === 'radius') return skin.radius === Number(value)
  if (kind === 'grid') return skin.grid
  return null
}

export type PageSkinView = {
  skin: PageSkin
  /** Palette handed to the engine. */
  chart: ChartSkin
  /** Design tokens to re-point on a chart root. */
  vars: Record<string, string>
  showGrid: boolean
  fontFamily: string
}

// Keyed on the skin object, which only ever changes when the bar is clicked:
// every consumer gets the same view instance, and the engine's prop diff
// (identity, not deep equality) stays quiet between skins.
const views = new WeakMap<PageSkin, PageSkinView>()

export function pageSkinView(skin: PageSkin): PageSkinView {
  const cached = views.get(skin)
  if (cached) return cached

  const palette = paletteById(skin.palette) ?? PALETTES[0]
  const surface = surfaceById(skin.surface) ?? SURFACES[0]

  // Mono is the page's own type mix — the design system is mono-dominant
  // inside these cards already — so only Sans and Serif collapse all three
  // families onto one stack.
  const single = skin.font === 'mono' ? null : fontStackFor(skin.font)

  const view: PageSkinView = {
    skin,
    chart: {
      bg: surface.bg,
      grid: surface.grid,
      text: surface.text,
      fg: surface.fg,
      up: palette.up,
      down: palette.down,
      ema: palette.ema,
      bb: palette.bb,
      rsi: palette.rsi,
    },
    vars: {
      '--card': surface.bg,
      '--background': surface.chrome,
      '--pl-inset': surface.chrome,
      '--muted': surface.muted,
      '--foreground': surface.fg,
      '--muted-foreground': surface.text,
      '--border': surface.grid,
      '--chart-2': palette.up,
      '--destructive': palette.down,
      '--chart-4': palette.ema,
      '--magic-3': palette.bb,
      '--chart-5': palette.rsi,
      '--chart-3': palette.vol,
      '--font-mono': single ?? fontStackFor('mono'),
      '--font-sans': single ?? fontStackFor('sans'),
      '--font-serif': single ?? fontStackFor('serif'),
      '--pl-skin-radius': `${skin.radius}px`,
    },
    showGrid: skin.grid,
    fontFamily: single ?? fontStackFor('mono'),
  }

  views.set(skin, view)
  return view
}
