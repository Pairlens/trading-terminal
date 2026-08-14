// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Starter bots for the empty state.
 *
 * A bot is a strategy script plus a market, so a template has to produce both.
 * The scripts are the shipped `strategy(...)` examples from
 * `lib/python/examples.ts` — the same sources the workbench, the backtester and
 * the docs use — so there is one copy of each strategy's Python in the repo and
 * a template can never drift from the code it claims to deploy.
 *
 * Applying one runs three existing paths in order:
 *
 *   1. `createScript` — the same call the indicators sidebar makes;
 *   2. `registerScript` + `cacheMeta` — exactly what pressing Run in the
 *      workbench does, and the only way a script gets the `meta.strategy` the
 *      bot runtime needs. Skipping it would produce a bot that looks fine and
 *      fails with "run it once first" the moment it is armed;
 *   3. `createBot` — the same call the create dialog makes, which hard-codes
 *      paper mode and leaves the bot switched off.
 *
 * Step 2 is why this is async: the first one pays for booting Pyodide.
 */
import { ArrowUpNarrowWide, TrendingUp, Undo2 } from 'lucide-react'

import type { StarterTemplate } from '../starter-empty-state'
import type { LucideIcon } from 'lucide-react'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { ExampleScript } from '@/lib/python/examples'
import { EXAMPLE_SCRIPTS } from '@/lib/python/examples'
import { getPythonRuntime } from '@/lib/python/python-runtime'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

/** Where a starter bot points until the user says otherwise. */
export const TEMPLATE_PAIR = 'BTC-USDT'
export const TEMPLATE_TIMEFRAME = '1h'

type Dressing = {
  id: string
  /** `name` of the shipped strategy example this deploys. */
  example: string
  icon: LucideIcon
  /** i18n key for the one-line description under the title. */
  descriptionKey: string
  /** Short, technical, and safe to leave untranslated. */
  chips: Array<string>
}

const DRESSING: Array<Dressing> = [
  {
    id: 'ema-cross',
    example: 'EMA Cross Strategy',
    icon: TrendingUp,
    descriptionKey: 'botsPage.templateEmaCross',
    chips: ['EMA 21/55', 'long + short', 'stop 3% / tp 6%'],
  },
  {
    id: 'rsi-reversion',
    example: 'RSI Reversion Bot',
    icon: Undo2,
    descriptionKey: 'botsPage.templateRsiReversion',
    chips: ['RSI 14', 'long only', 'EMA 200 filter'],
  },
  {
    id: 'breakout',
    example: 'Breakout Bot',
    icon: ArrowUpNarrowWide,
    descriptionKey: 'botsPage.templateBreakout',
    chips: ['Donchian 20', 'volume filter', 'trailing 5%'],
  },
]

export type BotTemplate = StarterTemplate & {
  /** The shipped strategy example this template deploys. */
  example: ExampleScript
}

/** Build the shelf. `t` is passed in so the module stays a pure function. */
export function botTemplates(t: (key: string) => string): Array<BotTemplate> {
  const templates: Array<BotTemplate> = []
  for (const dressing of DRESSING) {
    const example = EXAMPLE_SCRIPTS.find(
      (script) => script.name === dressing.example,
    )
    // Only a `strategy(...)` script can be deployed; a renamed or downgraded
    // example should drop the card rather than offer a bot that cannot run.
    if (!example || example.kind !== 'strategy') continue
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
 * Create the template's strategy script and give it metadata, without
 * deploying anything.
 *
 * This is the half of applying a template that the create-bot dialog also
 * needs: its strategy step offers the same ready-made strategies inline, and
 * picking one there should produce a selectable script, not a finished bot.
 * Throws if the Python runtime cannot register the script.
 */
export async function ensureBotTemplateScript(
  template: BotTemplate,
): Promise<{ scriptId: string; meta: CustomIndicatorMeta }> {
  const scripts = useIndicatorScriptsStore.getState()
  const { example } = template

  // Reuse the script if the user already has it — picking a template twice
  // should give a second bot, not a second copy of the same code.
  const existing = scripts.scripts.find((s) => s.name === example.name)
  const scriptId =
    existing?.id ??
    scripts.createScript(example.name, example.source, example.modules)

  // Same registration the workbench's Run performs, and the same cache it
  // writes to — so opening the script in the workbench afterwards finds it
  // already described and auto-runs its preview.
  const meta = await getPythonRuntime().registerScript(
    scriptId,
    example.source,
    example.modules ?? [],
  )
  useIndicatorScriptsStore.getState().cacheMeta(scriptId, {
    meta,
    metaError: null,
  })

  return { scriptId, meta }
}

/**
 * Create the strategy script, give it metadata, and deploy it on paper.
 *
 * Returns the new bot's id so the page can select it. Throws if the Python
 * runtime cannot register the script — the caller surfaces that rather than
 * leaving behind a bot that would fail on its first bar.
 */
export async function applyBotTemplate(
  template: BotTemplate,
  target: { market: string; pair?: string; timeframe?: string },
): Promise<string> {
  const { scriptId, meta } = await ensureBotTemplateScript(template)

  // The script's own declared defaults, the way the create dialog seeds them.
  const params: Record<string, unknown> = {}
  for (const input of meta.inputs) params[input.key] = input.default

  const pair = target.pair ?? TEMPLATE_PAIR
  return useBotsStore.getState().createBot({
    name: `${template.example.name} · ${pair}`,
    scriptId,
    market: target.market,
    pair,
    timeframe: target.timeframe ?? TEMPLATE_TIMEFRAME,
    params,
  })
}
