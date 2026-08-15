---
title: Introduction
description: What Pairlens is, a source-available, local-first, AI-native crypto trading terminal that runs in your browser, on your desktop, and on your phone.
group: get-started
order: 1
eyebrow: Get started
updated: AUG 2026
readTime: 3 min read
---

Pairlens is a source-available, local-first, AI-native trading terminal for
crypto spot markets, US equities, and prediction markets. Deterministic
strategies generate signals, an AI co-pilot provides contextual analysis, and
risk guardrails you configure are enforced by the order path itself. The AI
augments your decisions. It never overrides your risk limits.

## The one rule

Pairlens never touches your money. Your machine talks straight to the exchange.
There is no server in the middle holding your keys, marking up spreads, or
taking a cut. Because the full source is public, you never have to take our
word for it.

## No lock-in, anywhere

Pairlens is not tied to one exchange, one broker, or one country. Connectors
for 14 centralized spot exchanges, three perpetual futures venues, a US
equities broker, two prediction markets, and DEXs on Solana and five EVM chains
ship in the box. Use whichever venues work
where you live, switch between them freely, or run several side by side. Your
accounts stay yours and your data stays on your machine. If you ever leave,
there is nothing to cancel and nothing to export from our servers, because
nothing of yours was ever on them.

## What you get

**Charts.** 16 chart types, 90 built-in indicators, 45 drawing tools, bar
replay, and symbol comparison, all rendered by our own WebGL2 engine. See
[the chart](/docs/chart-panel).

**Trading.** Market, limit, and workflow-driven bracket orders routed straight
to the venue, with [risk guardrails](/docs/risk-guardrails) checked before
anything leaves your machine.

**Prediction markets.** Event contracts on Kalshi and Polymarket, priced in
cents, with the same chart, book, and ticket as everything else. See
[prediction markets](/docs/prediction-markets).

**Python.** Write indicators and strategies in real Python with numpy, running
locally in an embedded runtime. See
[custom indicators](/docs/custom-python-indicators).

**Bots.** Deploy a Python strategy to a market and let it trade on paper or
live. See [bots](/docs/bots).

**Automation.** [Workflows](/docs/build-a-workflow) chain orders and
conditions; [alerts](/docs/alerts-notifications) watch price levels, percent
moves, signals, and candle closes.

**AI.** A [co-pilot](/docs/ai-copilot) that reads your charts and can drive
them, plus deep-dive [research reports](/docs/research-reports). Bring your own
provider key or subscribe to hosted Intelligence.

## How the pieces fit

**Web terminal.** The fastest way in. Open
[terminal.pairlens.finance](https://terminal.pairlens.finance) and you are on a
live chart. Credentials live in an encrypted vault on your device.

**Mobile terminal.** Below 768px the same URL serves a chart-first shell with
five destinations and real order entry, not a shrunken dashboard. See
[mobile terminal](/docs/mobile-terminal).

**Desktop app.** A Tauri shell around the same terminal, with credentials in
your OS keychain. It adds the eight CORS-restricted venues, background bots,
and native windows, and it is the strongest home for live-trading secrets.

**Terminal.** A React SPA. Market data streams directly from exchanges via
connector plugins. There is no intermediate data server.

**Connector plugins.** The only code that talks to exchange WebSockets and REST
APIs. 14 spot CEXs, three perpetual futures venues, a US equities broker, two
prediction markets, and DEX connectors ship in the box.

**Strategy engine.** Pure TypeScript math: EMA, ATR, breakout, pullback,
mean-reversion, regime detection. No I/O, no network.

**AI co-pilot.** The terminal owns the agentic loop. The optional App Server is
only an inference proxy. Bring your own provider key, or use the bundled
fallback.

## What's open

This repository is everything you need to run Pairlens. The one component whose
source is not published yet is the App Server, a small optional backend for
sign-in, cross-device sync, and a hosted AI proxy. The terminal works fully
standalone without it.

## Find your path

**Traders.** Start with the [Quickstart](/docs/quickstart), take the
[terminal tour](/docs/terminal-tour), then
[connect an exchange](/docs/connect-an-exchange) and set your
[risk guardrails](/docs/risk-guardrails). No programming required.

**Builders.** The [Plugin SDK](/docs/plugin-sdk) is how you add venues, AI
providers, and themes. The [CLI](/docs/cli-reference) gives you the same
connectors headless, and
[Fast Financial Charts](/docs/charts) is the chart engine as a standalone
MIT library.

**Institutions and teams.** See
[self-hosting](/docs/self-hosting) for running everything on infrastructure you
control, and the [security model](/docs/security-model) for what that
guarantees.

Ready to run it? Head to the [Quickstart](/docs/quickstart).
