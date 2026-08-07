# Analytics tracking plan

Pairlens uses PostHog (EU) for product analytics, in two separate projects:
**Pairlens Terminal** (opt-in) and **Pairlens Marketing** (cookieless by
default). This document is the human-readable index of what we measure and the
rules every event must follow. The machine-checked sources of truth are
[`apps/terminal/src/lib/analytics-events.ts`](../apps/terminal/src/lib/analytics-events.ts)
and
[`apps/marketing/src/scripts/analytics-events.ts`](../apps/marketing/src/scripts/analytics-events.ts);
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

## Marketing site events (separate PostHog project)

The marketing site is **cookieless by default**: capture starts anonymous and
storage-free from the first paint, and accepting the banner only upgrades it
to a first-party cookie that remembers the visitor between visits. Every event
below rides that posture, so declining costs no measurement.

| Domain              | Events                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The two doors       | `terminal_launched` (surface), `download_clicked` (os, surface), `download_retried`, `download_flow_restarted`, `command_copied`, `install_page_shared` |
| Chrome & navigation | `nav_clicked` (location, label, href), `outbound_link_clicked` (domain), `mobile_nav_opened`, `docs_drawer_opened`, `cookie_consent_decided`            |
| Reading depth       | `scroll_depth_reached` (25 / 50 / 75 / 100, once per page)                                                                                              |
| Landing engagement  | `feature_opened` (feature, card-vs-phrase), `feature_stepped`, `desk_slot_changed`                                                                      |
| Consideration       | `faq_opened` (question), `pricing_plan_cta_clicked` (plan)                                                                                              |
| /charts             | `chart_skin_changed` (control, value), `code_example_viewed`                                                                                            |
| Docs                | `docs_search_opened` (hotkey-vs-button) → `docs_search_selected` (page-vs-action)                                                                       |
| Affiliates          | `affiliate_code_applied` (tier, ok) → `affiliate_venue_toggled` → `affiliate_claim_submitted` (tier, venue_count)                                       |

Every marketing event carries `page_area` (landing / install / charts /
intelligence / affiliates / licensing / docs / legal) and the `visitor_os`
super property, which is the machine the visitor is on — not the build they
downloaded. The gap between `visitor_os` and `download_clicked.os` is people
fetching a build for another machine.

The affiliate claim form is the one place the site takes typed input. The
email and the exchange referral codes pasted into it are never captured: the
events record that a step happened and how many venues were picked, nothing
else. Note that PostHog autocapture is still on for this project (it predates
this taxonomy); it records clicked-element text, never input values.

## Dashboards

Terminal project, prefixed `Pairlens ·`: **Trading**, **AI Copilot**,
**Workspaces & Panels**, **Activation & Growth**, **Intelligence Revenue**
(MRR movement, credits/COGS, conversion funnels), **Product Health**
(retention, lifecycle, stickiness, feature/version adoption, chart loop,
risk-guardrail usage).

Marketing project, prefixed `Marketing ·`: **Acquisition & Conversion** (the
launch/download funnel per surface and OS), **Content Engagement** (reading
depth, feature dialog, FAQ, charts playground), **Docs & Developers**,
**Affiliates Funnel**.

## Adding an event

Declare it in the typed taxonomy first (the property set is the privacy
review), call `track()` at the chokepoint closest to the user action, and add
a tile to the relevant dashboard. Prefer one well-placed chokepoint over
per-surface duplicates, and coarse enums over raw values. On the marketing
site, prefer a `data-*` hook read by the one delegated listener in
`analytics-events.ts` over a new per-component script.
