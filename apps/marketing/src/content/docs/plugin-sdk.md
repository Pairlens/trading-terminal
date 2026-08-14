---
title: Plugin SDK
description: Extend Pairlens with capability-based plugins for connectors, AI providers, panels, indicators, and themes, running sandboxed and signed.
group: builders
order: 1
eyebrow: For builders
updated: AUG 2026
readTime: 3 min read
---

Everything pluggable in Pairlens goes through the same capability-based plugin
system. A plugin declares the capabilities it provides, and the resolver picks
the best plugin for each requested capability at runtime.

## Capabilities

| Capability                     | What it provides                 |
| ------------------------------ | -------------------------------- |
| `market-data:candles`          | Streaming candles                |
| `market-data:ticker`           | Streaming tickers                |
| `market-data:ticker-snapshot`  | Point-in-time ticker reads       |
| `market-data:orderbook`        | Streaming order books            |
| `market-data:trades`           | Streaming public trades          |
| `market-data:history`          | Historical candle backfill       |
| `market-data:discovery`        | Instrument listing               |
| `market-data:discovery:search` | Instrument search                |
| `market-data:symbol-logo`      | Asset logos                      |
| `trading:orders`               | Order placement and cancellation |
| `trading:balances`             | Account balances                 |
| `ai:inference`                 | A language model                 |
| `ai:web-search`                | Web search for research          |
| `workflow:step-types`          | New workflow canvas steps        |
| `notification:channel`         | New alert delivery channels      |
| `chart:indicator`              | Custom chart indicators          |
| `theme:override`               | A terminal theme                 |
| `workspace-store:catalog`      | A source of workspace templates  |

Plugins also contribute **panels** through the manifest's `contributes` block,
which is how a plugin adds a tile to the workspace grid.

Chat and research are not separate capabilities. Both use `ai:inference` with a
runtime `purpose` selector.

## What the host provides

Mark these as build externals. The host supplies its own instances at runtime,
so your bundle stays small and the WebGL chart engine is never duplicated:

- React
- `@pairlens/plugin-sdk` (hooks)
- `@pairlens/ui` (the design system, imported from the package root)
- `@pairlens/fast-financial-charts` and `@pairlens/fast-financial-charts/react`

## In this section

- **[Create a plugin](/docs/create-a-plugin).** Scaffold and run one locally.
- **[MarketAdapter API](/docs/marketadapter-api).** The interface every
  connector implements.
- **[Publish to the registry](/docs/publish-to-registry).** Sign and ship.
- **[Agent interfaces](/docs/agent-interfaces).** Every way an AI agent can
  drive the terminal, and where the trading boundary sits.

## Sandboxed by default

Non-bootstrap plugins run in a Worker sandbox with a network allowlist derived
from the hosts they declare. Packages are Ed25519-signed against pinned keys,
and full trust is an explicit grant a user makes per plugin, never the default.
See the [security model](/docs/security-model).
