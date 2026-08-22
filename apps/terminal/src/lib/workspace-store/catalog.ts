// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { normalizeInstrumentClass } from '@pairlens/shared/market-ref'
import type {
  LayoutCell,
  LayoutColumn,
  PaneInstance,
  TerminalLayout,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import type {
  AssetClass,
  ScreenSize,
  TemplateContext,
  TraderType,
  WorkspaceTemplate,
} from './types'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import {
  FOURK_COMMAND_CENTER,
  LAPTOP_FOCUSED,
  LAPTOP_SPLIT,
  PRESET_ANALYSIS,
  PRESET_CHART_FOCUS,
  PRESET_DEFAULT,
  PRESET_DUAL_CHARTS,
  PRESET_QUAD_CHARTS,
  PRESET_TRADING,
  PRESET_TRIPLE_CHARTS,
  SPOT_RESEARCH_LAYOUT,
  ULTRAWIDE_FULL_DASHBOARD,
  ULTRAWIDE_WIDE_TRADING,
} from '@/lib/layout/presets'
import {
  DISCOVERY_ANALYSIS,
  DISCOVERY_HOME,
  DISCOVERY_MARKETS,
  DISCOVERY_NEWS,
  DISCOVERY_OVERVIEW,
} from '@/lib/layout/workspaces/discovery-presets'

// ── Facet display metadata ──────────────────────────────────────────
//
// Ordered so the filter bar renders deterministically. Labels default to
// English; the store wraps them with i18n fallbacks at render time.

export const TRADER_TYPES: Array<TraderType> = [
  'scalper',
  'day-trader',
  'swing-trader',
  'position-investor',
  'news-trader',
  'dex-degen',
  'quant',
]

export const TRADER_TYPE_META: Record<
  TraderType,
  { label: string; description: string }
> = {
  scalper: {
    label: 'Scalper',
    description: 'Fast in-and-out on tight spreads',
  },
  'day-trader': {
    label: 'Day Trader',
    description: 'Intraday momentum & flow',
  },
  'swing-trader': {
    label: 'Swing Trader',
    description: 'Multi-day trend positions',
  },
  'position-investor': {
    label: 'Investor',
    description: 'Longer-horizon portfolio focus',
  },
  'news-trader': {
    label: 'News Trader',
    description: 'Headline- and catalyst-driven',
  },
  'dex-degen': {
    label: 'DEX Degen',
    description: 'On-chain & memecoin hunting',
  },
  quant: { label: 'Quant', description: 'Signal- and data-heavy workflows' },
}

export const ASSET_CLASSES: Array<AssetClass> = [
  'crypto-spot',
  'crypto-perp',
  'dex',
  'memecoins',
  'equities',
  'predictions',
  'multi-asset',
]

export const ASSET_CLASS_META: Record<
  AssetClass,
  { label: string; description: string }
> = {
  'crypto-spot': { label: 'Crypto Spot', description: 'Centralised exchanges' },
  'crypto-perp': { label: 'Perps', description: 'Perpetual futures' },
  dex: { label: 'DEX', description: 'On-chain / decentralised' },
  memecoins: { label: 'Memecoins', description: 'Launchpad tokens' },
  equities: { label: 'Equities', description: 'Stocks & ETFs' },
  predictions: { label: 'Predictions', description: 'Event contracts' },
  'multi-asset': { label: 'Multi-Asset', description: 'Mixed markets' },
}

export const SCREEN_SIZES: Array<ScreenSize> = [
  'compact',
  'standard',
  'wide',
  'multi',
]

export const SCREEN_SIZE_META: Record<
  ScreenSize,
  { label: string; description: string }
> = {
  compact: { label: 'Compact', description: 'Laptop · 1–2 columns' },
  standard: { label: 'Standard', description: 'Desktop · 2–3 columns' },
  wide: { label: 'Wide', description: 'Ultrawide · 3–4 columns' },
  multi: { label: 'Multi-Monitor', description: '4+ columns' },
}

// ── Layout builder ──────────────────────────────────────────────────
//
// A tiny DSL so template layouts stay readable. Panes that structurally need
// an active pair / wallet are auto-bound to the template's variables, matching
// how the layout reducer wires panes when they're added interactively.

// These two sets restate what each panel declares in its manifest
// (`requires: ['workspace:active-pair' | 'workspace:active-wallet']`, see
// pairlens-core, pairlens-intelligence and the four family plugins). They
// exist as a copy because the catalog builds its layouts at module scope, long
// before a pane registry exists to ask — `createPaneInstance` in
// lib/layout/reducer.ts is the runtime half of the same rule. A copy can
// drift, so dependency-analysis.test.ts asserts these match the real
// manifests.
const PANES_NEEDING_PAIR = new Set([
  'chart',
  'data-log',
  'depth',
  'orderbook',
  'trades',
  'pair-info',
  'multi-price',
  'liquidity-heatmap',
  'trade-entry',
  'symbol-news',
  'venue-ladder',
  'pair-dossier',
  'sector-peers',
  'funding-belt',
  'liquidation-map',
  'event-header',
  'prediction-chart',
  'event-brief',
  'what-moved-it',
  'outcome-ladder',
  'basket-ticket',
  'pool-stats',
  'onchain-trades',
  'meme-token-stats',
  'meme-flow',
  'meme-safety',
  'route',
  'fee-accrual',
  'lp-position',
  'manage-liquidity',
  'chain-ladder',
  'route-bridge',
  'level-1',
  'company',
  'insider-activity',
  'your-position',
])

const PANES_NEEDING_WALLET = new Set([
  'trade-entry',
  'positions',
  'portfolio',
  'margin-health',
  'basket-ticket',
  'fee-accrual',
  'lp-position',
  'manage-liquidity',
  'route-bridge',
  'in-flight',
  'your-position',
])

type CellSpec = { h: number; panes: Array<string> }
type ColSpec = { w: number; cells: Array<CellSpec> }
type BuildOpts = { pairVar?: string; walletVar?: string }

function buildLayout(
  prefix: string,
  cols: Array<ColSpec>,
  opts: BuildOpts = {},
): TerminalLayout {
  const { pairVar, walletVar } = opts
  const columns: Array<LayoutColumn> = cols.map((col, ci) => {
    const cells: Array<LayoutCell> = col.cells.map((cell, ei) => {
      const panes: Array<PaneInstance> = cell.panes.map((type, pi) => {
        const pane: PaneInstance = {
          id: `${prefix}-p-${ci}-${ei}-${pi}`,
          type,
        }
        const bindings: Record<string, string> = {}
        if (pairVar && PANES_NEEDING_PAIR.has(type)) {
          bindings['active-pair'] = pairVar
        }
        if (walletVar && PANES_NEEDING_WALLET.has(type)) {
          bindings['active-wallet'] = walletVar
        }
        if (Object.keys(bindings).length > 0) pane.bindings = bindings
        return pane
      })
      return {
        id: `${prefix}-c-${ci}-${ei}`,
        panes,
        activeTabIndex: 0,
        heightPercent: cell.h,
      }
    })
    return { id: `${prefix}-col-${ci}`, cells, widthPercent: col.w }
  })
  return { version: 1, columns }
}

/** A `$pair` variable defaulting to a concrete market so charts render on open. */
function pairVariable(
  pairKey: string,
  market: string,
): WorkspaceVariableDefinition {
  return {
    name: '$pair',
    label: 'Pair',
    type: 'pair',
    defaultValue: { pairKey, market },
  }
}

/** A `$wallet` variable — no default, so the user picks a connected account. */
const WALLET_VARIABLE: WorkspaceVariableDefinition = {
  name: '$wallet',
  label: 'Account',
  type: 'wallet',
}

const PAIR = '$pair'
const WALLET = '$wallet'

// ── Binding + copy ──────────────────────────────────────────────────

function layoutPaneTypes(layout: TerminalLayout): Set<string> {
  const types = new Set<string>()
  for (const col of layout.columns ?? []) {
    for (const cell of col.cells ?? []) {
      for (const pane of cell.panes ?? []) {
        if (pane?.type) types.add(pane.type)
      }
    }
  }
  return types
}

/**
 * Derive the variables a raw layout needs from the panes it contains.
 *
 * Exported because plugin-contributed workspaces go through the same rule:
 * a contribution declares only the market a copy opens on (`pairDefault`),
 * never the variable list, so there is one place that decides what `$pair`
 * and `$wallet` mean.
 */
export function variablesForLayout(
  layout: TerminalLayout,
  pairDefault?: { pairKey: string; market: string } | null,
): Array<WorkspaceVariableDefinition> {
  const types = layoutPaneTypes(layout)
  const vars: Array<WorkspaceVariableDefinition> = []
  if ([...types].some((t) => PANES_NEEDING_PAIR.has(t))) {
    // `null` means "no default": a prediction contract expires, so seeding a
    // copied workspace with one would chart a settled market next month.
    vars.push(
      pairDefault === null
        ? { name: '$pair', label: 'Pair', type: 'pair' }
        : pairVariable(
            pairDefault?.pairKey ?? 'BTC-USDT',
            pairDefault?.market ?? 'okx',
          ),
    )
  }
  if ([...types].some((t) => PANES_NEEDING_WALLET.has(t))) {
    vars.push(WALLET_VARIABLE)
  }
  return vars
}

/**
 * Clone a layout, binding pair-/wallet-consuming panes to the template's
 * variables. Idempotent — panes that already declare a binding keep it. Applied
 * on copy so a template's raw `.layout` can double as an in-place route preset.
 */
export function bindLayoutVariables(
  layout: TerminalLayout,
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
): TerminalLayout {
  const pairVar = variables.find((v) => v.type === 'pair')?.name
  const walletVar = variables.find((v) => v.type === 'wallet')?.name
  return {
    version: 1,
    columns: (layout.columns ?? []).map((col) => ({
      ...col,
      cells: (col.cells ?? []).map((cell) => ({
        ...cell,
        panes: (cell.panes ?? []).map((pane) => {
          const bindings: Record<string, string> = { ...pane.bindings }
          if (
            pairVar &&
            PANES_NEEDING_PAIR.has(pane.type) &&
            !bindings['active-pair']
          ) {
            bindings['active-pair'] = pairVar
          }
          if (
            walletVar &&
            PANES_NEEDING_WALLET.has(pane.type) &&
            !bindings['active-wallet']
          ) {
            bindings['active-wallet'] = walletVar
          }
          return Object.keys(bindings).length > 0
            ? { ...pane, bindings }
            : { ...pane }
        }),
      })),
    })),
  }
}

/** Map a template to the params `createWorkspace` expects (bindings applied). */
export function templateToWorkspaceParams(template: WorkspaceTemplate): {
  name: string
  description?: string
  icon?: string
  variables: Array<WorkspaceVariableDefinition>
  defaultLayout: TerminalLayout
} {
  return {
    name: template.name,
    description: template.description,
    icon: template.icon,
    variables: template.variables,
    defaultLayout: bindLayoutVariables(template.layout, template.variables),
  }
}

// ── The catalog ─────────────────────────────────────────────────────

const STANDALONE_TEMPLATES: Array<WorkspaceTemplate> = [
  {
    id: 'template:scalpers-cockpit',
    name: "Scalper's Cockpit",
    tagline: 'Chart, book, and one-click entry — nothing else.',
    description:
      'A minimal two-column cockpit for fast execution: a chart beside a live order book, market depth, and a trade-entry ticket. Built for speed on a single screen.',
    icon: 'Crosshair',
    author: 'Pairlens',
    featured: true,
    facets: {
      traderTypes: ['scalper', 'day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['execution', 'orderbook', 'fast'],
    variables: [pairVariable('BTC-USDT', 'okx')],
    layout: buildLayout(
      'scalp',
      [
        { w: 62, cells: [{ h: 100, panes: ['chart'] }] },
        {
          w: 38,
          cells: [
            { h: 55, panes: ['orderbook'] },
            { h: 45, panes: ['trade-entry'] },
          ],
        },
      ],
      { pairVar: PAIR, walletVar: WALLET },
    ),
  },
  {
    id: 'template:day-trader-pro',
    name: 'Day Trader Pro',
    tagline: 'Scan, chart, and trade the intraday session.',
    description:
      'A balanced three-column desk: a markets scanner on the left, a large chart in the middle, and an order book plus trade ticket and open positions on the right. The everyday driver for active crypto trading.',
    icon: 'Zap',
    author: 'Pairlens',
    featured: true,
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['intraday', 'scanner', 'execution'],
    variables: [pairVariable('BTC-USDT', 'okx'), WALLET_VARIABLE],
    layout: buildLayout(
      'daytrade',
      [
        { w: 26, cells: [{ h: 100, panes: ['markets'] }] },
        { w: 46, cells: [{ h: 100, panes: ['chart'] }] },
        {
          w: 28,
          cells: [
            { h: 45, panes: ['orderbook'] },
            { h: 30, panes: ['trade-entry'] },
            { h: 25, panes: ['positions'] },
          ],
        },
      ],
      { pairVar: PAIR, walletVar: WALLET },
    ),
  },
  {
    id: 'template:cross-venue-desk',
    name: 'Cross-Venue Desk',
    tagline: 'One pair, every venue, cheapest fill on top.',
    description:
      'Built around the Multi-Price panel: the active pair quoted on every venue that lists it, ranked by price so the best fill is the top row. A chart and the tape sit beside it, with the order book and a trade ticket ready to act on the gap.',
    icon: 'Scale',
    author: 'Pairlens',
    featured: true,
    facets: {
      traderTypes: ['scalper', 'day-trader', 'quant'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['multi-venue', 'spread', 'best-fill'],
    variables: [pairVariable('BTC-USDT', 'okx'), WALLET_VARIABLE],
    layout: buildLayout(
      'venue',
      [
        {
          w: 44,
          cells: [
            { h: 68, panes: ['chart'] },
            { h: 32, panes: ['trades', 'data-log'] },
          ],
        },
        { w: 30, cells: [{ h: 100, panes: ['multi-price'] }] },
        {
          w: 26,
          cells: [
            { h: 55, panes: ['orderbook'] },
            { h: 45, panes: ['trade-entry'] },
          ],
        },
      ],
      { pairVar: PAIR, walletVar: WALLET },
    ),
  },
  {
    id: 'template:swing-overview',
    name: 'Swing Overview',
    tagline: 'Trend context with a watchlist and the movers.',
    description:
      'A calmer layout for multi-day positions: a full chart alongside your watchlist, the top movers, and pair fundamentals. Enough context to size a swing without the noise of an execution desk.',
    icon: 'Activity',
    author: 'Pairlens',
    facets: {
      traderTypes: ['swing-trader', 'position-investor'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['standard'],
    },
    tags: ['trend', 'watchlist', 'context'],
    variables: [pairVariable('BTC-USDT', 'okx')],
    layout: buildLayout(
      'swing',
      [
        {
          w: 64,
          cells: [
            { h: 70, panes: ['chart'] },
            { h: 30, panes: ['pair-info'] },
          ],
        },
        {
          w: 36,
          cells: [
            { h: 50, panes: ['watchlist'] },
            { h: 50, panes: ['top-coins'] },
          ],
        },
      ],
      { pairVar: PAIR },
    ),
  },
  {
    id: 'template:ai-research-desk',
    name: 'AI Research Desk',
    tagline: 'A chart flanked by the symbol wire and the global feed.',
    description:
      'Pair a chart with both the symbol news feed and the global wire, for catalyst-driven trading where the story matters as much as the tape. The AI assistant rides in the dock, so it is on hand here without taking a column.',
    icon: 'Brain',
    author: 'Pairlens',
    featured: true,
    facets: {
      traderTypes: ['news-trader', 'swing-trader'],
      assetClasses: ['multi-asset', 'crypto-spot'],
      screenSizes: ['wide', 'standard'],
    },
    tags: ['ai', 'news', 'research'],
    variables: [pairVariable('BTC-USDT', 'okx')],
    layout: buildLayout(
      'airesearch',
      [
        { w: 60, cells: [{ h: 100, panes: ['chart'] }] },
        {
          w: 40,
          cells: [
            { h: 55, panes: ['symbol-news'] },
            { h: 45, panes: ['news'] },
          ],
        },
      ],
      { pairVar: PAIR },
    ),
  },
  {
    id: 'template:market-discovery',
    name: 'Market Discovery',
    tagline: 'Find what is moving before you commit.',
    description:
      'A pure discovery board: the markets scanner, top movers, a sector heatmap, your watchlist, and the Fear & Greed gauge. No chart, no ticket — just for hunting the next setup.',
    icon: 'Compass',
    author: 'Pairlens',
    facets: {
      traderTypes: ['day-trader', 'swing-trader', 'news-trader'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'heatmap', 'movers'],
    variables: [],
    layout: buildLayout('discover', [
      { w: 46, cells: [{ h: 100, panes: ['markets'] }] },
      {
        w: 30,
        cells: [
          { h: 60, panes: ['heatmap'] },
          { h: 40, panes: ['top-coins'] },
        ],
      },
      {
        w: 24,
        cells: [
          { h: 60, panes: ['watchlist'] },
          { h: 40, panes: ['fear-greed'] },
        ],
      },
    ]),
  },
  {
    id: 'template:portfolio-command',
    name: 'Portfolio Command',
    tagline: 'Balances, positions, and risk at a glance.',
    description:
      'An account-centric cockpit: your portfolio breakdown, open positions, live risk guardrails, and a watchlist to keep an eye on the rest of the book. For managing what you already hold.',
    icon: 'Shield',
    author: 'Pairlens',
    facets: {
      traderTypes: ['position-investor', 'swing-trader'],
      assetClasses: ['multi-asset', 'crypto-spot'],
      screenSizes: ['standard'],
    },
    tags: ['portfolio', 'risk', 'positions'],
    variables: [WALLET_VARIABLE],
    layout: buildLayout(
      'portfolio',
      [
        {
          w: 58,
          cells: [
            { h: 55, panes: ['portfolio'] },
            { h: 45, panes: ['positions'] },
          ],
        },
        {
          w: 42,
          cells: [
            { h: 50, panes: ['risk'] },
            { h: 50, panes: ['watchlist'] },
          ],
        },
      ],
      { walletVar: WALLET },
    ),
  },
  {
    id: 'template:quant-signals',
    name: 'Quant Signals',
    tagline: 'Data log, heatmap, and risk for signal-driven trading.',
    description:
      'A data-first desk: a chart paired with the raw data log, a liquidity heatmap, live risk state, and the markets scanner. For traders who read the tape as numbers, not candles.',
    icon: 'Scan',
    author: 'Pairlens',
    facets: {
      traderTypes: ['quant', 'day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['wide'],
    },
    tags: ['data', 'signals', 'heatmap'],
    variables: [pairVariable('BTC-USDT', 'okx')],
    layout: buildLayout(
      'quant',
      [
        {
          w: 40,
          cells: [
            { h: 60, panes: ['chart'] },
            { h: 40, panes: ['data-log'] },
          ],
        },
        { w: 34, cells: [{ h: 100, panes: ['liquidity-heatmap'] }] },
        {
          w: 26,
          cells: [
            { h: 45, panes: ['risk'] },
            { h: 55, panes: ['markets'] },
          ],
        },
      ],
      { pairVar: PAIR },
    ),
  },
  {
    id: 'template:ultrawide-trading-floor',
    name: 'Ultrawide Trading Floor',
    tagline: 'Everything, everywhere — for the big screen.',
    description:
      'A four-column command center that fills an ultrawide or second monitor: scanner, chart, order book and depth, and a trade ticket over your open positions. The maximalist layout.',
    icon: 'Layers',
    author: 'Pairlens',
    facets: {
      traderTypes: ['day-trader', 'scalper', 'quant'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['multi', 'wide'],
    },
    tags: ['ultrawide', 'multi-monitor', 'everything'],
    variables: [pairVariable('BTC-USDT', 'okx'), WALLET_VARIABLE],
    layout: buildLayout(
      'floor',
      [
        { w: 20, cells: [{ h: 100, panes: ['markets'] }] },
        { w: 38, cells: [{ h: 100, panes: ['chart'] }] },
        {
          w: 22,
          cells: [
            { h: 55, panes: ['orderbook'] },
            { h: 45, panes: ['depth'] },
          ],
        },
        {
          w: 20,
          cells: [
            { h: 50, panes: ['trade-entry'] },
            { h: 50, panes: ['positions'] },
          ],
        },
      ],
      { pairVar: PAIR, walletVar: WALLET },
    ),
  },
]

// ── Migrated route presets ──────────────────────────────────────────
//
// The former ⌘⇧L "Workspaces" dropdown presets (pair + discovery routes),
// promoted to first-class store templates. Their raw `.layout` is reused
// verbatim as the in-place route preset (see `routePresets`); on copy it's
// bound to the derived variables. `author`/`variables` are filled in for each.

function presetTemplate(
  input: Omit<WorkspaceTemplate, 'author' | 'variables'> & {
    /**
     * Seed for the derived `$pair` variable, so a copy of a class-specific
     * layout opens on its own asset class instead of BTC-USDT on OKX.
     * `null` derives the variable with no default at all.
     */
    pairDefault?: { pairKey: string; market: string } | null
  },
): WorkspaceTemplate {
  const { pairDefault, ...rest } = input
  return {
    author: 'Pairlens',
    ...rest,
    variables: variablesForLayout(rest.layout, pairDefault),
  }
}

/**
 * A chart-only preset where each chart pane gets its OWN pair variable, so the
 * charts stay independent when copied (the whole point of these layouts). On
 * the pair route the bindings are inert (no variables provider) and every chart
 * falls back to the route pair, matching the in-place preset. `chartDefaults`
 * seeds a different pair per chart, in document order.
 */
function multiChartPreset(
  input: Omit<WorkspaceTemplate, 'author' | 'variables' | 'layout'> & {
    layout: TerminalLayout
    chartDefaults: Array<{ pairKey: string; market: string }>
  },
): WorkspaceTemplate {
  const { chartDefaults, layout: raw, ...rest } = input
  const variables: Array<WorkspaceVariableDefinition> = []
  let chartIdx = 0
  const layout: TerminalLayout = {
    version: 1,
    columns: raw.columns.map((col) => ({
      ...col,
      cells: col.cells.map((cell) => ({
        ...cell,
        panes: cell.panes.map((pane) => {
          if (pane.type !== 'chart') return { ...pane }
          const n = chartIdx + 1
          const name = `$chart${n}`
          variables.push({
            name,
            label: `Chart ${n}`,
            type: 'pair',
            defaultValue: chartDefaults[chartIdx] ?? {
              pairKey: 'BTC-USDT',
              market: 'okx',
            },
          })
          chartIdx += 1
          return {
            ...pane,
            bindings: { ...pane.bindings, 'active-pair': name },
          }
        }),
      })),
    })),
  }
  return { author: 'Pairlens', ...rest, variables, layout }
}

const PRESET_TEMPLATES: Array<WorkspaceTemplate> = [
  // ── Pair-route layouts (quick-apply in the pair layout menu) ──
  presetTemplate({
    id: 'template:classic-terminal',
    name: 'Spot Execution',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'CandlestickChart',
    tagline: 'Best bid and ask across every venue you connected.',
    description:
      'The default spot layout: chart with the tape and positions below it, and a rail that leads with the cross-venue ladder above the book and ticket.',
    facets: {
      traderTypes: ['day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['default', 'balanced'],
    layout: PRESET_DEFAULT,
  }),
  presetTemplate({
    id: 'template:chart-focus',
    name: 'Chart Focus',
    menuLabel: 'Chart Focus',
    context: 'pair',
    routeMenu: true,
    icon: 'Target',
    tagline: 'One big chart with tabbed data underneath.',
    description:
      'A single-column layout that gives the chart maximum room, with positions, the data log, and the trade ticket tucked into a tab strip below.',
    facets: {
      traderTypes: ['scalper', 'day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['chart', 'minimal'],
    layout: PRESET_CHART_FOCUS,
  }),
  presetTemplate({
    id: 'template:trading',
    name: 'Trading',
    menuLabel: 'Trading',
    context: 'pair',
    routeMenu: true,
    icon: 'Zap',
    tagline: 'Order book and ticket beside a full-height chart.',
    description:
      'A two-column execution desk: order book over the trade ticket on the left, and the chart with positions and risk taking the rest of the width.',
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['execution', 'orderbook'],
    layout: PRESET_TRADING,
  }),
  presetTemplate({
    id: 'template:chart-analysis',
    name: 'Chart Analysis',
    menuLabel: 'Analysis',
    context: 'pair',
    routeMenu: true,
    icon: 'Activity',
    tagline: 'Chart and data left, execution right.',
    description:
      'A study-oriented split: chart, data, and risk on the left; the order book and trade ticket on the right.',
    facets: {
      traderTypes: ['swing-trader', 'day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['wide', 'standard'],
    },
    tags: ['analysis', 'research'],
    layout: PRESET_ANALYSIS,
  }),
  presetTemplate({
    id: 'template:spot-research',
    name: 'Spot Research',
    menuLabel: 'Research',
    context: 'pair',
    routeMenu: true,
    icon: 'Brain',
    tagline: 'A reason before a ticket.',
    description:
      "For positions held longer than a session: chart over the pair dossier, the pair's own news wire beside it, and a quote-sized ticket over its sector peers. No order book, so no depth stream opens.",
    facets: {
      traderTypes: ['swing-trader', 'position-investor'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['spot', 'research'],
    layout: SPOT_RESEARCH_LAYOUT,
  }),
  // ── Per-asset-class pair defaults live in their family plugins ──
  //
  // `template:perps-terminal`, `template:prediction-terminal`,
  // `template:dex-terminal` and `template:equities-terminal` used to sit here.
  // Each is now shipped by the plugin whose asset class it serves, through
  // `contributes.workspaces`, and reaches the store and the route menus via
  // the workspace-template registry — so disabling the family takes its
  // layouts with it. The same move carried `template:dex-degen` and
  // `template:equities-desk` out of the standalone list above. Ids are
  // unchanged, so translations, deep links and popularity survive.
  multiChartPreset({
    id: 'template:dual-charts',
    name: 'Dual Charts',
    menuLabel: 'Dual Charts',
    context: 'pair',
    routeMenu: true,
    icon: 'Layers',
    tagline: 'Two side-by-side charts.',
    description:
      'Two independent chart panes side by side — each keeps its own market, timeframe, and chart type. Set a different pair per pane with its pair picker.',
    facets: {
      traderTypes: ['quant', 'day-trader'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['wide', 'multi'],
    },
    tags: ['multi-chart', 'compare'],
    layout: PRESET_DUAL_CHARTS,
    chartDefaults: [
      { pairKey: 'BTC-USDT', market: 'okx' },
      { pairKey: 'ETH-USDT', market: 'okx' },
    ],
  }),
  multiChartPreset({
    id: 'template:triple-charts',
    name: 'Triple Charts',
    menuLabel: 'Triple Charts',
    context: 'pair',
    routeMenu: true,
    icon: 'Layers',
    tagline: 'One large chart with two stacked beside it.',
    description:
      'A large primary chart with two smaller charts stacked to the right — each independent, for watching a lead pair against two others.',
    facets: {
      traderTypes: ['quant', 'day-trader'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['wide', 'multi'],
    },
    tags: ['multi-chart', 'compare'],
    layout: PRESET_TRIPLE_CHARTS,
    chartDefaults: [
      { pairKey: 'BTC-USDT', market: 'okx' },
      { pairKey: 'ETH-USDT', market: 'okx' },
      { pairKey: 'SOL-USDT', market: 'okx' },
    ],
  }),
  multiChartPreset({
    id: 'template:quad-charts',
    name: 'Quad Charts',
    menuLabel: 'Quad Charts',
    context: 'pair',
    routeMenu: true,
    icon: 'Scan',
    tagline: 'A 2×2 grid of charts.',
    description:
      'Four independent charts in a 2×2 grid — a full multi-chart cockpit for tracking several markets at once.',
    facets: {
      traderTypes: ['quant', 'day-trader'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['multi', 'wide'],
    },
    tags: ['multi-chart', 'grid'],
    layout: PRESET_QUAD_CHARTS,
    chartDefaults: [
      { pairKey: 'BTC-USDT', market: 'okx' },
      { pairKey: 'ETH-USDT', market: 'okx' },
      { pairKey: 'SOL-USDT', market: 'okx' },
      { pairKey: 'BNB-USDT', market: 'okx' },
    ],
  }),
  // ── Screen-tuned pair layouts (store-only, via the Screen filter) ──
  presetTemplate({
    id: 'template:laptop-focus',
    name: 'Laptop Focus',
    context: 'pair',
    icon: 'Eye',
    tagline: 'Vertical single-column layout tuned for laptops.',
    description:
      'A compact, vertical layout that fits a laptop screen: chart on top, a data tab strip, and a slim risk bar.',
    facets: {
      traderTypes: ['day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['compact'],
    },
    tags: ['laptop', 'compact'],
    layout: LAPTOP_FOCUSED,
  }),
  presetTemplate({
    id: 'template:laptop-split',
    name: 'Laptop Split',
    context: 'pair',
    icon: 'Layers',
    tagline: 'Chart and data left, the ticket right, sized for laptops.',
    description:
      'A two-column split sized for laptops: chart, positions, and risk on the left, with the trade ticket on the right.',
    facets: {
      traderTypes: ['day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['laptop', 'split'],
    layout: LAPTOP_SPLIT,
  }),
  presetTemplate({
    id: 'template:ultrawide-dashboard',
    name: 'Ultrawide Dashboard',
    context: 'pair',
    icon: 'Radio',
    tagline: 'Every panel spread across an ultrawide monitor.',
    description:
      'A four-column dashboard for ultrawide displays: order book, chart with risk, positions and the data log, and a trade ticket rail.',
    facets: {
      traderTypes: ['day-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['wide', 'multi'],
    },
    tags: ['ultrawide', 'dashboard'],
    layout: ULTRAWIDE_FULL_DASHBOARD,
  }),
  presetTemplate({
    id: 'template:ultrawide-trading',
    name: 'Ultrawide Trading',
    context: 'pair',
    icon: 'Zap',
    tagline: 'Order book, depth, chart, and execution across the width.',
    description:
      'An ultrawide execution layout: order book and market depth on the left, chart with positions in the center, and the trade ticket on the right.',
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['wide', 'multi'],
    },
    tags: ['ultrawide', 'execution'],
    layout: ULTRAWIDE_WIDE_TRADING,
  }),
  presetTemplate({
    id: 'template:command-center',
    name: '4K Command Center',
    context: 'pair',
    icon: 'Diamond',
    tagline: 'The full command center for a 4K display.',
    description:
      'Everything on screen for a 4K monitor: order book and pair info, chart with the risk bar, positions and social, and a trade ticket rail.',
    facets: {
      traderTypes: ['day-trader'],
      assetClasses: ['crypto-spot', 'multi-asset'],
      screenSizes: ['multi'],
    },
    tags: ['4k', 'command-center'],
    layout: FOURK_COMMAND_CENTER,
  }),
  // ── Discovery-route layouts (quick-apply in the home layout menu) ──
  presetTemplate({
    id: 'template:home-pulse',
    name: 'Spot Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'Home',
    tagline: 'Open on what moved, and why.',
    description:
      'The spot home board: a market pulse strip over the movers table and the sector tape, with the full scanner beside it and news over your watchlist. Everything on it works without an account.',
    facets: {
      traderTypes: ['day-trader', 'swing-trader', 'news-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'home', 'news'],
    layout: DISCOVERY_HOME,
  }),
  presetTemplate({
    id: 'template:markets-board',
    name: 'Markets Board',
    menuLabel: 'Markets',
    context: 'discovery',
    routeMenu: true,
    icon: 'Compass',
    tagline: 'Just the markets scanner, full-screen.',
    description:
      'The full-width markets scanner — the simplest way to browse and sort every tradable pair.',
    facets: {
      traderTypes: ['day-trader', 'swing-trader'],
      assetClasses: ['multi-asset'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['discovery', 'scanner'],
    layout: DISCOVERY_MARKETS,
  }),
  presetTemplate({
    id: 'template:markets-overview',
    name: 'Markets Overview',
    menuLabel: 'Overview',
    context: 'discovery',
    routeMenu: true,
    icon: 'Eye',
    tagline: 'Scanner beside your movers and watchlist.',
    description:
      'The markets scanner alongside the top movers and your watchlist — a balanced home for finding and tracking setups.',
    facets: {
      traderTypes: ['swing-trader', 'day-trader'],
      assetClasses: ['crypto-spot', 'crypto-perp', 'dex'],
      screenSizes: ['standard'],
    },
    tags: ['discovery', 'watchlist'],
    layout: DISCOVERY_OVERVIEW,
  }),
  presetTemplate({
    id: 'template:sector-analysis',
    name: 'Sector Analysis',
    menuLabel: 'Analysis',
    context: 'discovery',
    routeMenu: true,
    icon: 'Gauge',
    tagline: 'Scanner, heatmap, movers, and watchlist.',
    description:
      'A discovery board with a sector heatmap in the middle: scanner on the left, heatmap in the center, and movers over your watchlist on the right.',
    facets: {
      traderTypes: ['swing-trader'],
      assetClasses: ['crypto-spot', 'crypto-perp', 'dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'heatmap'],
    layout: DISCOVERY_ANALYSIS,
  }),
  presetTemplate({
    id: 'template:news-board',
    name: 'News Board',
    menuLabel: 'News',
    context: 'discovery',
    routeMenu: true,
    icon: 'Globe',
    tagline: 'Markets alongside movers and the news feed.',
    description:
      'The markets scanner beside the top movers and the live news feed — a home base for catalyst-driven trading.',
    facets: {
      traderTypes: ['news-trader'],
      assetClasses: ['crypto-spot', 'crypto-perp', 'dex'],
      screenSizes: ['standard'],
    },
    tags: ['discovery', 'news'],
    layout: DISCOVERY_NEWS,
  }),
]

export const BUILTIN_WORKSPACE_TEMPLATES: Array<WorkspaceTemplate> = [
  ...STANDALONE_TEMPLATES,
  ...PRESET_TEMPLATES,
]

export type RoutePreset = {
  label: string
  layout: TerminalLayout
  /**
   * The template's variables, carried so an in-place apply can materialize
   * the ones no other pane shares — see `materializePerPaneChartPairs`. The
   * layout alone cannot say what `$chart2` was supposed to mean.
   */
  variables?: Array<WorkspaceVariableDefinition>
}

/**
 * Whether a template is built for the given instrument class. Facet values
 * and class slugs are two vocabularies, so both sides go through
 * `normalizeInstrumentClass` — a raw `includes()` here is the exact bug that
 * once made every crypto facet silently match nothing. `multi-asset` is
 * universal by definition.
 */
export function templateServesClass(
  template: WorkspaceTemplate,
  cls: InstrumentClass,
): boolean {
  return template.facets.assetClasses.some(
    (a) => a === 'multi-asset' || normalizeInstrumentClass(a) === cls,
  )
}

/**
 * The store facet an instrument class browses under — the inverse of the
 * `normalizeInstrumentClass` direction `templateServesClass` uses. Drives the
 * pre-filtered "Browse Workspace Store" link in a class's workspaces menu.
 */
export const STORE_ASSET_CLASS_FOR: Record<InstrumentClass, AssetClass> = {
  spot: 'crypto-spot',
  perp: 'crypto-perp',
  dex: 'dex',
  memecoin: 'memecoins',
  stocks: 'equities',
  prediction: 'predictions',
}

/**
 * In-place layout presets for a route's ⌘⇧L menu, derived from the catalog —
 * the store is the single source. Returns the raw (bound) layout together with
 * the variables behind it: a binding several panes share is inert on the
 * pair/home routes (no variables provider) and those panes resolve against the
 * route's active pair, while a binding one pane owns is materialized at apply
 * time so a multi-chart board opens with a chart per instrument.
 *
 * Pass `cls` to tailor the menu to an asset class: only templates whose
 * asset-class facet serves it (or `multi-asset`) are offered, so a
 * prediction page never suggests a spot execution desk.
 */
export function routePresets(
  context: TemplateContext,
  cls?: InstrumentClass,
): Record<string, RoutePreset> {
  const out: Record<string, RoutePreset> = {}
  for (const t of BUILTIN_WORKSPACE_TEMPLATES) {
    if ((t.context ?? 'standalone') !== context || !t.routeMenu) continue
    if (cls && !templateServesClass(t, cls)) continue
    out[t.id] = {
      label: t.menuLabel ?? t.name,
      layout: t.layout,
      variables: t.variables,
    }
  }
  return out
}

/** Menu label that marks the entry a route opens on. */
export const DEFAULT_PRESET_LABEL = 'Default'

/**
 * Id of the synthesized Default entry — the workspace's own `defaultPreset`,
 * offered when no plugin is around to offer it.
 */
export const CLASS_DEFAULT_PRESET_ID = 'preset:class-default'

/**
 * Fold plugin-contributed templates into a route's built-in preset base.
 *
 * The class default now arrives from a plugin (the perps desk from
 * `pairlens-cex-futures`, the prediction desk from `pairlens-predictions`),
 * and a menu that opened with "Dual Charts" and buried "Default" at the bottom
 * would read as broken. So contributed entries labelled `Default` lead, the
 * built-in base follows in its own order, and the rest of the contributed
 * entries trail in registration order. Object key order is insertion order for
 * string keys, which is what the menu renders from.
 *
 * `defaultLayout` is the workspace's own `defaultPreset`. Disabling the family
 * plugin takes the contributed Default with it, but the route still BOOTS on
 * that layout, so a menu with no way back to it is a dead end. When nothing
 * carries the Default slot, it is synthesized and leads.
 *
 * Pure and synchronous — `useRoutePresets` is the React wrapper that feeds it
 * the live registry.
 */
export function mergeRoutePresets(
  base: Record<string, RoutePreset>,
  contributed: ReadonlyArray<WorkspaceTemplate>,
  context: TemplateContext,
  cls?: InstrumentClass,
  defaultLayout?: TerminalLayout,
): Record<string, RoutePreset> {
  const leading: Record<string, RoutePreset> = {}
  const trailing: Record<string, RoutePreset> = {}

  for (const t of contributed) {
    if ((t.context ?? 'standalone') !== context || !t.routeMenu) continue
    if (cls && !templateServesClass(t, cls)) continue
    const label = t.menuLabel ?? t.name
    const bucket = t.menuLabel === DEFAULT_PRESET_LABEL ? leading : trailing
    bucket[t.id] = { label, layout: t.layout, variables: t.variables }
  }

  const merged = { ...leading, ...base, ...trailing }
  const hasDefault = Object.values(merged).some(
    (p) => p.label === DEFAULT_PRESET_LABEL,
  )
  if (hasDefault || !defaultLayout) return merged

  return {
    [CLASS_DEFAULT_PRESET_ID]: {
      label: DEFAULT_PRESET_LABEL,
      layout: defaultLayout,
    },
    ...merged,
  }
}
