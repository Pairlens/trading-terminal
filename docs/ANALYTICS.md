# Analytics tracking plan

Pairlens uses PostHog (EU) for opt-in product analytics. This document is the
human-readable index of what we measure and the rules every event must follow.
The machine-checked source of truth for the client taxonomy is
[`apps/terminal/src/lib/analytics-events.ts`](../apps/terminal/src/lib/analytics-events.ts);
the server taxonomy lives in the App Server repo
(`apps/app-server/src/lib/analytics.ts`).

## Privacy rules

Every event addition goes through these checks:

1. No PII: no emails, names, IPs, or free text the user typed. Users are
   identified by their opaque account id only.
2. No financial exposure: no order sizes, prices, notionals, balances, P&L,
   or wallet addresses. Trade events answer "did trading happen and did it
   work", never "what position does this user hold".
3. Trade events omit the instrument symbol. Market popularity is measured
   from browsing (`pair_opened`), not from a per-user trade record.
4. Prices on billing events (`price_usd_monthly`, `price_usd`) are our public
   list prices, never user-transacted amounts.
5. No AI content: prompts, replies, research reports, Python source, and
   tracebacks are never captured. Tool names, model ids, and counts are fine.
6. Client capture is consent-gated (off by default, opt-in during onboarding
   or Settings → Privacy). Server events are business-lifecycle records keyed
   by account id. Builds without a PostHog key are fully inert.

## Client events (terminal, consent-gated)

| Domain                | Events                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trading funnel        | `trade_submitted` / `trade_executed` / `trade_failed` (venue, venue_kind, side, order_type, mode, source), `order_cancelled`, `trade_proposal_decided`                                                                |
| Market exploration    | `pair_opened`, `watchlist_changed`, `geo_restriction_shown`, `command_palette_opened`                                                                                                                                 |
| Chart core loop       | `timeframe_changed`, `chart_type_changed`, `drawing_tool_selected`                                                                                                                                                    |
| AI copilot            | `copilot_message_sent` (provider, model, persona), `copilot_tool_used`, `copilot_run_completed`, `research_run_completed`, `ai_provider_selected`, `ai_billing_gate_shown`                                            |
| Indicators            | `indicator_added` / `indicator_removed` (kept-vs-discarded), `python_indicator_run` / `_saved` / `_exported`                                                                                                          |
| Settings              | `settings_section_viewed`, `risk_setting_changed` (setting name only), `region_changed`, `theme_changed`, `language_changed`                                                                                          |
| Plugins & connections | `plugin_page_viewed` → `plugin_installed` (store funnel), `plugin_uninstalled`, `plugin_toggled`, `venue_connected` / `_disconnected`, `wallet_connected` (chain only)                                                |
| Workspaces & panels   | `layout_snapshot`, `panel_dwell` (on-screen seconds per pane type), `panel_focused` / `_added` / `_removed`, `preset_applied`, `workspace_opened` / `_created` / `_deleted`, `workspace_template_viewed` → `_applied` |
| Workflows & alerts    | `workflow_saved`, `workflow_run_completed`, `alert_created`, `alert_triggered`, `alert_delivery` (per-channel ok)                                                                                                     |
| Growth & revenue      | `onboarding_completed`, `otp_requested`, `signed_in` / `signed_out`, `affiliate_link_clicked`                                                                                                                         |

Super properties on every event: `platform` (desktop/web), `app_version`,
`app_language`. Person properties: `intelligence_plan` (set server-side),
`onboarding_experience` / `onboarding_risk` / `onboarding_asset_classes`
(self-reported onboarding persona). Uncaught exceptions are captured as
`$exception`; pageviews/pageleaves ride the SDK.

## Server events (App Server, business records)

`user_signed_up`, `otp_sent` (anonymous), `intelligence_checkout_started`,
`intelligence_subscription_started` / `_canceled` (plan + list price → MRR),
`intelligence_credit_pack_purchased`, `intelligence_order_refunded`,
`ai_proxy_completed` (model, workload, credits, tokens, duration),
`ai_proxy_rejected` (typed 402 reason), `ai_search_completed`.

The marketing site (separate PostHog project) captures pageviews under its
cookie banner plus `download_clicked` (os).

## Dashboards

All in the terminal's PostHog project, prefixed `Pairlens ·`: **Trading**,
**AI Copilot**, **Workspaces & Panels**, **Activation & Growth**,
**Intelligence Revenue** (MRR movement, credits/COGS, conversion funnels),
**Product Health** (retention, lifecycle, stickiness, feature/version
adoption, chart loop, risk-guardrail usage).

## Adding an event

Declare it in the typed taxonomy first (the property set is the privacy
review), call `track()` at the chokepoint closest to the user action, and add
a tile to the relevant dashboard. Prefer one well-placed chokepoint over
per-surface duplicates, and coarse enums over raw values.
