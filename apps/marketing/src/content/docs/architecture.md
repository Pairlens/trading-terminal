---
title: Architecture
description: How the terminal, connector plugins, strategy engine, and optional App Server relate, and where every piece of data lives.
group: get-started
order: 6
eyebrow: Get started
updated: 17 AUG 2026
readTime: 5 min read
---

Pairlens is built around one boundary: the only code that talks to an exchange
is a connector plugin running on your machine. Everything else, from signals to
AI to UI, is downstream of data the plugin already holds locally.

## The layers

**Terminal.** A TanStack Start SPA on React 19. Owns the UI, the plugin system,
and the AI agentic loop. Talks to the App Server over REST when signed in, and
streams market data directly from exchanges either way. The
[assistant](/docs/ai-copilot) is mounted above the routed content, which is why
one conversation spans every page and a run survives navigation.

**Market connector plugins.** Each implements the `MarketAdapter` interface and
owns its WebSocket connections, candle buffers, and order execution for one
venue. They run in the terminal process, or in the CLI.

**Strategy engine.** Pure functions over the candle buffer. Consumed on demand
by the assistant's market and research tools, the chart's signal strip, and the
CLI.

**Python runtime.** Pyodide (CPython compiled to WebAssembly) in a dedicated
Web Worker, executing your indicator and strategy scripts. Local only, on
desktop and browser alike.

**App Server** (optional, not in this repo). Auth, cross-device sync, an
OpenAI-compatible AI proxy, and the reference data no venue publishes about
itself: news, the economic and IPO calendars, insider filings, new listings, and
aggregated liquidation clusters. It never stores exchange credentials.

Two of those touch exchange data, and both are narrow and deliberate. The
listings sweeper reads public, unauthenticated venue metadata to compile the
discovery snapshot, which pairs each venue lists and nothing else. The
liquidation collector holds Binance Futures' public force-order stream open and
buckets the prints. Neither carries a credential, neither acts on anyone's
behalf, and neither ever handles prices, books, candles or trades. Everything
you actually trade against streams from the venue straight to your machine.

## Where data lives

| Data                        | Lives in                                                      | Why                                    |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Candle history              | CandleBuffer, inside the plugin                               | Fast signal computation and streaming  |
| Order book state            | Local book maps, inside the plugin                            | Rebuilt from incremental WS updates    |
| Python scripts              | Local script store, synced when signed in                     | They run in your local runtime         |
| Bot ledgers and event logs  | Local to the machine running the bot                          | The bot executes here, not on a server |
| User state, trades, AI chat | Local by default, App Server when signed in                   | Remote sync is opt-in                  |
| Exchange credentials        | OS keychain (desktop), vault-encrypted localStorage (browser) | Must never be persisted server-side    |
| Auth sessions               | App Server (BetterAuth, bearer tokens)                        | Cross-origin sign-in                   |

## The signal pipeline

Exchange WS → connector plugin → CandleBuffer → consumers compute signals on
demand with `@pairlens/strategy-engine`. Connectors do not push signals on
candle close. Signals are derived where and when they are needed.

## The plugin boundary

Everything pluggable resolves through capabilities. A plugin declares what it
provides, and the resolver picks the best provider for each request at runtime.
Market data, trading, AI inference, web search, workflow step types, chart
indicators, panels, and themes all arrive this way, which is why installing a
plugin can add a venue, a panel, or an indicator without a rebuild.

Non-bootstrap plugins run inside a Worker sandbox with a network allowlist, and
packages are Ed25519-signed against pinned keys. See the
[security model](/docs/security-model) for the full picture.
