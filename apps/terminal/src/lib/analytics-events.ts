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

/** Coarse trading mode — never mixes with amounts. */
export type TradeMode = 'paper' | 'live'

/** Where an order originated: manual panel, copilot proposal, or workflow. */
export type TradeSource = 'trade_panel' | 'copilot' | 'workflow'

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
  watchlist_changed: { action: 'added' | 'removed' }
  /** A venue was blocked in the user's region — demand we can't serve. */
  geo_restriction_shown: { venue: string }
  command_palette_opened: Record<string, never>

  // ── Chart engagement (the core loop) ──────────────────────────────
  timeframe_changed: { timeframe: string }
  chart_type_changed: { chart_type: string }
  drawing_tool_selected: { tool: string }

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
  /** User pinned a provider plugin for a capability ('auto' = unpinned). */
  ai_provider_selected: { capability: string; plugin_id: string }
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
  /** The forgotten-password path erased this device. */
  security_lock_reset: Record<string, never>
  /** A credential-vault protector was enrolled. Kind only — never key material,
   * never how many protectors exist (that describes how hard the vault is to
   * open). */
  security_vault_enrolled: { protector: 'password' | 'passkey' }
  security_vault_removed: { protector: 'password' | 'passkey' }
  /** The vault was opened. Which protector answered, never how long it took. */
  security_vault_unlocked: { protector: 'password' | 'passkey' }
  /** The vault was sealed by the explicit hard lock. */
  security_vault_hard_locked: Record<string, never>
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
  workspace_opened: { workspace: WorkspaceKind }
  workspace_created: { workspace_count: number }
  workspace_deleted: { workspace_count: number }
  /** Template product page opened — top of the apply funnel. */
  workspace_template_viewed: { template_id: string }
  workspace_template_applied: { template_id: string; community: boolean }
  workflow_saved: { step_count: number }
  /** `status` is the executor's verdict: completed | partial | failed | cancelled. */
  workflow_run_completed: { status: string; step_count: number }
  /** Layout panes added/removed — which surfaces users actually assemble. */
  panel_added: { pane_type: string }
  panel_removed: Record<string, never>

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

  // ── User-submitted feedback ───────────────────────────────────────
  /**
   * A bug report / idea the user deliberately typed and sent from the
   * feedback dialog. The one sanctioned exception to the no-free-text rule
   * above: the text IS the payload, the user wrote it knowing it is sent,
   * and the dialog says so before it goes. `route` is the matched route
   * template (`/_terminal/pair/$pair`), never a resolved path with ids in it.
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
  captureEvent(event, args[0] as Record<string, unknown> | undefined)
}
