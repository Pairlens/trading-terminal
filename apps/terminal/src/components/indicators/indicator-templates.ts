// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Starter scripts for the workbench empty state.
 *
 * The sources are not written here — they are the shipped `EXAMPLE_SCRIPTS`
 * from `lib/python/examples.ts`, which are the same fixtures the SDK tests and
 * the docs lean on. This module only decides which of them the empty state
 * offers and how each is dressed for the shelf, so there is exactly one copy
 * of every template's Python in the repo.
 *
 * Strategy examples deliberately do not appear here: a strategy's home is the
 * Bots page, which creates the script and the paper deployment in one go.
 */
import {
  Activity,
  BarChart3,
  CalendarClock,
  Layers,
  TrendingUp,
  Waves,
} from 'lucide-react'

import type { StarterTemplate } from '../starter-empty-state'
import type { LucideIcon } from 'lucide-react'
import type { ExampleScript } from '@/lib/python/examples'
import { EXAMPLE_SCRIPTS } from '@/lib/python/examples'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

/** Shelf order and dressing, keyed by the example's `name`. */
type Dressing = {
  id: string
  icon: LucideIcon
  /** i18n key for the one-line description under the title. */
  descriptionKey: string
  /** Short, technical, and safe to leave untranslated. */
  chips: Array<string>
}

const DRESSING: Array<Dressing> = [
  {
    id: 'sma',
    icon: TrendingUp,
    descriptionKey: 'indicatorsPage.templateSma',
    chips: ['ta.sma', 'overlay', 'input.int'],
  },
  {
    id: 'rsi',
    icon: Activity,
    descriptionKey: 'indicatorsPage.templateRsi',
    chips: ['ta.rsi', 'sub-pane', 'alerts'],
  },
  {
    id: 'macd',
    icon: BarChart3,
    descriptionKey: 'indicatorsPage.templateMacd',
    chips: ['ta.macd', 'histogram', 'per-bar color'],
  },
  {
    id: 'bollinger',
    icon: Waves,
    descriptionKey: 'indicatorsPage.templateBollinger',
    chips: ['ta.bb', 'fill.between', 'two files'],
  },
  {
    id: 'supertrend',
    icon: Layers,
    descriptionKey: 'indicatorsPage.templateSupertrend',
    chips: ['ta.supertrend', 'markers', 'plot()'],
  },
  {
    id: 'htf',
    icon: CalendarClock,
    descriptionKey: 'indicatorsPage.templateHtf',
    chips: ['request.security', 'align()', 'background'],
  },
]

/** The example each shelf slot points at, in shelf order. */
const EXAMPLE_BY_ID: Record<string, string> = {
  sma: 'Simple Moving Average',
  rsi: 'RSI',
  macd: 'MACD',
  bollinger: 'Bollinger Bands',
  supertrend: 'SuperTrend',
  htf: 'Higher-Timeframe Trend',
}

export type IndicatorTemplate = StarterTemplate & {
  /** The shipped example this template creates, source and helper files. */
  example: ExampleScript
}

/**
 * Build the shelf. `t` is passed in rather than imported so the module stays
 * a plain function of its inputs and a test can hand it the identity.
 */
export function indicatorTemplates(
  t: (key: string) => string,
): Array<IndicatorTemplate> {
  const templates: Array<IndicatorTemplate> = []
  for (const dressing of DRESSING) {
    const name = EXAMPLE_BY_ID[dressing.id]
    const example = EXAMPLE_SCRIPTS.find((script) => script.name === name)
    // A renamed example should drop the card, not crash the page.
    if (!example || example.kind !== 'indicator') continue
    templates.push({
      id: dressing.id,
      title: example.name,
      description: t(dressing.descriptionKey),
      icon: dressing.icon,
      chips: dressing.chips,
      example,
    })
  }
  return templates
}

/**
 * Create the script and let the workbench pick it up.
 *
 * The same `createScript` call the sidebar's "new script" and the old template
 * buttons make — the workbench auto-selects the newest script when nothing is
 * selected, so creating it is all that opening it takes. Picking a template
 * whose name is already taken selects the existing script instead of stacking
 * up "Simple Moving Average" copies.
 */
export function applyIndicatorTemplate(template: IndicatorTemplate): string {
  const store = useIndicatorScriptsStore.getState()
  const existing = store.scripts.find(
    (script) => script.name === template.example.name,
  )
  if (existing) return existing.id
  return store.createScript(
    template.example.name,
    template.example.source,
    template.example.modules,
  )
}
