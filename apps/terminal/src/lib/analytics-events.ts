// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Typed product-event taxonomy for the opt-in PostHog integration.
//
// Every product event the terminal emits is declared here, with the exact
// property set it is allowed to carry. Call sites use `track()` instead of
// `captureEvent()` directly so an event can't grow an undeclared property
// without touching this file — which is where the privacy review happens.
//
// Privacy rules (enforced by this schema, reviewed on every addition):
// - No PII: no emails, names, IPs, or free-text the user typed.
// - No financial exposure: no order sizes, prices, notionals, balances,
//   P&L, or wallet addresses. Trade events answer "did trading happen and
//   did it work", never "what position does this user hold".
// - Trade events deliberately omit the instrument symbol: which markets are
//   popular is measured from browsing events (pair switches, watchlists),
//   not from a per-user record of executed trades.
// - Identifiers are fine when they name OUR product surface (plugin ids,
//   venue ids, theme ids, workflow step types) — they describe the product,
//   not the person.

import type { LockReason } from '@/lib/security/lock-config'
import { captureEvent } from '@/lib/analytics'
import { recordGrowthSignal } from '@/lib/growth/engagement'

/**
 * Which kind of vault protector answered. The kind only — never how many are
 * enrolled, which would describe how hard the vault is to open.
 */
export type VaultProtectorKind = 'password' | 'passkey' | 'biometric'

/** Coarse trading mode — never mixes with amounts. */
export type TradeMode = 'paper' | 'live'

/** How the user reached the assistant. Names our own affordances only. */
export type AssistantOpenSource = 'orb' | 'shortcut' | 'palette'

/** Where an order originated: manual panel, copilot proposal, workflow, or
 * the prediction basket (one submission fans out to one order per leg). */
export type TradeSource = 'trade_panel' | 'copilot' | 'workflow' | 'basket'

/** Which layout surface — never a user-assigned workspace name or id. */
export type WorkspaceKind = 'pair' | 'discovery' | 'custom'

export type TradeFailReason =
  | 'rejected'
  | 'network'
  | 'auth'
  | 'guardrail'
  /** The credential vault was sealed — distinct from `auth`, which means the
   * venue rejected a key we could actually read. */
  | 'vault-sealed'
  | 'unknown'

/** Shared shape of the trade-funnel events. Deliberately excludes the pair
 * symbol and everything sized in money. */
export interface TradeEventProps {
  venue: string
  venue_kind: 'cex' | 'dex' | 'broker'
  side: 'buy' | 'sell'
  order_type: string
  mode: TradeMode
  source: TradeSource
}

export interface AnalyticsEvents {
  // ── Trading funnel ────────────────────────────────────────────────
  /** An order reached the guarded submission path. */
  trade_submitted: TradeEventProps
  /** The venue accepted the order. */
  trade_executed: TradeEventProps
  /** The submission failed. `reason` is a coarse category, never an exchange
   * error string (those can echo sizes/balances). */
  trade_failed: TradeEventProps & { reason: TradeFailReason }
  order_cancelled: { venue: string }
  /** Copilot proposed a trade via confirm card and the user decided. */
  trade_proposal_decided: {
    decision: 'accepted' | 'rejected'
    mode: TradeMode
    /** Standing consent executed the proposal without a click. */
    auto_approved: boolean
  }

  // ── Market exploration ────────────────────────────────────────────
  /** Active market changed. Symbols are public instrument names. */
  pair_opened: { venue: string; asset_class: string; pair: string }
  /**
   * Which answer of a prediction event the user pointed the ticket at, and how
   * they got there.
   *
   * The question this change raises and nothing else can answer: a prediction
   * pair is now the event, opening on its favourite, so does anyone actually
   * move off that default? If almost nobody does, the field strip and the
   * ladder's chips are decoration and the board should give their space to the
   * chart. `rank` is the answer's position in the field by probability, which
   * separates "flipped to the other side of a binary" from "went shopping in
   * the tail of a hundred-runner race". No outcome label and no event id: the
   * question a user is trading is theirs.
   */
  prediction_outcome_selected: {
    venue: string
    /** Where the click came from: the header strip, the ladder, the ticket. */
    surface: 'header' | 'ladder' | 'ticket' | 'board'
    /** 1 is the favourite. Uncapped, because the tail is the finding. */
    rank: number
    /** How many answers the event publishes. */
    field_size: number
  }
  watchlist_changed: { action: 'added' | 'removed' }
  /** A venue was blocked in the user's region — demand we can't serve. */
  geo_restriction_shown: { venue: string }
  command_palette_opened: Record<string, never>

  // ── Chart engagement (the core loop) ──────────────────────────────
  timeframe_changed: { timeframe: string }
  /** Which type was picked, and on which asset class — the class is what
   * says whether the per-class default was accepted or rejected. */
  chart_type_changed: { chart_type: string; asset_class: string }
  drawing_tool_selected: { tool: string }
  /** Chart bars were exported to CSV. Shape of the export only — never the
   * instrument, the row count, or anything priced. */
  chart_data_exported: {
    range: 'visible' | 'all'
    time_format: string
    with_indicators: boolean
    with_compares: boolean
  }

  // ── Revenue attribution ───────────────────────────────────────────
  /** User clicked a venue signup (affiliate) link. */
  affiliate_link_clicked: { venue: string }

  // ── AI copilot / research ─────────────────────────────────────────
  /** A chat request reached the AI transport (content is never captured).
   * `provider` is the inference plugin id; `model` a model id, or
   * 'plugin-stream' for text-only plugin providers. */
  copilot_message_sent: { provider: string; model: string; persona: string }
  /** One event per tool invocation in an agentic run — which of the ~60
   * copilot capabilities actually get exercised. */
  copilot_tool_used: { tool: string }
  /** An agentic run finished. */
  copilot_run_completed: {
    outcome: 'success' | 'error'
    tool_calls: number
    duration_ms: number
  }
  research_run_completed: {
    outcome: 'success' | 'error'
    cached: boolean
    duration_ms: number
  }
  /** An assistant chat request reached the transport (content is never
   * captured). `surface` only applies to the per-page builder chats the
   * unified assistant replaces; it carries a persona instead. */
  assistant_message_sent: {
    provider: string
    model: string
    surface?: 'indicators' | 'bots' | 'workflows' | 'notifications'
    persona?: string
  }
  /** One event per tool invocation in an assistant run. */
  assistant_tool_used: { tool: string }
  /** An assistant run finished. */
  assistant_run_completed: {
    outcome: 'success' | 'error'
    tool_calls: number
    duration_ms: number
  }
  /** The chat went from collapsed to open, and how. The reason it carries
   * `via`: the assistant is reachable by chord, by palette row and by
   * clicking the orb, and only the orb is visible without knowing it
   * exists. If the chord stays near zero after being advertised on the orb
   * and in the palette, the chord is not the answer and the surface needs a
   * different affordance. */
  assistant_opened: { via: AssistantOpenSource }
  /** A starter on the assistant's empty screen was clicked instead of the
   * user writing their own opener. Answers whether the suggestions earn
   * their space, and which of the two sets does the work. The starter's
   * text is deliberately not sent: on a chart it names the pair. */
  assistant_starter_used: { position: number; context: 'chart' | 'global' }
  /** An answer was copied out of the thread. The one signal that the chat
   * is producing something the user takes elsewhere. */
  assistant_answer_copied: Record<string, never>
  /** A fenced code block was copied. `language` is the fence's own tag, so
   * it answers what the assistant is actually being asked to write. Never
   * the code. */
  assistant_code_copied: { language: string }
  /** A Python block was sent straight into the workbench as a script. The
   * completion of "write me an indicator": anything short of this ends on
   * the clipboard. */
  assistant_code_opened_in_workbench: Record<string, never>
  /** The user asked for another answer to the same prompt. A rate worth
   * watching: regeneration is the cheapest signal that a persona or a model
   * is not landing. `after_error` separates a genuine retry from a redo. */
  assistant_regenerated: { after_error: boolean }
  /** A message was typed during a run and queued rather than lost. Tells us
   * whether unlocking the composer mattered. */
  assistant_message_queued: Record<string, never>
  /** The assistant took the user to a page. `with_target` is the question
   * this event exists for: pages now accept the id of the record to open,
   * and a run that keeps navigating without one is dropping people on a
   * list to search by hand. `page` is one of our own page ids, never a
   * URL, so no record id and nothing the user typed is captured. */
  assistant_navigated: { page: string; with_target: boolean }
  /** The assistant put a spotlight on part of the terminal. The question is
   * whether it points at all, and at what: a run that only ever glows the
   * shell after navigating is not really using this, and a target nobody is
   * ever pointed at is one we can stop publishing. `target` is one of our own
   * surface ids (`pane:chart`, `shell`), never a record id. `landed` is false
   * when the target was not on screen, which is the failure worth counting. */
  assistant_highlighted: { target: string; landed: boolean }
  /** A conversation was started, opened from the rail, renamed or deleted.
   *
   * The question the rail exists to answer: does anyone go back? If
   * `switched` never fires while `created` does, threads are a filing
   * cabinet nobody opens and the rail is costing 176px for nothing.
   * `renamed` answers the narrower one: model-written titles are good
   * enough most of the time, so if people are correcting them by hand
   * often the titling prompt is the thing to fix. `count` is how many the
   * user has, which is the other half of it: a feature that matters looks
   * different at three threads and at thirty. Titles and message content
   * are never captured, and cannot be: conversations are stored on the
   * user's device and nothing here reads them. */
  assistant_conversation_action: {
    action: 'created' | 'switched' | 'renamed' | 'deleted'
    count: number
    surface: 'dock' | 'mobile'
  }
  /** The answer to the rail's one-time cloud-sync question.
   *
   * The only thing worth measuring about an opt-in: what share of people
   * who are asked say yes. If it is very high the default is wrong and
   * conversations should sync out of the box; if it is very low the banner
   * is costing rail space for nothing. `surface` separates the desktop rail
   * from the phone's, which ask in different amounts of room. No thread
   * content, ids or counts ride along. */
  assistant_sync_choice: { enabled: boolean; surface: 'dock' | 'mobile' }
  /** User pinned a provider plugin for a capability ('auto' = unpinned). */
  ai_provider_selected: { capability: string; plugin_id: string }
  /** A bring-your-own-key AI provider (model or web search) was activated
   * from an AI gate — the other half of the funnel `ai_billing_gate_shown`
   * measures. */
  ai_provider_connected: { plugin_id: string; capability: string }
  /** A typed billing gate (402) was shown — subscription required or
   * credits exhausted. Key funnel signal for Intelligence. */
  ai_billing_gate_shown: { code: string }

  // ── Indicators ────────────────────────────────────────────────────
  /** An indicator was added to a chart from the picker. */
  indicator_added: { indicator_type: string; source: 'builtin' | 'custom' }
  /** An indicator was taken off a chart — kept-vs-discarded signal. */
  indicator_removed: { indicator_type: string; source: 'builtin' | 'custom' }
  /** Python workbench script run finished (script content never captured). */
  python_indicator_run: { outcome: 'success' | 'error' }
  python_indicator_saved: Record<string, never>
  python_indicator_exported: Record<string, never>
  /** A script came in from a paste, a file, or a fork (content never captured). */
  python_indicator_imported: { source: 'paste' | 'file' | 'fork' }

  // ── Settings & configuration ──────────────────────────────────────
  settings_section_viewed: { section: string }
  /** A risk-guardrail field changed — which setting, never its value. */
  risk_setting_changed: { setting: string }
  /** Regional routing choice (drives which venues are offered). */
  region_changed: { country: string }
  /** A cloud-sync switch moved. Domain id ('all' = the master), never data. */
  cloud_sync_toggled: { domain: string; enabled: boolean }

  // ── Security (local terminal lock) ────────────────────────────────
  /** The device-local screen lock was turned on or off. */
  security_lock_enabled: Record<string, never>
  security_lock_disabled: Record<string, never>
  /** Which trigger fired. Never attempt counts or unlock timings — those
   * describe how guessable someone's password is. */
  security_locked: { reason: LockReason }
  security_unlocked: { reason: LockReason }
  /** A before-trade identity check was answered. */
  security_trade_challenge: { outcome: 'passed' | 'failed' | 'cancelled' }
  /**
   * The lock screen's Face ID / fingerprint door. What happened, never which
   * sensor answered or how often it was refused — a refusal rate describes how
   * well someone's biometrics work, which is not ours to measure.
   */
  security_lock_biometric: { action: 'enrolled' | 'removed' | 'unlocked' }
  /** The forgotten-password path erased this device. */
  security_lock_reset: Record<string, never>
  /** A credential-vault protector was enrolled. Kind only — never key material,
   * never how many protectors exist (that describes how hard the vault is to
   * open). */
  security_vault_enrolled: { protector: VaultProtectorKind }
  security_vault_removed: { protector: VaultProtectorKind }
  /** The vault was opened. Which protector answered, never how long it took. */
  security_vault_unlocked: { protector: VaultProtectorKind }
  /** The vault was sealed by the explicit hard lock. */
  security_vault_hard_locked: Record<string, never>
  /**
   * The one-tap-unlock offer made after connecting a venue whose market data
   * needs the vault open. Whether it was taken, never anything about the
   * vault it was offered for — the point is to learn if the prompt lands at
   * the right moment, which the answer alone tells us.
   */
  security_passkey_nudge: { action: 'accepted' | 'dismissed' }
  /** Desktop only: the opt-in app-level vault was turned on or off. */
  security_vault_desktop_toggled: { enabled: boolean }

  // ── Plugins & connections ─────────────────────────────────────────
  /** Store product page opened — top of the install funnel. */
  plugin_page_viewed: { plugin_id: string }
  plugin_installed: { plugin_id: string }
  plugin_uninstalled: { plugin_id: string }
  plugin_toggled: { plugin_id: string; enabled: boolean }
  /** Exchange API credentials saved locally. Venue id only — never keys. */
  venue_connected: { venue: string }
  venue_disconnected: { venue: string }
  /** Wallet linked for DEX trading. Chain only — never addresses. */
  wallet_connected: { chain: string }

  // ── Workspaces & workflows ────────────────────────────────────────
  /** Composition of the active layout — what users actually build. Fired on
   * mount and whenever the pane composition changes (resizes are ignored).
   * `workspace` is the surface kind, never a user-assigned name or id. */
  layout_snapshot: {
    workspace: WorkspaceKind
    pane_count: number
    column_count: number
    cell_count: number
    pane_types: Array<string>
    pane_type_counts: Record<string, number>
    visible_pane_types: Array<string>
  }
  /** Accumulated on-screen seconds per pane type — which panels earn their
   * pixels. Flushed periodically, on tab-hide, and on workspace switch. */
  panel_dwell: { pane_type: string; seconds: number; workspace: WorkspaceKind }
  preset_applied: { preset: string; workspace: WorkspaceKind }
  /**
   * A chart pane was given a symbol of its own from its toolbar chip —
   * the thing that makes a Dual/Triple/Quad board worth opening. `scope`
   * says who took the write: the pane itself, or the workspace variable it
   * is bound to. No symbol here; the taxonomy carries none.
   */
  chart_pane_pair_pinned: { scope: 'pane' | 'variable' }
  /** Which asset-class desk traders actually work from on Discovery. */
  discovery_section_selected: { section: string }
  /**
   * The venue a Discovery section is pointed at was changed from its bar.
   *
   * Answers whether the picker is used at all — the preference was only
   * writable from a chart page before, so "does anyone switch venue while
   * browsing" has never had an answer. `venue` is a connector id and
   * `section` an asset class: both name our own surfaces, never the person.
   */
  discovery_venue_changed: { venue: string; section: string }
  /**
   * The on-chain board could not draw a chain's pools, and why.
   *
   * The question this answers is whether the DEX Discovery board is usable in
   * a browser at all. Its pool data comes from one public free-tier API, and
   * when that API refuses, every pane on the board goes with it — so "how
   * often does a reader open this board and get nothing" is not something the
   * pane can tell us from here. `outcome` separates the provider refusing
   * (ours to fix, by pacing or by paying) from the provider answering with
   * pools that nothing on the board could rank (the quality bar's doing).
   * `chain` is a Pairlens market id, which names our own product surface.
   */
  dex_pool_map_empty: {
    chain: string
    outcome: 'provider_refused' | 'below_quality_bar' | 'no_pools_listed'
  }
  workspace_opened: { workspace: WorkspaceKind }
  workspace_created: { workspace_count: number }
  workspace_deleted: { workspace_count: number }
  /** The current arrangement kept by name — `workspace` is the surface it was
   * saved from, `mode` separates a new workspace from a write-back. */
  workspace_layout_saved: { workspace: WorkspaceKind; mode: 'new' | 'update' }
  /** Template product page opened — top of the apply funnel. */
  workspace_template_viewed: { template_id: string }
  workspace_template_applied: { template_id: string; community: boolean }
  workflow_saved: { step_count: number }
  /** `status` is the executor's verdict: completed | partial | failed | cancelled. */
  workflow_run_completed: { status: string; step_count: number }
  /** Layout panes added/removed — which surfaces users actually assemble. */
  panel_added: { pane_type: string }
  panel_removed: Record<string, never>

  // ── DEX liquidity & bridging ──────────────────────────────────────
  /** A cross-chain bridge transfer was submitted and signed. Chains and the
   * routing tool name our product surface; amounts, assets and addresses are
   * deliberately absent (the privacy rules above apply doubly to a
   * money-moving event). Measures whether the bridge surface earns its keep. */
  bridge_executed: { from_chain: string; to_chain: string; tool: string }
  /** An LP position write was submitted from the manage-liquidity pane.
   * Which verb people use decides where that pane's polish budget goes. */
  lp_action_submitted: {
    action: 'collect' | 'decrease' | 'increase'
    chain: string
  }

  /** The liquidation map's data source was switched. Which collector (and
   * window) a trader actually reads decides whether a second collected venue
   * or a BYOK vendor earns further investment. Venue ids name our surface. */
  liquidation_map_source_changed: { venue: string; window_hours: number }

  // ── Discovery ─────────────────────────────────────────────────────
  /** Movers pane tab switch — answers whether the New listings tab (and the
   * long-tail tabs) are found at all. The tab id names our surface. */
  movers_tab_selected: { tab: string }
  /** The prediction board's category rail, used. A rail nobody clicks is a
   * dead column on the busiest board in the product. Carries our own category
   * vocabulary, never an event title or a venue's raw tag; null clears back
   * to Trending. */
  prediction_category_selected: { category: string | null }
  /** The full field opened from a race card — answers whether a four-runner
   * preview is the right depth or the cards should carry more rows. The count
   * is how many runners the preview hid, never which event. */
  prediction_full_field_opened: { runners_hidden: number }
  /** A span picked on the probability chart. The chart replaced the price
   * chart on the prediction boards, so this is how we learn whether a
   * prediction is read over hours or over weeks — and whether five spans is
   * four too many. `runners` is how many lines were drawn, which says whether
   * the multi-outcome view is what people came for; never which event. */
  prediction_chart_window_selected: { window: string; runners: number }
  /** Lines or stacked bands. The stacked view exists because a fixed 0-100%
   * axis crushes a race into the bottom of the pane, and it ships as the
   * default — so this is the one signal that says whether that default was
   * right, or whether people switch straight back. Only offered on a field
   * that is a partition, so a low count here also measures how many events
   * are stackable at all. `runners` is how many were drawn, never which
   * event. */
  prediction_chart_view_selected: { view: string; runners: number }
  /** A row opened from the crypto up/down scanner. Three questions at once:
   * whether the recurring windows are worth their place at the top of the
   * discovery board, which horizon people actually trade (a fifteen-minute
   * window and a daily one are different products), and whether the model
   * column is doing any work — `hasModel` is false when the settlement candle
   * or the volatility sample was missing, so a high share of false rows means
   * the join to spot is failing in the field. Venue and horizon name our own
   * surfaces; never the contract, the asset or any size. */
  prediction_updown_opened: {
    venue: string
    horizon: string
    hasModel: boolean
    /** Which shape the click came from: 'focus' or 'board'. */
    view: string
  }
  /** The pane has two shapes and only one can be the default. This is the
   * question that decides which: does anyone switch, and in which direction.
   * A board that is never switched away from means the focus card is not worth
   * its build; a focus card nobody leaves means the scanner belongs behind a
   * link rather than a toggle. `view` is the shape switched TO, and it names
   * our own surface and nothing about the contract. */
  prediction_updown_view_changed: { view: string }
  /** Whether the asset switcher is used at all, which is the one interaction
   * the focus card adds over a static pane — and the one that costs a ticker
   * and a trade subscription each time. Asset is a public ticker on a public
   * contract slate, carries no position and no size. */
  prediction_updown_asset_selected: { asset: string; horizon: string }

  // ── Alerts & notifications ────────────────────────────────────────
  alert_created: { kind: string }
  alert_triggered: { kind: string }
  /** Per-channel delivery outcome — surfaces dead webhooks and denied
   * OS-notification permissions. */
  alert_delivery: { channel: string; ok: boolean }

  // ── Desktop conversion ────────────────────────────────────────────
  /**
   * Browser build only: a desktop installer link was opened. `os` is the
   * build that was downloaded, `current_os` the machine that asked — the gap
   * between them is the interesting part (people fetching a build for another
   * machine), and `asset` names our own release artifact.
   */
  desktop_download_clicked: {
    os: string
    current_os: string
    asset: string
  }
  /**
   * Browser build only: the one-time notice on a page whose feature needs the
   * app to be running (`surface` is `notifications` or `bots`). `shown` fires
   * once per surface per device, so the pair is a conversion rate, not a
   * volume — if nobody clicks through, the copy is wrong or the toast is.
   */
  desktop_nudge_shown: { surface: string }
  desktop_nudge_clicked: { surface: string }

  // ── Growth prompts ────────────────────────────────────────────────
  /**
   * A support-us prompt (GitHub star today, review sites later) was shown to
   * an engaged user. `action` names the ask, `asks` is the lifetime count on
   * this device — shown/clicked/dismissed together measure whether the
   * eligibility heuristic finds the right people at the right moment.
   */
  growth_prompt_shown: { action: string; asks: number }
  /** The prompt's CTA was clicked (the star page was opened). */
  growth_prompt_cta_clicked: { action: string; asks: number }
  /** The prompt was declined: `later` snoozes, `never` is permanent. */
  growth_prompt_dismissed: { action: string; kind: 'later' | 'never' }

  // ── User-submitted feedback ───────────────────────────────────────
  /**
   * A bug report / idea the user deliberately typed and sent from the
   * feedback dialog. The one sanctioned exception to the no-free-text rule
   * above: the text IS the payload, the user wrote it knowing it is sent,
   * and the dialog says so before it goes. `route` is the matched route
   * template (`/_terminal/$cls/$market/$id`), never a resolved path with ids
   * in it.
   */
  bug_report: {
    category: 'bug' | 'idea' | 'other'
    message: string
    app_version: string
    route: string
    platform: 'desktop' | 'web'
  }

  // ── Lifecycle & personalization ───────────────────────────────────
  onboarding_completed: Record<string, never>
  /** Sign-in funnel: OTP email requested → signed_in (OTP verified). */
  otp_requested: Record<string, never>
  signed_in: Record<string, never>
  signed_out: Record<string, never>
  theme_changed: { theme: string }
  /** UI language switched; steady-state language rides on every event as
   * the `app_language` super property. */
  language_changed: { language: string }
  /** A layout tab was brought to the front — panel engagement, not just
   * composition. */
  panel_focused: { pane_type: string }

  // ── Mobile terminal ───────────────────────────────────────────────
  /**
   * The phone shell mounted. `entry` separates a cold load on a phone from a
   * desktop window dragged under 768px — the second is a developer or a
   * curious user, and mixing them would flatter the mobile numbers.
   */
  mobile_terminal_opened: { entry: 'direct' | 'resize' }
  /**
   * A mobile destination was opened. Which of the five surfaces earns its
   * place in the tab bar — the phone's equivalent of `panel_focused`.
   */
  mobile_tab_changed: {
    tab: 'watchlist' | 'trade' | 'chart' | 'copilot' | 'discover'
  }
  /**
   * A prediction event surface opened on the phone. Answers whether the
   * clarity work is used: does anyone walk from a chart back to the event, and
   * does the race ladder earn its screen. Names our own surfaces only.
   */
  mobile_prediction_surface_opened: {
    surface: 'event' | 'ladder'
    source: 'chart_strip' | 'event_screen' | 'trade_ticket' | 'events_board'
  }
  /**
   * The phone's Chart tab switched between the probability view and candles.
   * The odds view is the new default, so this is the one number that says
   * whether that default was right: a stream of switches to `candles` means
   * people came to a prediction chart wanting a price chart after all. Never
   * carries which contract.
   */
  mobile_prediction_chart_view: { view: 'odds' | 'candles' }
}

/**
 * Emit a declared product event. No-op unless the user opted in to
 * analytics (consent is checked inside `captureEvent`).
 */
export function track<TEvent extends keyof AnalyticsEvents>(
  event: TEvent,
  ...args: AnalyticsEvents[TEvent] extends Record<string, never>
    ? []
    : [properties: AnalyticsEvents[TEvent]]
): void {
  const properties = args[0] as Record<string, unknown> | undefined
  // Local engagement tally for the growth prompts (lib/growth). Not
  // analytics: device-local counters, independent of consent, never sent.
  recordGrowthSignal(event, properties)
  captureEvent(event, properties)
}
