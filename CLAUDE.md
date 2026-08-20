# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pairlens

AI-native trading terminal for crypto spot, perpetual futures, prediction markets and US equities. **Desktop-first, but the browser is a shipped surface** — the primary distribution is a Tauri desktop app (`apps/desktop/`), and a hosted web terminal runs at `terminal.pairlens.finance` (the marketing site's main CTA). The browser build is a real product, not a dev harness; what it cannot do is bounded and explicit. Eight connectors (Coinbase, Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin Futures, Kraken Futures) serve REST without CORS headers, so they declare `requiresDesktop` and refuse in a browser with a typed `PlatformRestrictedError` rather than presenting a dead chart. Desktop additionally gets the OS keychain, background bots, wake-blocking and native windows. Deterministic strategies generate signals, one AI assistant spans the whole terminal (see [The AI Assistant](#the-ai-assistant)), and user-configurable risk guardrails are enforced at the infrastructure level. The AI augments decisions but never overrides risk limits.

**Phones get the Mobile Trading Terminal.** Below 768px the same URL boots a chart-centric five-tab surface — Watchlist · Trade · Chart · Assistant · Discover — built from the same codebase, under `apps/terminal/src/mobile/`. It is a trading surface, not a shrunken dashboard: order entry with the same guarded order path, a full order book, drawings, the assistant, and the same connect-an-account flow. Architecture in [Mobile Terminal](#mobile-terminal).

**Credential storage is local-only.** Due to legal constraints, user wallets and exchange API keys must never be persisted on Pairlens servers. On desktop they are stored in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) via the `keychain_*` Tauri commands in `apps/desktop/src-tauri` (backed by the Rust `keyring` crate). In a browser — the hosted web terminal and the phone — they live in the credential vault: AES-256-GCM ciphertext in localStorage under one data key, which every protector the user enrolls (a vault password, a passkey via PRF, Touch ID on macOS) wraps a copy of. Enrolling a protector is a precondition for the first credential, so a browser profile holds ciphertext or holds nothing, and a sealed vault throws rather than reporting a value as absent. That resists reading secrets off disk; it does not resist same-origin XSS, so desktop remains the strongest home for live-trading secrets. The frontend entry point is `apps/terminal/src/lib/keychain.ts` (vault internals in `src/lib/security/vault/`). The App Server database must not contain plaintext or encrypted user exchange credentials.

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
  Hosted web terminal (terminal.pairlens.finance, Vercel) — 14 of 22 venues
  Mobile terminal — the same URL below 768px (apps/terminal/src/mobile/)
  CLI (bun apps/cli/src/index.ts)
  pairlens.finance (marketing, Vercel)
```

**App Server** (optional; the backend whose source isn't published yet — see "What is Pairlens" above): the REST API the terminal talks to when signed in — auth (BetterAuth email OTP), remote persistence, AI proxy, and external-data endpoints (news, top coins, symbol logos, ...). Reached via `apps/terminal/src/lib/api.ts` (`VITE_APP_SERVER_URL`, default `http://localhost:4046`; production `https://api.pairlens.finance`). It never stores exchange credentials and never touches exchange market data or trading — AI routes receive market data from the Terminal (pushed in request body), and the App Server itself opens ZERO exchange connections. The capture jobs that used to be its two narrow exceptions live in a separate private **Market Data Collector** service (`github.com/juanignaciomolina/pairlens-market-collector`) writing to the same Postgres the App Server reads: the instruments-index sweeper fetches public **listings metadata** (which pairs each venue lists — spot pairs and, since snapshot schema v2, the futures venues' linear-perp contracts) via stock ccxt, compiled into the discovery snapshot the terminal downloads at idle — never prices, books, candles or trades, never with credentials, never on a user's behalf; and the liquidation collectors hold the public liquidation streams of Binance Futures and Bybit, with the App Server serving the prints back only aggregated into price and minute buckets (`/api/liquidations`, 72h retention, with a per-venue `completeness` flag because Binance samples one order per symbol per second and Bybit pushes everything) — they exist because no client can hold a three-day window of a venue-wide stream. The collector deploys once in the US and once in the EU, each owning the sources its region can reach (Binance/Bybit geo-block US datacenter IPs).

**Terminal** (`apps/terminal/`): TanStack Start SPA. Connects to App Server for REST. Market data streams directly from exchanges via **market connector plugins** (OKX, Binance, ByBit, Coinbase, Kraken, and 9 more CEXs, plus broker/DEX connectors) — no intermediate server. The `MarketDataProvider` wraps the plugin system for candle, ticker, and orderbook subscriptions. One codebase serves two shells: the desktop pane grid, and the mobile terminal below 768px.

**CLI** (`apps/cli/`): Bun-based CLI for headless market interaction. Uses the same connector plugins and strategy engine as the terminal.

### Mobile Terminal

Below 768px the terminal renders a different shell. `apps/terminal/src/routes/_terminal.tsx` branches on `useViewportMode()` and returns `<MobileTerminalRoot />` in place of the whole desktop `SidebarProvider` subtree, `<Outlet />` included — so on a phone no desktop chrome and no child route component ever mounts. The gate is a pre-hydration inline script in `__root.tsx` that stamps `html[data-viewport]`, read back through `useSyncExternalStore`: correct on the first render, so a phone never paints a desktop frame. Every global provider sits above the branch, which is what lets a live resize swap shells without dropping plugins, sockets or the watchlist store.

Everything mobile lives under `apps/terminal/src/mobile/` — `primitives/`, `chart/`, `panels/`, `screens/`, `lib/`, plus the shell files at the root of that directory. The rules that hold it together:

- **Five destinations, one chart.** The tabs are local state, not routes — router-driven tabs would either unmount the chart or need a keep-alive hack, and local state is what ports to a native app. `/pair/$pair` stays canonical; `use-mobile-route-sync.ts` rewrites it on every focus change and redirects the desktop-only routes back with a single toast. Panels are bottom sheets layered over a chart that never unmounts, and tapping the chart dismisses whichever one is open.
- **Separable.** Nothing outside `src/mobile/` imports from it, with three sanctioned exceptions: `routes/_terminal.tsx` (the branch), `components/onboarding/spotlight/onboarding-spotlight.tsx` (onboarding lives outside `_terminal` and reads the same viewport gate), and the `@import` in `styles.css`. `mobile/__tests__/separability.test.ts` fails loudly on a fourth. That one-way edge is what makes a native app or a browser extension a re-host rather than a rewrite.
- **No `stateScope`.** The mobile `ChartTerminalProvider` is mounted without one, so timeframe and drawings persist to the desktop's own keys — a level drawn on the phone is there on the laptop.
- **Credentials take the identical path.** The mobile connect flow mounts the same wizard, the same vault gate and the same keychain writes as the desktop Accounts page; both drive one shared hook, `hooks/use-connect-wizard-state.ts`. Orders go through the same guarded `placeOrder`.
- **No per-tick renders in chrome.** Only the price readout, the chart, the order-book strip and the order-book screen may subscribe to the streaming contexts; everything else reads chart config or refs. `__root.tsx` carries a dev-only render counter for checking it.

The marketing landing knows about the phone too: below 767px the hero drops "Launch in browser" and "Download for desktop" for a single **Launch Mobile Terminal** CTA (`apps/marketing/src/components/marketing/ZeusHero.astro` — a CSS-only swap at the terminal's own breakpoint, so the button and the shell always agree).

### Signal Pipeline

Exchange WS → Market connector plugin → CandleBuffer → consumers compute signals **on demand** with `@pairlens/strategy-engine` (pure functions over the candle buffer). Consumers: the chart pane's Signals strip (`scanSignals` in `apps/terminal/src/hooks/use-candle-stream.ts` — historical scan on snapshot + bar close), the assistant's market tools (`apps/terminal/src/lib/copilot/market-tools.ts`), its `deep_research` tool, and the CLI `signals` command. Connectors do NOT push signals on candle close.

### Market Connector Plugins

Market connectors are standard plugins that implement the `MarketAdapter` interface from `@pairlens/market-engine`. Each connector connects directly to exchange WebSocket and REST APIs from the client process (terminal or CLI). No intermediate server.

**Bundled plugins** (available on fresh install):

- **CEX** (14, all read + trade via the **CCXT bridge**: `createCcxtConnectorPlugin` in `packages/plugins/src/ccxt-connector/` builds a `CexConnectorSpec` per venue and delegates to the `cex-connector` shell in `packages/plugins/src/cex-connector/` — neither is a plugin itself): OKX (regional routing US/EU/global + per-credential account entity), Binance, ByBit (region-gated, blocked in US), Bitvavo (region-gated, EU), MEXC (region-gated), KuCoin, Gate, Coinbase, Bitget, Kraken, HTX, Crypto.com, Bitfinex, Upbit (no trigger orders). Venue protocol work (WS channels, signing, order mapping) is ccxt's; the bridge owns everything ccxt lacks in a browser — reconnect pacing, inbound-silence liveness, wake recovery, the markets pipeline, regional/geo routing, and per-venue ccxt bug patches (see `ccxt-connector/venues/*.ts`). See "CCXT bridge" below.
- **Broker**: Alpaca (US equities, requires API keys; standalone connector, not the CEX factory)
- **DEX**: Jupiter (Solana; also serves Orca/Raydium CLMM LP position reads), EVM DEX connector — one factory that emits 5 chain plugins (Ethereum, Base, Arbitrum, BSC, Polygon) with swaps via KyberSwap routing plus Uniswap/Pancake v3 LP reads AND writes (collect/decrease/increase against pinned NFPM deployments), `lifi-bridge-connector` (EVM-to-EVM bridging via LI.FI: `market-data:bridge` quotes/status + `trading:bridge` guarded execution), and `helius-rpc-provider` (`rpc:solana`, BYOK Helius key with public-RPC fallback; its endpoint is wired into the Jupiter connector at runtime)
- **Futures** (5, linear perpetual swaps): Binance Futures (`binanceusdm`, browser-capable — fapi.binance.com sends `access-control-allow-origin: *`; paper via `urls.test` on testnet.binancefuture.com; `maxLeverage: 125`), ByBit Futures (the spot `bybit` class pointed at linear swaps, browser-capable — api.bybit.com reflects the request origin; mirrors the spot venue's geo rules: US refused, EU on bybit.nl, paper on the one global testnet; `maxLeverage: 100`), OKX Futures (the spot `okx` class pointed at swap, browser-capable via the spot venue's public-CORS fallback; inherits the regional entities and the per-credential account entity wholesale, paper via demo trading, deliberately NO geoCheck — every entity serves the public swap feed and trading rights are the entity's own order-time decision; `maxLeverage: 100`), KuCoin Futures (`kucoinfutures`, `requiresDesktop`, NO sandbox so paper is refused, integer contract counts with a per-market `contractSize`) and Kraken Futures (`krakenfutures`, `requiresDesktop`, paper via demo-futures.kraken.com, no watchOHLCV so candles ride the trade aggregator). They ride a **sibling factory**, `createCcxtFuturesConnectorPlugin` in `packages/plugins/src/ccxt-futures-connector/`, which reuses the `cex-connector` shell and the spot bridge's exchange host, watch driver and parsers but forks symbol mapping (a 3-segment `BASE-QUOTE-SETTLE` pair key), the markets table (cache key `${exchangeId}:swap:v1`, never colliding with spot's `:v2` — which is what lets ByBit/OKX share their spot venue's ccxt exchange id) and order building (sizes are contract counts, `reduceOnly`/`leverage` passthrough, no tgtCcy; OKX futures pins `tdMode: 'cross'`, never spot's `cash`). Binance, ByBit, OKX and KuCoin futures declare `metadata.credentialAlias` naming their spot venue, so one API key provisions both connectors; Kraken Futures has its own `CREDENTIAL_SCHEMAS` entry because its keys are issued separately from spot.
- **Predictions** (2, event contracts): Kalshi (`requiresDesktop` — its API 403s any foreign `Origin`; API Key ID + RSA PEM, paper via ccxt `urls.test` demo env, limit-only, 1m/1h/1d) and Polymarket (browser-capable, wallet-signed EOA like the EVM DEX connectors, live-only, market + limit, 1m/5m/1h/1d, refuses US at trade time). Both ride the **prediction runtime** in `packages/plugins/src/prediction-connector/`, which hosts ccxt `PredictionExchange` venues and deep-imports `ccxt/js/src/prediction/<id>.js`. Instruments are outcomes priced 0..1 (UI shows cents); each outcome is its own instrument, so `OrderParams` is unchanged and sizes are contract counts.
- **DEX data providers** (read-only, keyless): GeckoTerminal (primary, priority 5), DexPaprika (priority 6, desktop-only: no CORS header), DexScreener (priority 7, `market-data:pool-stats` only). DexScreener exists for one reason: it publishes both-side pool reserves over open CORS, so the browser gets them. The resolver picks one provider per capability and GeckoTerminal answers stats without per-side reserves, so `apps/terminal/src/hooks/use-pool-stats.ts` fetches DexScreener DIRECTLY for the primary's own pool address and merges only the null fields (`lib/dex/pool-stats-merge.ts`: fill never overwrites, identity and `source` stay the primary's, and a supplement about a different pool is refused). It refuses `trades`/`pools`/`networks` rather than answering null, and serves no candles: DexScreener has no OHLCV.
- **AI inference** (bring-your-own-key): Groq, OpenAI, Anthropic, OpenRouter
- **AI web search** (bring-your-own-key): Tavily, Exa
- **Core**: `pairlens-core` (instrument discovery, panels, workflow step types), `pairlens-intelligence` (fallback-only AI inference/search + discovery + symbol logos), and the four asset-class families, each zero-capability and each shipping its own panes plus its own workspace presets so a deployment that drops the family drops both: `pairlens-predictions` (the event board, outcome ladder, basket ticket, `events` browser and `prediction-positions`, plus the prediction desk, the race board and the `template:prediction-discovery` home board), `pairlens-cex-futures` (funding matrix, basis, open interest, funding belt, liquidation map, margin health, risk controls and `futures-positions`, plus the perps desk, carry and risk boards), `pairlens-dex` (pool and route panes, LP panes, the cross-chain ladder, plus the on-chain boards) and `pairlens-equities` (session clock, Level 1, company, your-position and the calendars, plus the stock boards). Panes owned by a family are keyed bare in saved layouts, so all four ids are in `FIRST_PARTY_PLUGIN_IDS` (`lib/layout/pane-registry.ts`). `basic-symbols` is deprecated (absorbed into pairlens-core, kept for registry back-compat).
- **Themes**: 18 `theme:override` plugins

**Plugins ship their own workspace presets.** `PluginManifest.contributes.workspaces` (`ContributedWorkspace` in `packages/shared/src/plugin-types.ts`) carries store templates and route-menu presets: an id, store copy, browse facets, an optional `context`/`routeMenu`/`menuLabel`, a `pairDefault`, and a structural layout. Each asset class's pair default lives with its family plugin, so disabling the family removes its layouts from the Workspace Store, the workspaces menu and Discovery live. Terminal side: `lib/workspace-store/workspace-template-registry.ts` (a `DynamicPaneRegistry` twin, registered in `pairlens-provider.tsx` onActivated / unregistered on deactivate + uninstall; bootstrap contributions verbatim, third-party sanitized with the community-mapping caps), merged into the store by `use-workspace-templates.ts` and into route menus by `lib/layout/use-route-presets.ts` + `mergeRoutePresets` in `catalog.ts`. One thing is NOT reactive and must not become so: `lib/layout/workspaces/pair-workspace.ts` imports each class's raw geometry statically from the plugin package's leaf `workspaces.ts` module, because `defaultPreset` seeds the layout reducer on first paint, before any plugin activates.

**Plugin families.** Every official manifest stamps `metadata.family` with a `PluginFamilyId` from `packages/shared/src/plugin-families.ts` (`core`, `intelligence`, `themes`, `ai-byok`, `cex-spot`, `cex-futures`, `dex`, `equities`, `predictions`). A family is presentation plus policy only: plugin ids, capabilities and persisted state are unaffected. It buys two things. A deployment can drop a whole asset class with `VITE_PAIRLENS_DISABLED_FAMILIES` (excluded families are never seeded into the ledger, never installed at boot even with a stale ledger row, never listed in the Plugin Store, and refused by `reinstallBundledPlugin`; `core` and `intelligence` are `required` and refuse exclusion). And the Plugin Store's Installed tab groups by family with an enable/disable-all switch per non-required family, which just drives the existing per-plugin ledger toggle. The filter only ever touches plugins whose ledger source is `bootstrap`, so a user's own plugins are never family-filtered. `pluginFamilyOf(manifest)` resolves the explicit stamp first, then falls back to capability shape; null means unfamilied, which is never filtered.

**Bundled plugins are real install units, and that is the USER-level asset-class control** (the env var above is the DEPLOYMENT-level one). Uninstalling a bundled plugin goes through one shared helper, `apps/terminal/src/lib/plugins/uninstall-plugin.ts` (manager → ledger tombstone → module-cache evict → network-grant revoke → App Server state → capability pins), used by the Installed tab, the Store and the product page; `pairlens-core` is refused inside the helper, not just hidden in the UI. Installing one again goes through `bootstrap-reinstall.ts`, which installs the factory straight from `BOOTSTRAP_PLUGINS` and calls `reviveBootstrapEntry` to lift the tombstone, so a bundled plugin never gets rewritten as a `registry` source. The Store lists tombstoned bundled plugins alongside registry ones (offline too) so they always have a way back. Compliance recipe: dropping predictions is uninstalling `pairlens-predictions` + `kalshi-market-connector` + `polymarket-market-connector`; same shape for any class.

**Third-party connectors** can be installed from the Plugin Store at runtime. Any developer can build a connector by implementing `MarketAdapter` and publishing to the registry.

**Community plugins** (`apps/registry/community/`) are published by PR: source lives in the repo, CI validates it (schema, capability policy — no `trading:*` — namespace ownership, build + size cap), and the registry builds + signs it at startup with a separate community key (`REGISTRY_COMMUNITY_SIGNING_KEY`, dev fallback committed at `apps/registry/keys/dev-community.key`). Terminals pin community keys as a distinct tier (`publisherKeyTier` in `packages/shared/src/publisher-keys.ts`) and clamp anything community-signed to the sandbox — the full-trust grant is never offered. See `apps/registry/community/README.md`.

### CCXT bridge

The 14 spot CEX connectors ride on **ccxt@4.5.71, pinned in `packages/plugins` only** (the 3 futures venues ride the same pinned ccxt through the sibling `ccxt-futures-connector/` factory; the 2 prediction venues ride a **separate runtime**, `prediction-connector/` — the spot bridge assumes symbols, base/quote and spot markets throughout, so do not try to host a `PredictionExchange` on it) and patched via bun's patch mechanism (`patches/ccxt@4.5.71.patch`). The patch has exactly three items: `./js/src/*.js` subpath exports (the key must carry `.js` — bun is lenient, Vite is strict), `fflate` added to ccxt's deps (isolated-linker resolution for browser WS gunzip), and an `onMessage` fix normalizing browser `ArrayBuffer` frames to `Uint8Array` (ccxt assumes Node Buffers; without it HTX is completely dead in a browser and Upbit/MEXC binary frames parse wrong). Rules that keep it working:

- **Never import the ccxt barrel.** Venues load their exchange class with a dynamic deep import (`ccxt/js/src/pro/<id>.js`) so each ~1 MB class is its own chunk. Only `packages/plugins` may import ccxt at all.
- **Browser shims** live in the terminal: `vite.config.ts` aliases `ws` and `undici` to stubs. `protobufjs` is a real dependency (MEXC WS frames) — never shim it.
- **The bridge owns liveness.** ccxt's reconnect backoff is hardcoded to 0 and its stall detector cannot fire in a browser; `watch-driver.ts` does reconnect pacing, inbound-silence watchdogs and wake recovery, and `exchange-host.ts` rebuilds instances on region/entity change (`exchange.close()` raced against a 3 s timeout, then discarded).
- **On every ccxt bump**: re-apply/verify the patch, re-check the venue-local ccxt bug workarounds flagged in `ccxt-connector/venues/*.ts` comments (two invert if upstream fixes them — cryptocom/upbit percentage scaling), and **browser-verify the binary-frame venues (HTX, Upbit, MEXC)** — bun delivers Node-style Buffers, so bun-side tests prove nothing about the browser there.
- **Geo/regional behavior is pinned** by `ccxt-connector/__tests__/geo-parity.test.ts` (refusals venue×country, host routing public/authed/paper, OKX account-entity override, reactive 451/403 classification). Extend it whenever routing logic changes.

### Monorepo Layout (Turborepo + Bun workspaces)

```
apps/
  terminal/           TanStack Start SPA (React 19, TanStack Router/Query)
    src/mobile/       Mobile terminal shell (< 768px) — separable, see Mobile Terminal
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
- **App Server** (the private backend) is the only service that talks to PostgreSQL. It owns auth (BetterAuth), persistence, and AI features. It never touches exchange market data or trading — the Terminal pushes market data in AI request bodies; the instruments-index sweeper and the liquidation collectors run in the separate private Market Data Collector service, which writes the same Postgres the App Server serves from (see the App Server overview above). The Terminal reaches it via REST (`apps/terminal/src/lib/api.ts`, `VITE_APP_SERVER_URL`, default `http://localhost:4046`).
- **`packages/shared`** holds the client/server API contract types (`persistence-types`, `instrument-types`, `registry-types`, `affiliates`, ...). The App Server repo carries a mirrored copy — changes to REST payload shapes must be applied in both repos. The Drizzle DB schema lives only in the App Server repo.
- **Credentials are local-only.** Exchange API keys and wallet secrets must never be sent to or stored on the App Server. The Tauri desktop app stores them in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) via the `keychain_*` commands in `apps/desktop/src-tauri`; browsers store them as vault ciphertext in localStorage (see `apps/terminal/src/lib/keychain.ts`). Connector plugins receive credentials at runtime for order routing.
- **Mobile is a one-way dependency.** `src/mobile/` imports into the app freely; the app does not import from `src/mobile/` except at the three seams listed in [Mobile Terminal](#mobile-terminal). A shared helper both shells need belongs outside `src/mobile/` (`src/hooks/`, `src/lib/`), never inside it.
- **Strategy engine** (`packages/strategy-engine/`) is pure TypeScript math — no I/O, no exchange connections. Indicators: EMA, ATR, extremes, volume-MA. Strategies: breakout, EMA pullback, mean reversion. Regime detection in `src/regime.ts`. Consumed on demand by the terminal (the assistant's tools, the research pipeline) and the CLI — not by connectors.

### Data Ownership

| Data                               | Lives in                                                  | Reason                                             |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Candle history (500-candle buffer) | CandleBuffer (in connector plugin)                        | Fast access for signal computation + streaming     |
| Recent signals                     | Computed on candle close (in plugin)                      | Ephemeral, computed by strategy-engine             |
| Order book state                   | Local book maps (in connector plugin)                     | Maintained from incremental WS updates             |
| User state, trades                 | Local persistence by default; PostgreSQL via App Server when signed in | Durable remote persistence is opt-in |
| Assistant conversations            | localStorage (`stores/assistant-conversations-store.ts`); the App Server too, but only once the user opts in | Privacy: uploading a transcript is a decision, not a default |
| Exchange API credentials           | OS keychain (desktop); vault-encrypted localStorage (browser) | Legal: must never be persisted on Pairlens servers |
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

The **mobile shell needs headless Chrome over CDP**, not the preview pane: the pane keeps the document hidden, so `requestAnimationFrame` never runs and anything animated reads as frozen, and its visibility flips trip the terminal lock shield. Launch `--headless=new`, drive the page over the CDP websocket, and set the viewport with `Emulation.setDeviceMetricsOverride` (402×874, `mobile: true`) so the `html[data-viewport]` stamp lands on `mobile`.

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

### Docs ship with the change

The user-facing documentation is a shipped surface, not a follow-up. It lives in `apps/marketing/src/content/docs/` (~50 pages; nav, search, and `llms.txt` are all derived from each page's frontmatter) and is served at `/docs` on the marketing site.

**Every change that alters what a user sees or does must update the docs in the same change.** A new surface, a renamed control, a moved default, a behaviour a page now describes wrongly. A page that documents the old way is worse than no page: it is a confident wrong answer.

Before considering any user-visible work complete:

1. Find the pages that describe what you touched. Read them, don't guess:
   ```bash
   grep -rln "<feature or control name>" apps/marketing/src/content/docs/
   ```
2. Update the prose, and bump `updated:` (plus `readTime:` when a page gains or loses a section).
3. A new page needs full frontmatter — `title`, `description`, `group`, `parent`, `order`, `eyebrow`, `updated`, `readTime` — because nothing else registers it with the nav or the search index.
4. Check the README and `docs/API.md` too when the change alters the pitch, the feature list, or a public API.
5. Follow the [Voice and tone](#voice-and-tone-all-copy-and-ui-text) rules below. They are enforced by review, not by a linter.

If a change genuinely has no user-visible surface (an internal refactor, a type-only change, a test), say so in the commit body rather than skipping this silently.

### Product metrics ship with the change (PostHog)

When you build a new feature or make a significant UI change, decide whether it needs product metrics before considering the work complete. If we cannot tell whether anyone uses the new surface, we cannot decide whether to invest in it or cut it.

Every product event lives in the typed taxonomy in `apps/terminal/src/lib/analytics-events.ts`: an event and its exact allowed properties are declared there, and call sites emit through `track()` — never `captureEvent()` directly — so an event cannot grow an undeclared property without touching that file. That file is also where the privacy review happens, so read its header rules before adding anything (no PII, no financial exposure, no instrument symbols on trade events; identifiers that name our product surface are fine).

The checklist:

1. Ask what question the new surface raises: "do people find it", "do they finish the flow", "which variant do they pick". If there is a question worth answering, there is an event worth adding. Not every change needs one — a metric nobody will look at is noise; say so in the commit body when you deliberately skip it.
2. Check whether an existing event already covers it before declaring a new one: `grep -n "track(" <files you touched>` and scan `AnalyticsEvents` for a matching name. Extending an existing event's properties beats a near-duplicate event.
3. Declare the event and its property type in `analytics-events.ts` with a doc comment saying what it measures, then call `track()` from the feature code. Follow the existing naming style (`snake_case`, funnel stages as `<thing>_<verb>`).
4. Remember analytics is opt-in and consent-gated — `track()` already no-ops without consent, so never add your own consent check or a second capture path around it.

These rules apply to every string a user reads, not just docs: terminal UI text (translation keys, toasts, dialogs, tooltips, empty states, error messages, onboarding), docs pages, marketing copy, READMEs, release notes, plugin store listings, CLI output. If a user sees it, it follows these rules.

**Never write an em dash (—) or en dash (–). No exceptions.** This is the single most reliable tell of AI-written prose and it undermines credibility with the developers we are courting. Restructure with commas, colons, parentheses, or separate sentences instead. Before committing, grep everything you touched:

```bash
grep -rn "—\|–" <files you changed>
```

Hyphens in compound words are fine. Arrows (→, ↔) and Δ in technical text are fine.

The rest of the voice:

- **No `**Word** — description` bullets.** Use `**Word.** Description` or a plain sentence.
- **Write like a developer who markets, not a model that summarizes.** Lead with what the thing does and why the reader cares. Sell with concrete specifics: counts, guarantees, real numbers, named behaviors. Skip filler adjectives.
- **Vary sentence length.** Keep some short. Uniform medium-length sentences read as generated.
- The approved reference for tone and structure is the pairlens-charts README (`Pairlens/fast-financial-charts`).

New terminal UI strings land in `apps/terminal/src/locales/en/translation.json` first: get the English right there, because the other sixteen locales are translated from it. Internal-only text (code comments, commit messages, this file) is exempt, but do not let internal habits leak into shipped strings.

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
| `VITE_REGISTRY_URL`   | Terminal | Plugin registry URL (auto-derived for local dev)                                                                             |
| `VITE_PAIRLENS_DISABLED_FAMILIES` | Terminal | Build-time, comma-separated `PluginFamilyId` list this deployment does not ship (e.g. `predictions,cex-futures,equities`). Unknown ids and the `required` families (`core`, `intelligence`) are warned about and ignored. Unset = every family enabled |
| `TERMINAL_PORT`       | Terminal | Dev server port override (worktree-derived by default)                                                                      |

Production **desktop release builds** must set `VITE_APP_SERVER_URL=https://api.pairlens.finance` in the environment of `tauri build` (the dev-time cloud fallback lives in dev scripts only — a bare production build defaults to standalone).

Server-side variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_GATEWAY_API_KEY`, `CMC_API_KEY`, ...) belong to the App Server and are not used in this repo.

## Key Patterns

### Plugin System

Capability-based plugin resolution in `packages/plugin-system/`. Plugins declare capabilities (market-data:candles, market-data:ticker, market-data:orderbook, market-data:trades, market-data:history, trading:orders, ai:inference, theme:override, etc.) via manifests. The `PluginResolver` finds the best plugin for a requested capability.

The terminal integrates via `PairlensProvider` (`src/lib/pairlens-provider.tsx`) for plugin lifecycle, and `MarketDataProvider` (`src/lib/market-data-provider.tsx`) for market data streaming. Market connector plugins connect directly to exchange WebSockets — no intermediate server. Candle streaming uses `pluginManager.subscribe('market-data:candles', ...)`.

**Capability IDs** (source of truth: `packages/shared/src/plugin-types.ts`): `market-data:discovery`, `market-data:discovery:search`, `market-data:candles`, `market-data:ticker`, `market-data:ticker-snapshot`, `market-data:orderbook`, `market-data:trades`, `market-data:history`, `market-data:symbol-logo`, `market-data:events`, `market-data:pool-stats`, `market-data:session`, `market-data:funding`, `market-data:liquidations`, `market-data:bridge`, `ai:inference`, `ai:web-search`, `rpc:solana`, `trading:orders`, `trading:balances`, `trading:positions`, `trading:bridge`, `workflow:step-types`, `theme:override`, `chart:indicator` (plus `notification:channel`, defined in the type but with no bundled provider yet; `workspace-store:catalog` is served by the bundled `pairlens-community` store plugin). Note: there is no `ai:context` or `ai:search` — AI capabilities are exactly `ai:inference` and `ai:web-search`; chat vs research is a runtime `purpose` selector on `ai:inference`, not a capability. The community tier denies `trading:*` (bridge execution included) and `rpc:solana` — the denylist lives in `apps/registry/src/community.ts`.

Every official manifest also carries a `metadata.family` stamp; see "Plugin families" under Bundled plugins for what a family does and does not affect.

### Custom Python Indicators

Users write chart indicators in **Python** (Pine-Script-like, but real Python with pip dependencies), authored in the `/indicators` workbench (left-nav entry; CodeMirror editor + live preview). Execution is local-only: **Pyodide (CPython→WASM) in a dedicated Web Worker** (`apps/terminal/src/lib/python/` — runtime host, worker, RPC protocol, and the `pairlens` Python SDK in `pairlens_sdk.py`). Pyodide core assets are self-hosted from `public/_pyodide/` (staged from node_modules by a Vite plugin, gitignored); compiled wheels (numpy…) come from jsDelivr and pure-Python wheels from PyPI via micropip (hosts in the desktop CSP baseline). Candles cross the worker boundary as transferable Float64Arrays.

A script exports `meta = indicator(title=..., pane='overlay'|'sub', inputs=[...], series=[...])` plus `compute(ctx)` returning per-series arrays; the extracted `CustomIndicatorMeta` (`packages/shared/src/plugin-types.ts`) drives the chart picker entry, params/settings UI, and the generic multi-series presenter in `@pairlens/fast-financial-charts`. Distribution rides the plugin system via the **`chart:indicator`** capability: the user's own scripts are served by the bootstrap `user-indicators` plugin (backed by the `pairlens:indicator-scripts` store), any script exports from the workbench as a standalone sandbox-safe plugin zip, and installed plugins contribute indicators through the same capability (collected in `apps/terminal/src/lib/indicators/custom-indicator-registry.ts`). In the chart engine, `custom:*` indicator types compute asynchronously on the main thread via registered `IndicatorDefinition`s; Python runs on bar close / param change (1s-throttled forming-bar refresh, cached otherwise).

### The AI Assistant

**One assistant for the whole terminal, and the terminal owns the agentic loop — every bit of it is client-side.** It replaced four separate chats (the `copilot` pane, the `research` pane, and the builder rails on indicators/bots/workflows/notifications), which is why those panes and `lib/copilot-brain.ts`, `lib/plugin-chat-transport.ts` and `lib/assistant/*-brain.ts` no longer exist.

- **Where it lives.** `components/assistant-dock/` (orb button, chat window, conversation, research + approval cards) and `lib/assistant-core/` (registry, brain, transport, tools). Mounted in `routes/_terminal.tsx` as a sibling of the mobile/desktop branch, so it survives every navigation and the shell swap. The window is **always mounted** and only animates visibility: minimizing must not kill a run in flight. Toggle is `Mod+J`. Phones render no dock (no room); their Assistant tab mounts the same `AssistantConversation`.
- **The surface registry is the spine** (`lib/assistant-core/surface-registry.ts`). Chart, layout and workbench state live BELOW `<Outlet />`; the dock lives above it. Mounted surfaces register live closures via `useAssistantSurface` (`getContext`, `getSuggestion`, `getActions`, `getPriority`) and the assistant reads the union each turn. That is what makes the orb's line contextual, and it is the only way a pane can publish an action that cannot be global: see `lib/layout/layout-assistant-surface.tsx` (`add_pane` / `remove_pane`). Everything is read through live closures, so the registry version only moves on mount/unmount: a surface that changes what it publishes while staying mounted must bump `revision`.
- **Handles cross the Outlet through the ServiceRegistry**, not the surface registry: `chart-actions` (`lib/assistant-core/chart-service.ts`, registered by both `components/terminal/chart-pane.tsx` and `mobile/chart/mobile-chart-service.tsx`) and `indicator-workbench`. A registered handle must be a `useMemo(..., [])` of getters over a ref, or it re-registers and notifies every listener on each render.
- **Tools** (`lib/assistant-core/tools.ts`) are the union of the four old sets plus `navigate_to`, `get_screen` and `deep_research`. AI SDK v6 `prepareStep` can narrow `activeTools` but cannot swap the tool map, so everything is declared up front and `activeToolsFor` hides the 27 chart tools when no chart is mounted (they come back the step after the model navigates). Reads run in the transport; trades return proposals that render as confirm cards; `ask_user` and `needsApproval` actions ship without an `execute` so the run parks until the user answers.
- **Conversations are many, local-first, and synced only on request.** Threads live in `stores/assistant-conversations-store.ts`: a small index key plus one key per thread, holding whole `UIMessage`s so tool parts, research cards and order proposals survive a reload. The chat is keyed on the active thread id, and `AssistantConversationInner` holds its own `threadId` so a switch can stop and flush the outgoing run BEFORE the SDK rebuilds its `Chat` around another thread. Titles come from `lib/assistant-core/conversation-title.ts`: the first message names the row instantly, the model is asked in the background for a better one.
- **`assistant` is the one opt-in sync domain.** `SyncDomain.defaultEnabled` is absent (= true) everywhere else and `false` here, which gives the switch a third state: no entry at all means "not asked", and that is the only state the rail's `AssistantSyncBanner` renders in. Either answer writes an explicit boolean and retires the banner for good; Settings → Cloud Sync owns it afterwards. The old lossy path is gone for good (`api.getAiMessages`/`saveAiMessage`/`clearAiMessages`, the `copilot` domain, the adapter's `getAIMessages`/`appendAIMessage`): the replacement is a bulk collection at `GET`/`PUT /api/assistant/conversations` carrying whole messages, typed as `SyncedConversation` in `packages/shared/src/persistence-types.ts` and **mirrored into the App Server repo**. The store publishes ONE aggregate key (`assistant.conversations`); the coordinator assembles index + threads at flush time under size caps (25 threads, 250k chars each, 4 MB total) and merges per conversation with `mergeCollections`, never deleting a local thread the server has not seen.
- **Unchanged:** the App Server is still only an OpenAI-compatible inference proxy (`/api/ai/v1/chat/completions`), and AI provider plugins (Groq/OpenAI/Anthropic/OpenRouter and the bundled `pairlens-intelligence` fallback) expose `getLanguageModel()`.

### Board and page chrome

A board is three surfaces and one line. The ground is `--background`
(`layout-shell.tsx`'s `BOARD`, inset 10px from three edges and none from the top, so the columns
hang off the bar above them); a column is one `--card` surface, 14px radius, 12px padding
(`layout-column.tsx`'s `COLUMN_SURFACE`); the third step is wells (`bg-muted/40`, no border) and
it is reserved for inputs and trade tickets. Panes draw NO card of their own. The only line on
the board is the hairline between two stacked panes: `--pane-rule`, a 45% mix of `--border`
declared in `apps/terminal/src/styles.css`, drawn by `RowHandle` (which IS the resize target) or
by `PaneRule` where there is nothing to resize. Columns are separated by ground showing through,
never by a rule: a vertical rule beside a horizontal one is what made the old board read as a
spreadsheet.

Every pane header is drawn by the SHELL, not by the pane (`layout-pane-wrapper.tsx`): a 20px row
carrying the title at 12.5px/500, a portal slot for one trailing metric (`pane-header-slot.tsx`,
`<PaneHeaderMetric>`), a close button that is laid out at rest but invisible, and a drag grip at
28% opacity that rises to 100% when the pointer enters ANYWHERE in the pane. The reveal is CSS
(`group/pane`), not a `hoveredPaneId` on the board: a state change there would re-render every
pane each time the pointer crossed a seam. Nothing is inserted or removed on hover, so the header
never twitches. A tabbed cell uses the same row, with the tabs as the title (`layout-tab-group.tsx`);
its grip registers `${paneId}:grip` because the tab already claims `paneId` in dnd-kit's registry,
and every drag handler reads `active.data.current.paneId` rather than the draggable's id.

What that costs a pane author: content carries no horizontal padding (the column's 12px is the
inset, so rows bleed to the pane edge on purpose), no rule under a column header or above a
footer, no `bg-background` on a sticky thead (it sits on `--card` now), and no in-pane title
repeating the pane's own name. `layout/__tests__/board-chrome.test.ts` reads the source for that
sticky-thead trap across every directory that renders inside a column, the four page directories
included, with an explicit allowlist for dialog and sheet content (a dialog IS painted from the
ground). The shared voice lives in `components/panes/pane-primitives.tsx`
(`Th`, `PaneColumnHeader`, `PaneFootnote`, and the `PANE_COLUMN_HEADER` / `PANE_FOOTNOTE` /
`PANE_TABLE_BODY` class strings).

The shell has one frame, on every route (`routes/_terminal.tsx`): no inset card (no margin, no
radius, no shadow) and the rail painted `--background` so it dissolves into the content beside
it. Every page in the frame draws its own surfaces already, so a card around those was a nesting
level that only added an edge, and a rail that changed value between a board and a settings page
repainted the left edge of the window on every navigation. `SidebarInset` is gone from every
route with it: it still carried `m-2 rounded-xl shadow-sm` behind a `peer-data-[variant=inset]`
selector the redesign had already broken, so the geometry was dead code waiting to come back.

**The rail** speaks the chip vocabulary too (`components/chrome/rail-chrome.ts`). An item is 36px
at 10px radius; at rest it is `--muted-foreground` on nothing, and the current section is a
`--card` chip with the glyph at full strength. It used to be `--sidebar-accent`, two steps
brighter than a workspace column, which made the loudest fill on screen the button naming the page
you were already looking at. Group marks are `--pane-rule` at 24px across the middle of the rail,
not `--sidebar-border` edge to edge. Note the separator writes its width under `data-horizontal:`,
because that is where the primitive puts its own `w-full` and tailwind-merge will not resolve a
bare utility against a variant-prefixed one.

**Pages are boards** (`components/chrome/page-chrome.ts`). Bots, Indicators, Notifications and
Workflows were full-bleed sheets carved up by `border-r` down the master list and `border-b` under
every header, which is the language 3A deleted. They are columns on ground now, with the board's
own numbers: `PAGE_GROUND` is the same `px-2.5 pb-2.5` inset, `PAGE_COLUMN` the same
`rounded-[14px] bg-card p-3`, `PAGE_COLUMN_FLUSH` the same without the padding for a list or a
canvas that reaches its own edges, and `PAGE_RULE` the same hairline. A master-detail page is one
`MASTER_DETAIL_LIST_CLASS` column (240px) plus a flush column for the detail; the builders add a
third for the step palette, because a vertical rule beside the commit bar's horizontal one is the
spreadsheet reading all over again. The numbers are asserted against `layout-shell.tsx` and
`layout-column.tsx` by `components/chrome/__tests__/page-chrome.test.ts`, so changing the board's
inset and not the pages' fails rather than drifting quietly.

The two builder canvases are the one sanctioned well at page scale, and the one place the well
carries two alphas: `bg-muted/70 dark:bg-muted/40`, with xyflow's own background set transparent.
`--muted` sits above `--card` in dark and below it in light, so a single alpha cannot serve both.
At 40% the light well landed under two points of lightness from the card around it, which took
the canvas edge, the minimap and the zoom controls with it. The dot grids are token-driven in
both modes for the same reason: light used to fall through to xyflow's own cool grey. Painting the canvas `--card` was not an option, because the nodes
ARE `--card` objects and would have dissolved into their own ground. Nodes, edges and handles keep
their outlines: a step on a canvas is a real object, and its border is meaning rather than chrome.

The top bar speaks the same language (`components/chrome/header-chrome.ts`). Every control on it
is a `--card` chip at 10px radius with no border, and the workspace is the one chip carrying the
accent. Grouping is space, not rules: `HEADER_GROUP` holds related controls 7px apart and the bar
holds the groups 20px apart. There is deliberately no separator constant and no bottom rule on
the bar; what separates it from the board is the 10px of ground and the first column's card edge.
A row of outlined buttons over a board that draws no borders is what made the bar read as a
different product in the first place.

**The two storefronts unstack that bar** (`PageHeader floating` + `StoreCanvas` in
`components/store/store-shell.tsx`). A store opens on a 400px hero with its own light in it, and a
flat `--background` strip stacked on top of that artwork was the only thing on screen the
storefront's atmosphere never reached. So the content runs the full height of the frame, the
aurora with it, and the bar hovers over the top 44px with nothing behind it. The edge comes back
only when it is needed: past 4px of scroll a `--background` scrim fades in behind the bar and
blurs what passes under it, with the board's own 14px radius on its bottom corners. The two
offsets that used to be implied by the flex column are written down as `STORE_BAR_PAD` and
`STORE_BAR_OFFSET` and pinned to `HEADER_BAR`'s height by
`components/store/__tests__/store-chrome.test.ts`. Anything that overlays a store starts at
`STORE_BAR_OFFSET`, never `inset-0`: the product sheets stop at the bar's lower edge so search,
the tabs and the way out of the store stay reachable.

The chart is part of the same surface: `hooks/use-chart-theme.ts` takes a `ChartSurface` and
resolves the plot and axis background from the live token (via a 1x1 canvas, since the token is
`oklch()`) instead of the theme's own chart palette, so a WebGL plot never reads as a rectangle
inset into its column, in any of the 18 themes or either colour mode. Panes take the default
`'card'`, the workbench preview included now that it sits on a page column; the phone takes
`'palette'` and opts out entirely, because it paints its shell FROM the chart's colour rather
than the other way round.

### Terminal Routing

TanStack Router with file-based routing in `apps/terminal/src/routes/`. Route tree is auto-generated (`routeTree.gen.ts`). State management via TanStack Query. REST calls via `src/lib/api.ts`. Real-time data via plugin system.

Major surfaces: the `_terminal.tsx` layout group hosts `index`, `pair/$pair` (chart terminal), `accounts`, `notifications`, `indicators` (Python indicator workbench), `bots`, `plugins` (Plugin Store), `workspace-store` (Workspace Store), `workspace/$workspaceId`, and `workflows`; standalone routes are `onboarding.tsx` (full-page spotlight onboarding), `sign-in.tsx` and `checkout.success.tsx`.

Below 768px none of the `_terminal` children mount at all — the layout returns the mobile shell instead of `<Outlet />`, and the five mobile destinations are local state with the URL kept in step. Adding a route means deciding what the phone does with it: carry it as an overlay, or add it to `DESKTOP_ONLY_PREFIXES` in `mobile/use-mobile-route-sync.ts` so a shared link redirects with a toast instead of looking broken.

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

## Code intelligence (GitNexus)

The section below is auto-generated by `gitnexus analyze` — do not edit it by hand. A PostToolUse hook reindexes in the background after every commit and merge.

Its contents are pinned by the committed `.gitnexusrc`:

- `name: pairlens` — the index name. Without it the name is derived from the checkout's directory, so a reindex from a worktree renamed the repo for everyone and broke every `gitnexus://repo/<name>/…` read from the main checkout ([#1259](https://github.com/abhigyanpatwari/GitNexus/issues/1259), fixed upstream in 1.6.9).
- `noStats: true` — omits the symbol/edge counts, which changed on every commit and produced a meaningless diff.
- `allowDuplicateName: true` — required because the main checkout and every worktree all register under the same explicit name.

Net effect: a reindex from any checkout regenerates this block byte-for-byte, so it never shows up in `git status` unless GitNexus itself changed. **Requires gitnexus >= 1.6.9** (`npm i -g gitnexus`); older versions ignore `.gitnexusrc`. `.githooks/pre-commit` re-pins the name on the way in as a backstop for machines that are still behind.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pairlens**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pairlens/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pairlens/clusters` | All functional areas |
| `gitnexus://repo/pairlens/processes` | All execution flows |
| `gitnexus://repo/pairlens/process/{name}` | Step-by-step execution trace |

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
