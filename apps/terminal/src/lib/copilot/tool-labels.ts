// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

// ---------------------------------------------------------------------------
// Human-readable labels for copilot tool calls.
//
// The chat renders a chip per tool part. Without this map the chip showed the
// raw tool id (`get_market_snapshot`), which reads like a stack trace. Each
// tool maps to a verb + object so the chip can be phrased for the call's phase:
// "Reading the order book…" while it runs, "Read the order book" once done.
//
// This is the single source of truth — the tool ids here must match the keys
// returned by `buildCopilotTools` (a test asserts full coverage). Unknown ids
// (third-party / MCP tools) fall back to `humanizeToolName`.
// ---------------------------------------------------------------------------

/** Phase of a tool call, derived from the AI SDK part state. */
export type ToolPhase = 'running' | 'done' | 'error'

/** [present participle, past tense] for every verb used in the label table. */
const VERB_FORMS = {
  add: ['Adding', 'Added'],
  ask: ['Asking', 'Asked'],
  capture: ['Capturing', 'Captured'],
  check: ['Checking', 'Checked'],
  clear: ['Clearing', 'Cleared'],
  compare: ['Comparing', 'Compared'],
  compute: ['Computing', 'Computed'],
  create: ['Creating', 'Created'],
  draw: ['Drawing', 'Drew'],
  exit: ['Exiting', 'Exited'],
  fit: ['Fitting', 'Fitted'],
  list: ['Listing', 'Listed'],
  open: ['Opening', 'Opened'],
  propose: ['Preparing', 'Prepared'],
  read: ['Reading', 'Read'],
  redo: ['Redoing', 'Redid'],
  remove: ['Removing', 'Removed'],
  run: ['Running', 'Ran'],
  schedule: ['Scheduling', 'Scheduled'],
  scroll: ['Scrolling to', 'Scrolled to'],
  search: ['Searching', 'Searched'],
  set: ['Setting', 'Set'],
  start: ['Starting', 'Started'],
  switch: ['Switching', 'Switched'],
  undo: ['Undoing', 'Undid'],
  update: ['Updating', 'Updated'],
  validate: ['Validating', 'Validated'],
  wait: ['Waiting', 'Waited'],
} as const satisfies Record<string, readonly [string, string]>

export type ToolVerb = keyof typeof VERB_FORMS

/**
 * A chat's tool id → label table. The copilot's is below; other chats (the
 * builder assistant) pass their own to `formatToolLabel` rather than adding
 * their tools here, so each surface's table stays exactly its own tool set.
 */
export type ToolLabelMap = Record<string, readonly [ToolVerb, string]>

/** tool id → [verb, object]. An empty object renders the verb alone. */
export const COPILOT_TOOL_LABELS = {
  // ---- Market data ----
  get_market_snapshot: ['read', 'the market snapshot'],
  get_candles: ['read', 'candles'],
  get_ticker: ['read', 'the ticker'],
  get_signals: ['compute', 'strategy signals'],
  get_orderbook: ['read', 'the order book'],
  get_multi_timeframe: ['check', 'multi-timeframe confluence'],
  compare_pairs: ['compare', 'pairs'],
  list_markets: ['list', 'markets'],
  search_instruments: ['search', 'instruments'],

  // ---- Context ----
  get_top_coins: ['read', 'top coins'],
  get_news: ['read', 'the news'],
  get_fear_greed: ['check', 'the Fear & Greed index'],
  get_asset_overview: ['read', 'the asset overview'],
  get_trade_journal: ['read', 'the trade journal'],
  web_search: ['search', 'the web'],

  // ---- Portfolio ----
  get_portfolio: ['read', 'the portfolio'],
  get_open_orders: ['read', 'open orders'],
  get_risk_limits: ['check', 'risk limits'],
  get_account_settings: ['read', 'account settings'],

  // ---- Chart: indicators ----
  add_indicator: ['add', 'an indicator'],
  remove_indicator: ['remove', 'an indicator'],
  remove_all_indicators: ['remove', 'all indicators'],
  update_indicator: ['update', 'an indicator'],

  // ---- Chart: drawings ----
  draw_horizontal_line: ['draw', 'a horizontal line'],
  draw_vertical_line: ['draw', 'a vertical line'],
  draw_trendline: ['draw', 'a trendline'],
  draw_rectangle: ['draw', 'a rectangle'],
  draw_circle: ['draw', 'a circle'],
  draw_fibonacci: ['draw', 'Fibonacci levels'],
  annotate_chart: ['add', 'a chart annotation'],
  draw_stop_loss: ['draw', 'a stop loss level'],
  draw_take_profit: ['draw', 'a take profit level'],
  draw_entry_price: ['draw', 'an entry price level'],
  remove_drawing: ['remove', 'a drawing'],
  clear_drawings: ['clear', 'all drawings'],
  undo: ['undo', 'the last chart change'],
  redo: ['redo', 'the last chart change'],

  // ---- Chart: view ----
  set_chart_type: ['set', 'the chart type'],
  set_price_scale: ['set', 'the price scale'],
  fit_content: ['fit', 'the chart to the data'],
  scroll_to_latest: ['scroll', 'the latest candles'],
  take_screenshot: ['capture', 'a chart screenshot'],
  add_compare_symbol: ['add', 'a comparison symbol'],
  remove_compare_symbol: ['remove', 'a comparison symbol'],
  start_replay: ['start', 'chart replay'],
  exit_replay: ['exit', 'chart replay'],

  // ---- Chart: read-back ----
  get_chart_state: ['read', 'the chart state'],
  get_chart_indicators: ['read', 'chart indicators'],
  get_chart_drawings: ['read', 'chart drawings'],

  // ---- Trading (proposals — the user confirms before anything executes) ----
  place_order: ['propose', 'an order'],
  cancel_order: ['propose', 'an order cancellation'],

  // ---- Time ----
  wait: ['wait', ''],
  schedule_check: ['schedule', 'a follow-up check'],

  // ---- Workspace ----
  add_to_watchlist: ['add', 'to the watchlist'],
  remove_from_watchlist: ['remove', 'from the watchlist'],
  get_watchlist: ['read', 'the watchlist'],
  create_price_alert: ['create', 'a price alert'],
  get_price_alerts: ['read', 'price alerts'],
  remove_price_alert: ['remove', 'a price alert'],
  add_journal_entry: ['add', 'a journal entry'],
  switch_market: ['switch', 'exchange'],
  set_timeframe: ['set', 'the timeframe'],
  switch_pair: ['switch', 'pair'],
} as const satisfies ToolLabelMap

/**
 * Best-effort label for a tool id we don't know: strips the AI SDK `tool-`
 * prefix, splits snake_case / kebab-case / camelCase, and title-cases the
 * result. `getOrderBook_v2` → `Get Order Book V2`. Acronyms stay uppercase.
 */
export function humanizeToolName(raw: string): string {
  const words = raw
    .replace(/^tool-/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'Tool'
  return words
    .map((w) =>
      w.length > 1 && w === w.toUpperCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ')
}

/**
 * Human-readable label for a tool call, phrased for its phase:
 * `running` → "Reading the order book…", `done` → "Read the order book",
 * `error` → "Reading the order book" (the chip appends the failure reason).
 */
export function formatToolLabel(
  toolName: string,
  phase: ToolPhase = 'done',
  labels: ToolLabelMap = COPILOT_TOOL_LABELS,
): string {
  const entry = (labels as Record<string, readonly [ToolVerb, string]>)[
    toolName.replace(/^tool-/, '')
  ] as readonly [ToolVerb, string] | undefined
  if (!entry) {
    const human = humanizeToolName(toolName)
    return phase === 'running' ? `${human}…` : human
  }
  const [present, past] = VERB_FORMS[entry[0]]
  const verb = phase === 'done' ? past : present
  const label = entry[1] ? `${verb} ${entry[1]}` : verb
  return phase === 'running' ? `${label}…` : label
}
