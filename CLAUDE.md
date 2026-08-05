# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pairlens

AI-native crypto spot trading terminal. **Desktop-first, but the browser is a shipped surface** — the primary distribution is a Tauri desktop app (`apps/desktop/`), and a hosted web terminal runs at `terminal.pairlens.finance` (the marketing site's main CTA). The browser build is a real product, not a dev harness; what it cannot do is bounded and explicit. Four connectors (Coinbase, Gate, KuCoin, MEXC) serve REST without CORS headers and stream no candle history, so they declare `requiresDesktop` and refuse in a browser with a typed `PlatformRestrictedError` rather than presenting a dead chart. Desktop additionally gets the OS keychain, background bots, wake-blocking and native windows. Deterministic strategies generate signals, an AI co-pilot provides contextual analysis (APPROVE/BLOCK/WATCH), and user-configurable risk guardrails are enforced at the infrastructure level. The AI augments decisions but never overrides risk limits.

**Credential storage is local-only.** Due to legal constraints, user wallets and exchange API keys must never be persisted on Pairlens servers. On desktop they are stored in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) via the `keychain_*` Tauri commands in `apps/desktop/src-tauri` (backed by the Rust `keyring` crate). In browser dev/testing builds they are stored in localStorage encrypted at rest with AES-256-GCM (non-extractable WebCrypto key in IndexedDB) — this resists reading secrets off disk but not same-origin XSS; desktop is the supported home for live-trading secrets. The frontend entry point is `apps/terminal/src/lib/keychain.ts`. The App Server database must not contain plaintext or encrypted user exchange credentials.

**This repo is the public, source-available side of Pairlens — everything needed to run it.** It is licensed FSL-1.1-Apache-2.0 (each release converts to Apache 2.0 after two years; the external `@pairlens/fast-financial-charts` repo stays MIT). The one component whose source is not (yet) published is the App Server: a small optional backend for sign-in, cross-device sync, and a hosted AI proxy, developed in a separate private repo with plans to publish it. The terminal works fully standalone without it — auth is lean-in, persistence is local by default, and AI works with bring-your-own-key provider plugins.

## Commands

```bash
bun install                    # Install all workspace dependencies
bun run dev                    # Terminal (App Server: local :4046 if running, else Pairlens Cloud)
bun run dev:terminal           # Terminal only
bun run dev:marketing          # Marketing only
bun run dev:registry           # Plugin registry only
bun run dev:desktop            # Tauri desktop app (requires Rust toolchain)
bun run build                  # Build all workspaces
bun run build:terminal         # Build terminal only
bun run build:marketing        # Build marketing only
bun run typecheck              # TypeScript strict check across all workspaces
bun run lint                   # ESLint across all workspaces
bun run test                   # Run all TS tests
bun run format                 # Prettier format
bun run release patch          # Bump desktop version + tag (triggers Release workflow)
```

### Running individual tests

```bash
bun test packages/plugins                    # Connector conformance + parser/order tests (largest suite)
bun test packages/market-engine              # Market engine tests
bun test apps/terminal                       # Terminal unit tests
bun test packages/strategy-engine            # Strategy engine tests
bun test packages/plugin-system              # Plugin system tests
bun test packages/persistence                # Persistence adapter tests
bun test packages/shared                     # Shared package tests
bun test apps/cli                            # CLI integration tests
```

### CLI — interact with markets from the command line

```bash
bun apps/cli/src/index.ts candles --pair BTC-USDT --timeframe 1h --limit 100
bun apps/cli/src/index.ts ticker --pair BTC-USDT --watch
bun apps/cli/src/index.ts orderbook --pair BTC-USDT --levels 20 --watch
bun apps/cli/src/index.ts signals --pair BTC-USDT --timeframe 4h
bun apps/cli/src/index.ts order --pair BTC-USDT --side buy --size 0.001 --mode paper
bun apps/cli/src/index.ts markets
```

## Architecture

### System Overview

```
DESKTOP APP (Tauri)                       OPTIONAL CLOUD (not in this repo)
  Terminal SPA (webview)                  App Server (port 4046) — auth, sync, AI proxy
  Market connector plugins (direct WS)
  Strategy engine (TS)
  Local credential store (OS keychain)

ALSO AVAILABLE
  Hosted web terminal (terminal.pairlens.finance, Vercel) — 11 of 15 venues
  CLI (bun apps/cli/src/index.ts)
  pairlens.finance (marketing, Vercel)
```

**App Server** (optional; the backend whose source isn't published yet — see "What is Pairlens" above): the REST API the terminal talks to when signed in — auth (BetterAuth email OTP), remote persistence, AI proxy, and external-data endpoints (news, top coins, symbol logos, ...). Reached via `apps/terminal/src/lib/api.ts` (`VITE_APP_SERVER_URL`, default `http://localhost:4046`; production `https://api.pairlens.finance`). It never stores exchange credentials and never talks to exchanges — AI routes receive market data from the Terminal (pushed in request body).

**Terminal** (`apps/terminal/`): TanStack Start SPA. Connects to App Server for REST. Market data streams directly from exchanges via **market connector plugins** (OKX, Binance, ByBit, Coinbase, Kraken, and 9 more CEXs, plus broker/DEX connectors) — no intermediate server. The `MarketDataProvider` wraps the plugin system for candle, ticker, and orderbook subscriptions.

**CLI** (`apps/cli/`): Bun-based CLI for headless market interaction. Uses the same connector plugins and strategy engine as the terminal.

### Signal Pipeline

Exchange WS → Market connector plugin → CandleBuffer → consumers compute signals **on demand** with `@pairlens/strategy-engine` (pure functions over the candle buffer). Consumers: copilot market tools (`apps/terminal/src/lib/copilot/market-tools.ts`), the research panel, and the CLI `signals` command. Connectors do NOT push signals on candle close.

### Market Connector Plugins

Market connectors are standard plugins that implement the `MarketAdapter` interface from `@pairlens/market-engine`. Each connector connects directly to exchange WebSocket and REST APIs from the client process (terminal or CLI). No intermediate server.

**Bundled plugins** (available on fresh install):

- **CEX** (14, all read + trade via the shared `createCexConnectorPlugin` factory in `packages/plugins/src/cex-connector/` — a base class, not a plugin itself): OKX (regional routing US/EU/global), Binance, ByBit (region-gated, blocked in US), Bitvavo (region-gated, EU), MEXC (region-gated), KuCoin, Gate, Coinbase, Bitget, Kraken, HTX, Crypto.com, Bitfinex, Upbit (no trigger orders)
- **Broker**: Alpaca (US equities, requires API keys; standalone connector, not the CEX factory)
- **DEX**: Jupiter (Solana), EVM DEX connector — one factory that emits 5 chain plugins (Ethereum, Base, Arbitrum, BSC, Polygon) with swaps via KyberSwap routing
- **DEX data providers** (read-only): GeckoTerminal (primary), DexPaprika
- **AI inference** (bring-your-own-key): Groq, OpenAI, Anthropic, OpenRouter
- **AI web search** (bring-your-own-key): Tavily, Exa
- **Core**: `pairlens-core` (instrument discovery, panels, workflow step types), `pairlens-intelligence` (fallback-only AI inference/search + discovery + symbol logos). `basic-symbols` is deprecated (absorbed into pairlens-core, kept for registry back-compat).
- **Themes**: 17 `theme:override` plugins

**Third-party connectors** can be installed from the Plugin Store at runtime. Any developer can build a connector by implementing `MarketAdapter` and publishing to the registry.

**Community plugins** (`apps/registry/community/`) are published by PR: source lives in the repo, CI validates it (schema, capability policy — no `trading:*` — namespace ownership, build + size cap), and the registry builds + signs it at startup with a separate community key (`REGISTRY_COMMUNITY_SIGNING_KEY`, dev fallback committed at `apps/registry/keys/dev-community.key`). Terminals pin community keys as a distinct tier (`publisherKeyTier` in `packages/shared/src/publisher-keys.ts`) and clamp anything community-signed to the sandbox — the full-trust grant is never offered. See `apps/registry/community/README.md`.

### Monorepo Layout (Turborepo + Bun workspaces)

```
apps/
  terminal/           TanStack Start SPA (React 19, TanStack Router/Query)
  marketing/          Astro static site
  desktop/            Tauri 2 desktop app — PRIMARY distribution (wraps terminal SPA + OS keychain credentials)
  registry/           Plugin registry server (third-party plugin distribution)
  cli/                Bun CLI for headless market interaction
packages/
  ui/                 ShadCN + Tailwind v4 shared component library
  shared/             Shared types — the client/server API contract (mirrored into the App Server repo)
  strategy-engine/    Deterministic signal engine (EMA, ATR, breakout, pullback, mean reversion, regime)
  market-engine/      MarketAdapter interface, CandleBuffer, StreamThrottle, HMAC signer, WS adapter
  plugin-system/      Plugin manager, capability resolver, types
  plugin-sdk/         SDK for third-party plugin authors (bundled to apps/terminal/public/_sdk/)
  plugins/            Bundled plugin implementations (connectors, inference, core, themes)
  create-pairlens-plugin/  Scaffolding CLI for new plugins
  notification-engine/     Notification rules and delivery
  workflow-engine/    User-defined automation workflows
  persistence/        Adapter pattern: local (localStorage + cross-tab sync) and remote (App Server HTTP)
examples/
  dev-starter-plugin/ Example third-party plugin (starter template)
  dev-sync-plugin/    Example plugin exercising the dev sync flow
scripts/
  dev.ts              Starts the Terminal (or Tauri desktop with --desktop)
  env/                Worktree-safe env file loading + derived dev ports
  setup-claude-preview.ts  Generates per-worktree .claude/launch.json (runs on postinstall)
  setup-git-hooks.ts       Wires .githooks (pre-push format/lint) on postinstall
  fetch-plugin-posters.ts  Fetches store poster assets
```

**Charting library is external.** `@pairlens/fast-financial-charts` (Fast Financial Charts — WebGL2 engine + React bindings under the `/react` subpath) lives in its own repo, https://github.com/Pairlens/fast-financial-charts (local checkout: `/Users/juan/GitRepositories/pairlens-charts`), and is consumed by the terminal as an NPM dependency (`@pairlens/fast-financial-charts`, semver-ranged). Its tests and typecheck run in that repo. To pick up charts changes here: release a new version from that repo (`npm version minor && git push origin main --follow-tags` — CI publishes to NPM), then `bun update @pairlens/fast-financial-charts`. It is also a plugin runtime module (`@pairlens/fast-financial-charts`, `@pairlens/fast-financial-charts/react` import-map entries backed by `public/_sdk/fast-financial-charts*.js` shims).

### Key Architectural Boundaries

- **Market connector plugins** are the only code that connects to exchange WebSockets and REST APIs. They run in the terminal process (or CLI). Each connector owns its WS connections, candle buffers, and order execution for its exchange.
- **App Server** (the private backend) is the only service that talks to PostgreSQL. It owns auth (BetterAuth), persistence, and AI features. It never calls exchanges directly — the Terminal pushes market data in AI request bodies. The Terminal reaches it via REST (`apps/terminal/src/lib/api.ts`, `VITE_APP_SERVER_URL`, default `http://localhost:4046`).
- **`packages/shared`** holds the client/server API contract types (`persistence-types`, `instrument-types`, `registry-types`, `affiliates`, ...). The App Server repo carries a mirrored copy — changes to REST payload shapes must be applied in both repos. The Drizzle DB schema lives only in the App Server repo.
- **Credentials are local-only.** Exchange API keys and wallet secrets must never be sent to or stored on the App Server. The Tauri desktop app stores them in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) via the `keychain_*` commands in `apps/desktop/src-tauri`; browser dev builds fall back to AES-256-GCM-encrypted localStorage (see `apps/terminal/src/lib/keychain.ts`). Connector plugins receive credentials at runtime for order routing.
- **Strategy engine** (`packages/strategy-engine/`) is pure TypeScript math — no I/O, no exchange connections. Indicators: EMA, ATR, extremes, volume-MA. Strategies: breakout, EMA pullback, mean reversion. Regime detection in `src/regime.ts`. Consumed on demand by the terminal (copilot tools, research panel) and the CLI — not by connectors.

### Data Ownership

| Data                               | Lives in                                                  | Reason                                             |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Candle history (500-candle buffer) | CandleBuffer (in connector plugin)                        | Fast access for signal computation + streaming     |
| Recent signals                     | Computed on candle close (in plugin)                      | Ephemeral, computed by strategy-engine             |
| Order book state                   | Local book maps (in connector plugin)                     | Maintained from incremental WS updates             |
| User state, trades, AI chat        | Local persistence by default; PostgreSQL via App Server when signed in | Durable remote persistence is opt-in |
| Exchange API credentials           | OS keychain (desktop); AES-GCM localStorage (browser dev) | Legal: must never be persisted on Pairlens servers |
| Auth sessions                      | App Server (BetterAuth)                                   | Session tokens, accounts, verifications            |

### Authentication (BetterAuth)

The App Server runs BetterAuth at `/api/auth` with email OTP login. The Terminal uses the `better-auth` client-side SDK (`apps/terminal/src/lib/auth-client.ts`). Sessions ride on **bearer tokens** (BetterAuth `bearer()` plugin), not cookies: sign-in responses carry a `set-auth-token` header the client persists (`pairlens:auth-token` in localStorage) and replays as `Authorization: Bearer`. This is what makes cross-origin sign-in work — the Tauri desktop webview (`tauri://localhost`) against `api.pairlens.finance`, the hosted web terminal, and localhost dev against any remote App Server — where third-party cookies would be blocked. **No App Server request may ask for cookies:** every call sends `APP_SERVER_CREDENTIALS` (`'same-origin'`, exported from `auth-client.ts`), because a credentialed cross-origin request is spec-refused against a wildcard `Access-Control-Allow-Origin` and surfaces as a bare "fetch failed". This has broken sign-in twice — desktop in July, the web terminal in August. Auth is always optional — with an empty `VITE_APP_SERVER_URL`, the terminal runs standalone with local persistence.

When an App Server runs locally on :4046 (maintainers run it from its repo), OTP codes are printed to its console (no SMTP setup required). Look for `[auth] OTP for <email> (sign-in): <code>`. Against Pairlens Cloud (the dev default when no local server runs), OTP codes are emailed — sign in with your real email.

#### Signing in during development

1. `bun run dev` — by default the terminal targets Pairlens Cloud (sign in with your real email; the OTP is emailed), or a local App Server on :4046 when one runs (maintainers; use `ai.agent@pairlens.finance` — the OTP prints to the **App Server console**)
2. Enter the 6-digit code in the terminal UI

```bash
# Programmatic access
curl -X POST http://localhost:4046/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"ai.agent@pairlens.finance","type":"sign-in"}'

# Read OTP from App Server console, then sign in and capture the bearer token
# (sessions are bearer-token, not cookies — the token arrives in the set-auth-token response header):
TOKEN=$(curl -si -X POST http://localhost:4046/api/auth/sign-in/email-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"ai.agent@pairlens.finance","otp":"123456"}' \
  | awk 'tolower($1)=="set-auth-token:" {print $2}' | tr -d '\r')

curl http://localhost:4046/api/auth/get-session -H "Authorization: Bearer $TOKEN"
```

## Distribution & Auto-Update

Desktop releases are built by `.github/workflows/release.yml` (triggered by `v*` tags — cut them with `bun run release`) and published as draft releases on this repo; publishing the draft ships the update. Release builds bake `VITE_APP_SERVER_URL=https://api.pairlens.finance` (repo variable `APP_SERVER_URL` overrides) so shipped apps have cloud features. Installed apps auto-update via the Tauri updater plugin: they poll `latest.json` on the latest published release (requires the repo to be public — it will be), verify the minisign signature against the pubkey pinned in `apps/desktop/src-tauri/tauri.conf.json`, download, and relaunch. Frontend update UX lives in `apps/terminal/src/lib/updater.ts`; the update manifest is rebuilt deterministically by `scripts/release/updater-manifest.ts`. Full pipeline, one-time setup (secrets, signing keys) and troubleshooting: `docs/RELEASING.md`.

## Local Development

### Starting the environment

```bash
bun run dev                    # Starts the Terminal (Vite)
```

No Docker and no `.env.local` required. Default local URLs:

| Service    | URL                             |
| ---------- | ------------------------------- |
| Terminal   | `http://localhost:3000`         |
| App Server | resolved automatically (below)  |

Terminal/marketing/registry port offsets are derived per worktree (see `scripts/env/with-worktree-env.ts`).

**App Server resolution** (`scripts/env/resolve-app-server.ts`, shared by `bun run dev`, `bun run dev:terminal`, and the Claude preview servers):

1. `VITE_APP_SERVER_URL` — explicit override (shell or `.env.local`); an explicitly empty value means standalone
2. `http://localhost:4046` — a locally-running App Server, auto-detected
3. `https://api.pairlens.finance` — Pairlens Cloud, so a fresh checkout gets sign-in, news, top coins, and symbol logos with zero setup

`PAIRLENS_STANDALONE=1` opts out entirely (auth off, cloud panels hidden, local persistence only).

### Signing in locally

With the Pairlens Cloud default, sign in with a real email — the OTP is emailed. With a local App Server (maintainers, auto-detected on :4046), OTP codes print to its console — use `ai.agent@pairlens.finance` for dev/testing. See the [Authentication](#authentication-betterauth) section for programmatic access via curl.

### Validating changes in the browser

When validating UI changes, use the available browser tooling (Claude Code preview tools via `.claude/launch.json`, or browser automation like Claude-in-Chrome) to:

1. Start/open the terminal at `http://localhost:3000` (or the worktree-derived port; the preview config uses the `terminal-preview` entry)
2. Visually verify the terminal loads, charts render, and plugin connections are active
3. Read page text/accessibility snapshots to verify content
4. Inspect DOM state or run assertions via the tool's JS evaluation
5. Capture screenshots for visual verification

### Testing changes

```bash
bun run test                   # All TypeScript tests
bun test packages/<name>       # Individual package tests
bun test apps/cli              # CLI integration tests
```

### Before finalizing any work

Always run this checklist before considering work complete:

```bash
bun run typecheck              # Zero TypeScript errors across all workspaces
bun run lint                   # Zero ESLint warnings
bun run format                 # Prettier formatting (auto-fixes)
bun run test                   # All TS tests pass
```

If any of these fail, fix the issues before committing.

## Code Style

- **Prettier**: no semicolons, single quotes, trailing commas
- **ESLint**: TanStack config (`@tanstack/eslint-config`)
- **TypeScript**: strict mode, ES2022 target, no unused locals/parameters
- **Package manager**: Bun (not npm/yarn) — `bun add`, `bunx`, `bun test`

## Environment

No `.env.local` is required for development. `bun run dev` works out of the box with `scripts/dev.ts` injecting all required env vars.

For self-hosted production, create a root `.env.local`. Env precedence (later wins):

1. Git root `.env.shared` (committed defaults)
2. Git root `.env.local` (local secrets)
3. Current checkout `.env.shared`
4. Current checkout `.env.local`
5. Shell/CI environment variables

### Key Environment Variables

| Variable              | Used by  | Purpose                                                                                                                    |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `VITE_APP_SERVER_URL` | Terminal | App Server URL. Dev resolution when unset: local `:4046` if running, else Pairlens Cloud (`https://api.pairlens.finance`). Explicitly empty = standalone (auth off) |
| `PAIRLENS_STANDALONE` | Terminal | `1` = fully offline dev: no App Server, auth off, cloud panels hidden, local persistence only |

Production **desktop release builds** must set `VITE_APP_SERVER_URL=https://api.pairlens.finance` in the environment of `tauri build` (the dev-time cloud fallback lives in dev scripts only — a bare production build defaults to standalone).
| `VITE_REGISTRY_URL`   | Terminal | Plugin registry URL (auto-derived for local dev)                                                                             |
| `TERMINAL_PORT`       | Terminal | Dev server port override (worktree-derived by default)                                                                      |

Server-side variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_GATEWAY_API_KEY`, `CMC_API_KEY`, ...) belong to the App Server and are not used in this repo.

## Key Patterns

### Plugin System

Capability-based plugin resolution in `packages/plugin-system/`. Plugins declare capabilities (market-data:candles, market-data:ticker, market-data:orderbook, market-data:trades, market-data:history, trading:orders, ai:inference, theme:override, etc.) via manifests. The `PluginResolver` finds the best plugin for a requested capability.

The terminal integrates via `PairlensProvider` (`src/lib/pairlens-provider.tsx`) for plugin lifecycle, and `MarketDataProvider` (`src/lib/market-data-provider.tsx`) for market data streaming. Market connector plugins connect directly to exchange WebSockets — no intermediate server. Candle streaming uses `pluginManager.subscribe('market-data:candles', ...)`.

**Capability IDs** (source of truth: `packages/shared/src/plugin-types.ts`): `market-data:discovery`, `market-data:discovery:search`, `market-data:candles`, `market-data:ticker`, `market-data:ticker-snapshot`, `market-data:orderbook`, `market-data:trades`, `market-data:history`, `market-data:symbol-logo`, `ai:inference`, `ai:web-search`, `trading:orders`, `trading:balances`, `workflow:step-types`, `theme:override`, `chart:indicator` (plus `notification:channel` and `workspace-store:catalog`, defined in the type but with no bundled provider yet). Note: there is no `ai:context` or `ai:search` — AI capabilities are exactly `ai:inference` and `ai:web-search`; chat vs research is a runtime `purpose` selector on `ai:inference`, not a capability.

### Custom Python Indicators

Users write chart indicators in **Python** (Pine-Script-like, but real Python with pip dependencies), authored in the `/indicators` workbench (left-nav entry; CodeMirror editor + live preview). Execution is local-only: **Pyodide (CPython→WASM) in a dedicated Web Worker** (`apps/terminal/src/lib/python/` — runtime host, worker, RPC protocol, and the `pairlens` Python SDK in `pairlens_sdk.py`). Pyodide core assets are self-hosted from `public/_pyodide/` (staged from node_modules by a Vite plugin, gitignored); compiled wheels (numpy…) come from jsDelivr and pure-Python wheels from PyPI via micropip (hosts in the desktop CSP baseline). Candles cross the worker boundary as transferable Float64Arrays.

A script exports `meta = indicator(title=..., pane='overlay'|'sub', inputs=[...], series=[...])` plus `compute(ctx)` returning per-series arrays; the extracted `CustomIndicatorMeta` (`packages/shared/src/plugin-types.ts`) drives the chart picker entry, params/settings UI, and the generic multi-series presenter in `@pairlens/fast-financial-charts`. Distribution rides the plugin system via the **`chart:indicator`** capability: the user's own scripts are served by the bootstrap `user-indicators` plugin (backed by the `pairlens:indicator-scripts` store), any script exports from the workbench as a standalone sandbox-safe plugin zip, and installed plugins contribute indicators through the same capability (collected in `apps/terminal/src/lib/indicators/custom-indicator-registry.ts`). In the chart engine, `custom:*` indicator types compute asynchronously on the main thread via registered `IndicatorDefinition`s; Python runs on bar close / param change (1s-throttled forming-bar refresh, cached otherwise).

### AI Copilot Architecture

**The terminal owns the agentic loop — all copilot logic is client-side.** `apps/terminal/src/lib/copilot-brain.ts` runs the loop; ~60 tools live under `apps/terminal/src/lib/copilot/` (chart control, market/context/portfolio reads, workspace actions, gated trading proposals). Data tools execute in the transport on the client; trades surface as confirm-card proposals through the guarded order path. The App Server is only an OpenAI-compatible inference proxy (`/api/ai/v1/chat/completions`). AI provider plugins (Groq/OpenAI/Anthropic/OpenRouter and the bundled `pairlens-intelligence` fallback) expose `getLanguageModel()`.

### Terminal Routing

TanStack Router with file-based routing in `apps/terminal/src/routes/`. Route tree is auto-generated (`routeTree.gen.ts`). State management via TanStack Query. REST calls via `src/lib/api.ts`. Real-time data via plugin system.

Major surfaces: the `_terminal.tsx` layout group hosts `index`, `pair/$pair` (chart terminal), `accounts`, `notifications`, `plugins` (Plugin Store), `workspace-store` (Workspace Store), `workspace/$workspaceId`, and `workflows`; standalone routes are `onboarding.tsx` (full-page spotlight onboarding) and `sign-in.tsx`.

### Shared Package Imports

```typescript
import {
  Market,
  Timeframe,
  Candle,
  SignalPayload,
} from '@pairlens/shared/types'
import { computeSignals } from '@pairlens/strategy-engine/compute'
import type { MarketAdapter } from '@pairlens/market-engine/adapter'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **custom-library-indicators-b5f40d**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/custom-library-indicators-b5f40d/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/custom-library-indicators-b5f40d/context` | Codebase overview, check index freshness |
| `gitnexus://repo/custom-library-indicators-b5f40d/clusters` | All functional areas |
| `gitnexus://repo/custom-library-indicators-b5f40d/processes` | All execution flows |
| `gitnexus://repo/custom-library-indicators-b5f40d/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
