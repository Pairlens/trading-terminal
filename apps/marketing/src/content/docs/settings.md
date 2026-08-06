---
title: Settings
description: Every setting in the terminal, from themes and languages to regional endpoint routing, data rate, analytics, and account deletion.
group: traders
order: 9
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

Open settings with <kbd>⌘,</kbd>, from the user menu, or by searching for a
section in omni-search.

## Profile

Display name and profile image, when you are signed in. Purely cosmetic.

## Intelligence

Your hosted AI subscription: current plan, credits used against granted, reset
date, checkout, credit packs, and the billing portal. See
[AI providers](/docs/ai-providers).

## Plugins

A shortcut into plugin management. See
[plugins](/docs/plugins-for-traders).

## Country

Pick your country and connectors route API requests to the correct regional
endpoint. This matters more than it looks: OKX sends US and Australian users to
`us.okx.com` and EU users to `eea.okx.com`, and some venues are unavailable in
some regions entirely. Setting it correctly is the difference between a
connector working and a connector timing out for reasons nobody can see.

## Currency

Display currency for portfolio values and balances: USD, EUR, or GBP. It
changes how values are shown, not what you hold.

## Risk Management

Loss caps, position caps, trade caps, the breach action for each, the reset
window, and the AI's trade permissions. This is the most important page in
settings and it has its own guide:
[risk guardrails](/docs/risk-guardrails).

## Appearance

**Colour mode.** Light, Dark, or System.

**Theme.** Seventeen bundled themes, plus any you have installed. Themes are
independent of colour mode.

**Recent tickers marquee.** A running strip of live prices for pairs you have
been looking at, above the pair header.

## Data Rate

How often connector plugins deliver updates. Lower rates mean less bandwidth
and less CPU.

| Mode             | Behaviour                                                    |
| ---------------- | ------------------------------------------------------------ |
| **Performance**  | Full exchange rate. For active trading                       |
| **Balanced**     | Ticker and book at 250ms, candles at 500ms                   |
| **Energy Saver** | Ticker and book at 1s, candles at 2s. For laptops on battery |

Energy Saver is worth knowing about before you conclude the app is heavy. On a
laptop monitoring six pairs passively, it makes a visible difference to fan
noise and battery.

## Connection

Live status of your market-data connections. Data streams directly from
exchanges through the installed connector plugins, with no intermediate server,
so this page tells you which sockets are up.

## Language

Seventeen languages: English, Spanish, Chinese (Simplified and Traditional),
Russian, Ukrainian, French, Portuguese, German, Italian, Polish, Japanese,
Korean, Vietnamese, Thai, Turkish, and Indonesian. The terminal picks up your
browser or OS language on first run and you can override it here.

## Privacy

**Usage analytics.** Off unless you turn it on. When enabled, it shares
anonymous usage data and crash reports. Never your trades, API keys, or
balances. The setting applies to this device only, and turning it off stops
collection immediately. Builds without an analytics key configured collect
nothing at all and say so.

**Export your data.** Downloads everything held for your account as one JSON
file: profile, workspaces, chart layouts, AI conversations, trade journal,
workflows, alerts, plugin settings, and billing history. Exchange API keys and
wallet secrets are not in it, because they were never on our servers. They stay
in your OS keychain.

**Delete account.** Permanently erases your account and everything synced to
it, and cancels any active Intelligence subscription at the same time. You type
your email address to confirm. There is no undo and no recovery.

Data that never left the device is untouched by deletion. Remove it by signing
out and uninstalling.

If you are signed out, the page says so plainly: there is no account data on
our servers, and everything Pairlens knows about you lives on this device.

## Notifications

Where alerts go once they fire.

**System notifications** shows whether Pairlens is allowed to post to your
notification centre, and grants it from a button rather than from a prompt that
appears mid-alert — Safari only grants from a click, and a dismissed prompt is
hard to undo. If your browser has already blocked them, the card says so and
points you at the padlock in the address bar. Test one from here.

Connect a Telegram bot here — paste the token
BotFather gives you, press Start in the bot, link the chat — and any alert flow
can then deliver to it. The bot token is stored like an exchange key: OS
keychain on desktop, encrypted vault in the browser, never on a Pairlens
server. Full walkthrough in
[Alerts and notifications](/docs/alerts-notifications).

The rules themselves live under **Notifications** in the left nav.

## Desktop menu

The desktop app carries the same settings in its native menubar, plus
**Check for Updates**, **New Window** (<kbd>⌘N</kbd>), and back and forward
navigation (<kbd>⌘[</kbd> and <kbd>⌘]</kbd>).
