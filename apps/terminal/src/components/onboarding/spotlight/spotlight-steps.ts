// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

export type StepKind =
  | 'welcome'
  | 'story'
  | 'choice'
  | 'theme'
  | 'legal'
  | 'connect'
  | 'summary'

export type ChoiceLayout = 'grid' | 'rows' | 'country'

export type PointIcon = 'layers' | 'waypoints' | 'chart' | 'workflow' | 'check'

export type SpotlightStep = {
  /** i18n base: `onboarding.<id>` and step identity. */
  id: string
  kind: StepKind
  /** For choice steps — which selections field it writes. */
  field?: 'language' | 'country' | 'currency' | 'analytics'
  layout?: ChoiceLayout
  /** Story steps drift the orb horizontally for asymmetry. */
  orbLeft?: string
  /** Layout overrides (legal step sits tiny/high). */
  orbTop?: string
  orbScale?: number
  stageTop?: string
  /** Story value points — icon tiles; copy lives in i18n `points.N`. */
  points?: Array<PointIcon>
  /** Horizontal 3-up card layout instead of the vertical list. */
  pointsH?: boolean
  /** Floating venue chips (proper nouns — not translated). */
  chips?: Array<string>
}

export const STEPS: Array<SpotlightStep> = [
  // Language leads (Apple-style hello screen) so the rest of the flow —
  // and the terminal itself — render in the user's language from the start.
  { id: 'language', kind: 'choice', field: 'language', layout: 'grid' },
  // The statue hero owns this frame: the stage drops low so more of the bust
  // shows, and the orb shrinks to sit inline right after the headline — one
  // "Meet Pairlens ●" lockup (it sweeps back to the story preset next step).
  {
    id: 'welcome',
    kind: 'welcome',
    orbLeft: '62.5%',
    orbTop: '63.5%',
    orbScale: 0.24,
    stageTop: '60%',
  },
  {
    id: 'oneTerminal',
    kind: 'story',
    orbLeft: '39%',
    points: ['layers', 'waypoints', 'chart'],
  },
  { id: 'country', kind: 'choice', field: 'country', layout: 'country' },
  // Routing pays off the country question it follows: the region just chosen
  // is what curates venues and geo-aware order routing.
  {
    id: 'routing',
    kind: 'story',
    pointsH: true,
    orbLeft: '61%',
    points: ['waypoints', 'check', 'check'],
    chips: ['OKX', 'Binance', 'Coinbase', 'Jupiter', 'Bybit', 'Kraken'],
  },
  { id: 'currency', kind: 'choice', field: 'currency', layout: 'grid' },
  {
    id: 'copilot',
    kind: 'story',
    orbLeft: '41%',
    points: ['workflow', 'check', 'check'],
  },
  { id: 'themeStep', kind: 'theme' },
  {
    id: 'workspaces',
    kind: 'story',
    orbLeft: '59%',
    points: ['layers', 'check', 'check'],
  },
  // The trust block: privacy story → legal acknowledgment → analytics
  // consent → account. One narrative beat, answered in one stretch.
  {
    id: 'privacy',
    kind: 'story',
    pointsH: true,
    points: ['check', 'check', 'check'],
  },
  {
    id: 'legal',
    kind: 'legal',
    orbTop: '9%',
    orbScale: 0.28,
    stageTop: '18%',
  },
  { id: 'analytics', kind: 'choice', field: 'analytics', layout: 'rows' },
  { id: 'account', kind: 'connect' },
  { id: 'summary', kind: 'summary' },
]

export const LEGAL_ITEM_COUNT = 8

/** Orb + stage position presets by step type (from the design handoff). */
export const LAYOUT_PRESETS = {
  story: { scale: 1, orbTop: '31%', stageTop: '47%' },
  input: { scale: 0.36, orbTop: '15%', stageTop: '25%' },
  summary: { scale: 0.62, orbTop: '20%', stageTop: '34%' },
  splash: { scale: 0.95, orbTop: '33%', stageTop: '55%' },
} as const

export type LayoutPreset = {
  scale: number
  orbTop: string
  stageTop: string
}

export type LayoutPresetTable = Record<
  'story' | 'input' | 'summary' | 'splash',
  LayoutPreset
>

/**
 * The same four frames on a phone in portrait.
 *
 * Percentages of a 402 × 874 viewport rather than a 1440 × 900 one, so the
 * landscape numbers do not transfer: the orb has to clear a top bar that now
 * takes 7% of the height instead of 4%, and the stage has to start high enough
 * that a three-row choice step and its nav still land above the fold. The orb
 * also shrinks harder on input frames — at the desktop 0.36 its 180px ring is
 * wider than half the screen and reads as a background, not a subject.
 *
 * Selected in `onboarding-spotlight.tsx` by `useViewportMode()`, which is the
 * only mobile-owned module the desktop onboarding touches.
 */
export const LAYOUT_PRESETS_PORTRAIT: LayoutPresetTable = {
  story: { scale: 0.78, orbTop: '22%', stageTop: '40%' },
  input: { scale: 0.34, orbTop: '12%', stageTop: '19%' },
  summary: { scale: 0.56, orbTop: '15%', stageTop: '26%' },
  splash: { scale: 0.72, orbTop: '24%', stageTop: '48%' },
}

export function layoutTypeOf(
  step: SpotlightStep,
): 'story' | 'input' | 'summary' {
  if (step.kind === 'welcome' || step.kind === 'story') return 'story'
  if (step.kind === 'summary') return 'summary'
  return 'input'
}

// ── Orb colors ──────────────────────────────────────────────────────
// Indigo / ember / green — the same trio the reactive prototype settled on
// as its resting state.

export const ORB_COLORS = {
  bg: 'transparent',
  c1: 'oklch(62% .2 265)',
  c2: 'oklch(65% .22 25)',
  c3: 'oklch(60% .17 145)',
} as const
