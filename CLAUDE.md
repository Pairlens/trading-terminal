# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pairlens

AI-native crypto spot trading terminal. **Desktop-first, but the browser is a shipped surface** — the primary distribution is a Tauri desktop app (`apps/desktop/`), and a hosted web terminal runs at `terminal.pairlens.finance` (the marketing site's main CTA). The browser build is a real product, not a dev harness; what it cannot do is bounded and explicit. Six connectors (Coinbase, Gate, KuCoin, MEXC, Bitfinex, Kalshi) serve REST without CORS headers, so they declare `requiresDesktop` and refuse in a browser with a typed `PlatformRestrictedError` rather than presenting a dead chart. Desktop additionally gets the OS keychain, background bots, wake-blocking and native windows. Deterministic strategies generate signals, an AI co-pilot provides contextual analysis (APPROVE/BLOCK/WATCH), and user-configurable risk guardrails are enforced at the infrastructure level. The AI augments decisions but never overrides risk limits.

**Phones get the Mobile Trading Terminal.** Below 768px the same URL boots a chart-centric five-tab surface — Watchlist · Trade · Chart · Co-pilot · Discover — built from the same codebase, under `apps/terminal/src/mobile/`. It is a trading surface, not a shrunken dashboard: order entry with the same guarded order path, a full order book, drawings, the co-pilot, and the same connect-an-account flow. Architecture in [Mobile Terminal](#mobile-terminal).

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
  Hosted web terminal (terminal.pairlens.finance, Vercel) — 11 of 17 venues
  Mobile terminal — the same URL below 768px (apps/terminal/src/mobile/)
  CLI (bun apps/cli/src/index.ts)
  pairlens.finance (marketing, Vercel)
```

**App Server** (optional; the backend whose source isn't published yet — see "What is Pairlens" above): the REST API the terminal talks to when signed in — auth (BetterAuth email OTP), remote persistence, AI proxy, and external-data endpoints (news, top coins, symbol logos, ...). Reached via `apps/terminal/src/lib/api.ts` (`VITE_APP_SERVER_URL`, default `http://localhost:4046`; production `https://api.pairlens.finance`). It never stores exchange credentials and never touches exchange market data or trading — AI routes receive market data from the Terminal (pushed in request body). The one narrow, deliberate exception: its instruments-index sweeper fetches public, unauthenticated **listings metadata** (which pairs each venue lists) via stock ccxt, compiled into the discovery snapshot the terminal downloads at idle — never prices, books, candles or trades, never with credentials, never on a user's behalf.

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

Exchange WS → Market connector plugin → CandleBuffer → consumers compute signals **on demand** with `@pairlens/strategy-engine` (pure functions over the candle buffer). Consumers: the chart pane's Signals strip (`scanSignals` in `apps/terminal/src/hooks/use-candle-stream.ts` — historical scan on snapshot + bar close), copilot market tools (`apps/terminal/src/lib/copilot/market-tools.ts`), the research panel, and the CLI `signals` command. Connectors do NOT push signals on candle close.

### Market Connector Plugins

Market connectors are standard plugins that implement the `MarketAdapter` interface from `@pairlens/market-engine`. Each connector connects directly to exchange WebSocket and REST APIs from the client process (terminal or CLI). No intermediate server.

**Bundled plugins** (available on fresh install):

- **CEX** (14, all read + trade via the **CCXT bridge**: `createCcxtConnectorPlugin` in `packages/plugins/src/ccxt-connector/` builds a `CexConnectorSpec` per venue and delegates to the `cex-connector` shell in `packages/plugins/src/cex-connector/` — neither is a plugin itself): OKX (regional routing US/EU/global + per-credential account entity), Binance, ByBit (region-gated, blocked in US), Bitvavo (region-gated, EU), MEXC (region-gated), KuCoin, Gate, Coinbase, Bitget, Kraken, HTX, Crypto.com, Bitfinex, Upbit (no trigger orders). Venue protocol work (WS channels, signing, order mapping) is ccxt's; the bridge owns everything ccxt lacks in a browser — reconnect pacing, inbound-silence liveness, wake recovery, the markets pipeline, regional/geo routing, and per-venue ccxt bug patches (see `ccxt-connector/venues/*.ts`). See "CCXT bridge" below.
- **Broker**: Alpaca (US equities, requires API keys; standalone connector, not the CEX factory)
- **DEX**: Jupiter (Solana), EVM DEX connector — one factory that emits 5 chain plugins (Ethereum, Base, Arbitrum, BSC, Polygon) with swaps via KyberSwap routing
- **Predictions** (2, event contracts): Kalshi (`requiresDesktop` — its API 403s any foreign `Origin`; API Key ID + RSA PEM, paper via ccxt `urls.test` demo env, limit-only, 1m/1h/1d) and Polymarket (browser-capable, wallet-signed EOA like the EVM DEX connectors, live-only, market + limit, 1m/5m/1h/1d, refuses US at trade time). Both ride the **prediction runtime** in `packages/plugins/src/prediction-connector/`, which hosts ccxt `PredictionExchange` venues and deep-imports `ccxt/js/src/prediction/<id>.js`. Instruments are outcomes priced 0..1 (UI shows cents); each outcome is its own instrument, so `OrderParams` is unchanged and sizes are contract counts.
- **DEX data providers** (read-only): GeckoTerminal (primary), DexPaprika
- **AI inference** (bring-your-own-key): Groq, OpenAI, Anthropic, OpenRouter
- **AI web search** (bring-your-own-key): Tavily, Exa
- **Core**: `pairlens-core` (instrument discovery, panels, workflow step types), `pairlens-intelligence` (fallback-only AI inference/search + discovery + symbol logos), `pairlens-predictions` (panels only, zero capabilities: the `events` browser and the `prediction-positions` pane, kept out of pairlens-core so a deployment that drops the `predictions` family drops them too). `basic-symbols` is deprecated (absorbed into pairlens-core, kept for registry back-compat).
- **Themes**: 18 `theme:override` plugins

**Plugin families.** Every official manifest stamps `metadata.family` with a `PluginFamilyId` from `packages/shared/src/plugin-families.ts` (`core`, `intelligence`, `themes`, `ai-byok`, `cex-spot`, `dex`, `equities`, `predictions`). A family is presentation plus policy only: plugin ids, capabilities and persisted state are unaffected. It buys two things. A deployment can drop a whole asset class with `VITE_PAIRLENS_DISABLED_FAMILIES` (excluded families are never seeded into the ledger, never installed at boot even with a stale ledger row, and never listed in the Plugin Store; `core` and `intelligence` are `required` and refuse exclusion). And the Plugin Store's Installed tab groups by family with an enable/disable-all switch per non-required family, which just drives the existing per-plugin ledger toggle. The filter only ever touches plugins whose ledger source is `bootstrap`, so a user's own plugins are never family-filtered. `pluginFamilyOf(manifest)` resolves the explicit stamp first, then falls back to capability shape; null means unfamilied, which is never filtered.

**Third-party connectors** can be installed from the Plugin Store at runtime. Any developer can build a connector by implementing `MarketAdapter` and publishing to the registry.

**Community plugins** (`apps/registry/community/`) are published by PR: source lives in the repo, CI validates it (schema, capability policy — no `trading:*` — namespace ownership, build + size cap), and the registry builds + signs it at startup with a separate community key (`REGISTRY_COMMUNITY_SIGNING_KEY`, dev fallback committed at `apps/registry/keys/dev-community.key`). Terminals pin community keys as a distinct tier (`publisherKeyTier` in `packages/shared/src/publisher-keys.ts`) and clamp anything community-signed to the sandbox — the full-trust grant is never offered. See `apps/registry/community/README.md`.

### CCXT bridge

The 14 CEX connectors ride on **ccxt@4.5.71, pinned in `packages/plugins` only** (the 2 prediction venues ride the same pinned ccxt but a **separate runtime**, `prediction-connector/` — the spot bridge assumes symbols, base/quote and spot markets throughout, so do not try to host a `PredictionExchange` on it) and patched via bun's patch mechanism (`patches/ccxt@4.5.71.patch`). The patch has exactly three items: `./js/src/*.js` subpath exports (the key must carry `.js` — bun is lenient, Vite is strict), `fflate` added to ccxt's deps (isolated-linker resolution for browser WS gunzip), and an `onMessage` fix normalizing browser `ArrayBuffer` frames to `Uint8Array` (ccxt assumes Node Buffers; without it HTX is completely dead in a browser and Upbit/MEXC binary frames parse wrong). Rules that keep it working:

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
- **App Server** (the private backend) is the only service that talks to PostgreSQL. It owns auth (BetterAuth), persistence, and AI features. It never touches exchange market data or trading — the Terminal pushes market data in AI request bodies; the sole exception is the server's instruments-index sweeper, which fetches public unauthenticated listings metadata (see the App Server overview above). The Terminal reaches it via REST (`apps/terminal/src/lib/api.ts`, `VITE_APP_SERVER_URL`, default `http://localhost:4046`).
- **`packages/shared`** holds the client/server API contract types (`persistence-types`, `instrument-types`, `registry-types`, `affiliates`, ...). The App Server repo carries a mirrored copy — changes to REST payload shapes must be applied in both repos. The Drizzle DB schema lives only in the App Server repo.
- **Credentials are local-only.** Exchange API keys and wallet secrets must never be sent to or stored on the App Server. The Tauri desktop app stores them in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) via the `keychain_*` commands in `apps/desktop/src-tauri`; browsers store them as vault ciphertext in localStorage (see `apps/terminal/src/lib/keychain.ts`). Connector plugins receive credentials at runtime for order routing.
- **Mobile is a one-way dependency.** `src/mobile/` imports into the app freely; the app does not import from `src/mobile/` except at the three seams listed in [Mobile Terminal](#mobile-terminal). A shared helper both shells need belongs outside `src/mobile/` (`src/hooks/`, `src/lib/`), never inside it.
- **Strategy engine** (`packages/strategy-engine/`) is pure TypeScript math — no I/O, no exchange connections. Indicators: EMA, ATR, extremes, volume-MA. Strategies: breakout, EMA pullback, mean reversion. Regime detection in `src/regime.ts`. Consumed on demand by the terminal (copilot tools, research panel) and the CLI — not by connectors.

### Data Ownership

| Data                               | Lives in                                                  | Reason                                             |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Candle history (500-candle buffer) | CandleBuffer (in connector plugin)                        | Fast access for signal computation + streaming     |
| Recent signals                     | Computed on candle close (in plugin)                      | Ephemeral, computed by strategy-engine             |
| Order book state                   | Local book maps (in connector plugin)                     | Maintained from incremental WS updates             |
| User state, trades, AI chat        | Local persistence by default; PostgreSQL via App Server when signed in | Durable remote persistence is opt-in |
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

### Voice and tone (all copy and UI text)

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
| `VITE_PAIRLENS_DISABLED_FAMILIES` | Terminal | Build-time, comma-separated `PluginFamilyId` list this deployment does not ship (e.g. `predictions,equities`). Unknown ids and the `required` families (`core`, `intelligence`) are warned about and ignored. Unset = every family enabled |
| `TERMINAL_PORT`       | Terminal | Dev server port override (worktree-derived by default)                                                                      |

Production **desktop release builds** must set `VITE_APP_SERVER_URL=https://api.pairlens.finance` in the environment of `tauri build` (the dev-time cloud fallback lives in dev scripts only — a bare production build defaults to standalone).

Server-side variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_GATEWAY_API_KEY`, `CMC_API_KEY`, ...) belong to the App Server and are not used in this repo.

## Key Patterns

### Plugin System

Capability-based plugin resolution in `packages/plugin-system/`. Plugins declare capabilities (market-data:candles, market-data:ticker, market-data:orderbook, market-data:trades, market-data:history, trading:orders, ai:inference, theme:override, etc.) via manifests. The `PluginResolver` finds the best plugin for a requested capability.

The terminal integrates via `PairlensProvider` (`src/lib/pairlens-provider.tsx`) for plugin lifecycle, and `MarketDataProvider` (`src/lib/market-data-provider.tsx`) for market data streaming. Market connector plugins connect directly to exchange WebSockets — no intermediate server. Candle streaming uses `pluginManager.subscribe('market-data:candles', ...)`.

**Capability IDs** (source of truth: `packages/shared/src/plugin-types.ts`): `market-data:discovery`, `market-data:discovery:search`, `market-data:candles`, `market-data:ticker`, `market-data:ticker-snapshot`, `market-data:orderbook`, `market-data:trades`, `market-data:history`, `market-data:symbol-logo`, `market-data:events`, `ai:inference`, `ai:web-search`, `trading:orders`, `trading:balances`, `trading:positions`, `workflow:step-types`, `theme:override`, `chart:indicator` (plus `notification:channel` and `workspace-store:catalog`, defined in the type but with no bundled provider yet). Note: there is no `ai:context` or `ai:search` — AI capabilities are exactly `ai:inference` and `ai:web-search`; chat vs research is a runtime `purpose` selector on `ai:inference`, not a capability. `trading:positions` is under `trading:*`, so it is banned in the community tier like the rest of that namespace.

Every official manifest also carries a `metadata.family` stamp; see "Plugin families" under Bundled plugins for what a family does and does not affect.

### Custom Python Indicators

Users write chart indicators in **Python** (Pine-Script-like, but real Python with pip dependencies), authored in the `/indicators` workbench (left-nav entry; CodeMirror editor + live preview). Execution is local-only: **Pyodide (CPython→WASM) in a dedicated Web Worker** (`apps/terminal/src/lib/python/` — runtime host, worker, RPC protocol, and the `pairlens` Python SDK in `pairlens_sdk.py`). Pyodide core assets are self-hosted from `public/_pyodide/` (staged from node_modules by a Vite plugin, gitignored); compiled wheels (numpy…) come from jsDelivr and pure-Python wheels from PyPI via micropip (hosts in the desktop CSP baseline). Candles cross the worker boundary as transferable Float64Arrays.

A script exports `meta = indicator(title=..., pane='overlay'|'sub', inputs=[...], series=[...])` plus `compute(ctx)` returning per-series arrays; the extracted `CustomIndicatorMeta` (`packages/shared/src/plugin-types.ts`) drives the chart picker entry, params/settings UI, and the generic multi-series presenter in `@pairlens/fast-financial-charts`. Distribution rides the plugin system via the **`chart:indicator`** capability: the user's own scripts are served by the bootstrap `user-indicators` plugin (backed by the `pairlens:indicator-scripts` store), any script exports from the workbench as a standalone sandbox-safe plugin zip, and installed plugins contribute indicators through the same capability (collected in `apps/terminal/src/lib/indicators/custom-indicator-registry.ts`). In the chart engine, `custom:*` indicator types compute asynchronously on the main thread via registered `IndicatorDefinition`s; Python runs on bar close / param change (1s-throttled forming-bar refresh, cached otherwise).

### AI Copilot Architecture

**The terminal owns the agentic loop — all copilot logic is client-side.** `apps/terminal/src/lib/copilot-brain.ts` runs the loop; ~60 tools live under `apps/terminal/src/lib/copilot/` (chart control, market/context/portfolio reads, workspace actions, gated trading proposals). Data tools execute in the transport on the client; trades surface as confirm-card proposals through the guarded order path. The App Server is only an OpenAI-compatible inference proxy (`/api/ai/v1/chat/completions`). AI provider plugins (Groq/OpenAI/Anthropic/OpenRouter and the bundled `pairlens-intelligence` fallback) expose `getLanguageModel()`.

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
