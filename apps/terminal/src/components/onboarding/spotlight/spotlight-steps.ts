// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { VenueRegion } from '@/lib/countries'
import type {
  OnboardingAssetClass,
  OnboardingRisk,
} from '@/lib/onboarding-state'

export type StepKind =
  | 'welcome'
  | 'story'
  | 'choice'
  | 'theme'
  | 'legal'
  | 'connect'
  | 'summary'

export type ChoiceLayout = 'grid' | 'rows' | 'spectrum' | 'asset' | 'country'

export type PointIcon = 'layers' | 'waypoints' | 'chart' | 'workflow' | 'check'

export type SpotlightStep = {
  /** i18n base: `onboarding.<id>` and step identity. */
  id: string
  kind: StepKind
  /** For choice steps — which selections field it writes. */
  field?:
    | 'language'
    | 'country'
    | 'currency'
    | 'asset'
    | 'venues'
    | 'experience'
    | 'risk'
    | 'analytics'
  layout?: ChoiceLayout
  multi?: boolean
  /** Venue list is derived from region + asset classes. */
  derived?: boolean
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
  // The statue hero owns the center of this frame, so the orb drifts off to
  // the right of the bust (and shrinks) instead of landing on its face.
  {
    id: 'welcome',
    kind: 'welcome',
    orbLeft: '75%',
    orbTop: '21%',
    orbScale: 0.68,
  },
  {
    id: 'oneTerminal',
    kind: 'story',
    orbLeft: '39%',
    points: ['layers', 'waypoints', 'chart'],
  },
  { id: 'country', kind: 'choice', field: 'country', layout: 'country' },
  {
    id: 'privacy',
    kind: 'story',
    pointsH: true,
    points: ['check', 'check', 'check'],
  },
  { id: 'currency', kind: 'choice', field: 'currency', layout: 'grid' },
  {
    id: 'asset',
    kind: 'choice',
    field: 'asset',
    layout: 'asset',
    multi: true,
  },
  {
    id: 'routing',
    kind: 'story',
    pointsH: true,
    orbLeft: '61%',
    points: ['waypoints', 'check', 'check'],
    chips: ['OKX', 'Binance', 'Coinbase', 'Jupiter', 'Bybit', 'Kraken'],
  },
  {
    id: 'venues',
    kind: 'choice',
    field: 'venues',
    layout: 'rows',
    multi: true,
    derived: true,
  },
  { id: 'experience', kind: 'choice', field: 'experience', layout: 'rows' },
  { id: 'risk', kind: 'choice', field: 'risk', layout: 'spectrum' },
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

export function layoutTypeOf(
  step: SpotlightStep,
): 'story' | 'input' | 'summary' {
  if (step.kind === 'welcome' || step.kind === 'story') return 'story'
  if (step.kind === 'summary') return 'summary'
  return 'input'
}

// ── Derived venues ──────────────────────────────────────────────────
// Grounded in the connectors that actually ship with Pairlens (bundled
// plugins), not the prototype's illustrative list. CEX lists are curated
// per region (e.g. Bybit is geo-blocked in the US, Upbit is KRW-centric).
// The region is derived from the selected country (lib/countries.ts).

const CEX_BY_REGION: Record<VenueRegion, Array<string>> = {
  na: ['Coinbase', 'Kraken', 'Crypto.com'],
  eu: ['Kraken', 'Coinbase', 'Bitfinex'],
  apac: ['OKX', 'Binance', 'Bybit', 'Upbit'],
  latam: ['Binance', 'OKX', 'Bitget'],
  mena: ['Binance', 'OKX', 'Bybit'],
  africa: ['Binance', 'KuCoin', 'Gate'],
}

/** No country set (global): lead with the venues with the widest coverage. */
const CEX_GLOBAL = ['Binance', 'OKX', 'Coinbase', 'Kraken']

const DEX_VENUES = ['Jupiter', 'KyberSwap']
const EQUITY_VENUES = ['Alpaca']

export type VenueOption = {
  value: string
  label: string
  kind: 'CEX' | 'DEX' | 'Equities'
}

export function venuesFor(
  region: VenueRegion | undefined,
  assetClasses: Array<OnboardingAssetClass>,
): Array<VenueOption> {
  const cex = region ? CEX_BY_REGION[region] : CEX_GLOBAL
  const out: Array<VenueOption> = []
  const push = (label: string, kind: VenueOption['kind']) =>
    out.push({ value: label, label, kind })
  if (assetClasses.includes('cex')) cex.forEach((n) => push(n, 'CEX'))
  if (assetClasses.includes('dex')) DEX_VENUES.forEach((n) => push(n, 'DEX'))
  if (assetClasses.includes('equities'))
    EQUITY_VENUES.forEach((n) => push(n, 'Equities'))
  if (out.length === 0) cex.forEach((n) => push(n, 'CEX'))
  return out
}

// ── Reactive orb colors ─────────────────────────────────────────────
// The orb's gradient drifts with the user's choices: DEX pushes green,
// equities amber, CEX indigo; aggressive risk pushes red/violet.

export type OrbColors = { bg: string; c1: string; c2: string; c3: string }

export function orbHuesFor(
  assetClasses: Array<OnboardingAssetClass>,
  risk: OnboardingRisk | undefined,
): OrbColors {
  let h1 = 265
  let h2 = 25
  let h3 = 145
  if (assetClasses.includes('dex')) {
    h1 = 152
    h3 = 150
  }
  if (assetClasses.includes('equities')) h2 = 85
  if (assetClasses.includes('cex')) h1 = 265
  if (risk === 'aggressive') {
    h2 = 25
    h1 = assetClasses.includes('dex') ? 300 : 285
  }
  if (risk === 'conservative') h3 = 155
  return {
    bg: 'transparent',
    c1: `oklch(62% .2 ${h1})`,
    c2: `oklch(65% .22 ${h2})`,
    c3: `oklch(60% .17 ${h3})`,
  }
}

// ── Static option lists for choice steps ────────────────────────────
// Labels/subs for these live in i18n under `onboarding.<step>.options.<value>`.

export const EXPERIENCE_VALUES = ['beginner', 'intermediate', 'pro'] as const

export const RISK_VALUES: Array<{
  value: OnboardingRisk
  tone: 'calm' | 'mid' | 'hot'
}> = [
  { value: 'conservative', tone: 'calm' },
  { value: 'balanced', tone: 'mid' },
  { value: 'aggressive', tone: 'hot' },
]
