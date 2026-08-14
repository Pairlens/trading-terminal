---
title: Glossary
description: Every term Pairlens uses with a specific meaning, from capabilities and connectors to guardrails, panes, protectors, and the three kinds of paper trading.
group: reference
order: 1
eyebrow: Reference
updated: AUG 2026
readTime: 5 min read
---

Terms that mean something particular in Pairlens, and the market terms the docs
assume. Alphabetical.

## Pairlens terms

**Account.** A set of exchange, broker, or wallet credentials you have
connected. Stored on this device only. See
[connect an exchange](/docs/connect-an-exchange).

**App Server.** The optional backend behind sign-in, cross-device sync, the AI
proxy, and cloud panels. The terminal is fully functional without one. It never
sees exchange credentials and is never in the order path.

**Bot.** A Python strategy deployed to a market, evaluating on closed candles
and acting on its own. Not an LLM. See [bots](/docs/bots).

**Capability.** What a plugin declares it provides, such as
`market-data:candles`, `trading:orders`, `ai:inference`, or `theme:override`.
The resolver picks the best plugin for each requested capability at runtime.

**Connector.** A plugin that talks to a venue: streams its data and routes its
orders, directly from your machine. See [connectors](/docs/connectors).

**Co-pilot.** The in-terminal AI chat. Its loop runs client-side over 63 tools.
It can propose trades. It cannot execute them unattended. See
[the AI co-pilot](/docs/ai-copilot).

**Deep search.** The server-side third wave of instrument search, which sends
your typed query to Pairlens Cloud. Consent-gated in Settings → Privacy. See
[market discovery](/docs/market-discovery).

**Guardrail.** A risk limit enforced in the order path itself: loss caps,
position caps, trade caps, and the action taken when one is breached. Neither
the AI nor a bot can raise one. See [risk guardrails](/docs/risk-guardrails).

**Hard lock.** Sealing the credential vault, which stops live automation.
Distinct from the terminal lock, which only covers the screen. See
[settings](/docs/settings#credential-vault).

**Instruments index.** The searchable catalogue of tradeable instruments,
assembled from a curated catalog, cached venue tables, and an optional cloud
snapshot of listings metadata.

**Pane / panel.** A panel is a kind of view (Chart, Order Book, AI Lens). A pane
is one instance of it in a workspace layout. Some panels are singletons: one per
workspace. See [panels](/docs/panels).

**Paper trading.** Three different things depending on where you are: a venue's
own demo environment, a bot's paper mode, or a co-pilot paper trade. They
simulate different amounts of reality. See [paper trading](/docs/paper-trading).

**Plugin.** The unit of extension. Connectors, AI providers, panels, indicators,
and themes are all plugins. Third-party plugins run sandboxed and Ed25519
signed. See [the Plugin SDK](/docs/plugin-sdk).

**Protector.** A way to unlock the credential vault: a vault password, a
passkey, or Touch ID on macOS desktop. Each one wraps its own copy of the vault's
data key. See [settings](/docs/settings#credential-vault).

**Proposal.** An order the co-pilot has prepared but not placed. It renders as a
confirm card and goes through the normal guarded order path once you approve it.

**Sandbox.** The isolated worker a third-party plugin runs in, with an explicit
network allowlist. Community-signed plugins are always clamped to it.

**Signal.** The output of the deterministic strategy engine: breakout, EMA
pullback, or mean reversion, plus a regime. Computed on demand from the candle
buffer, never pushed by a connector. See
[strategies and backtests](/docs/strategies-and-backtests).

**Standalone.** Running with no App Server at all: no auth, no sync, no cloud
panels, local persistence only. Everything market-related still works. See
[self-hosting](/docs/self-hosting).

**Terminal lock.** A password prompt in front of the screen. It stops the person
at your desk. It does not stop armed bots, and it is not the vault.

**Vault.** The browser's encrypted credential store: AES-256-GCM ciphertext in
local storage under one data key, wrapped by each protector you enrol. On
desktop, credentials live in the OS keychain instead. See
[the security model](/docs/security-model).

**Venue.** An exchange, broker, or on-chain aggregator. Fifteen ship in the box.

**Workspace.** A saved arrangement of panes, with variables that bind them to a
pair, venue, and account. See [workspaces](/docs/workspaces).

## Market terms

**Aggressor.** The side that crossed the spread to get filled. What the
[tape](/docs/time-and-sales) reports, and the direction that moved price.

**Ask / offer.** The lowest price a seller will accept. The right side of the
book.

**Bid.** The highest price a buyer will pay. The left side of the book.

**Depth.** How much size rests between the touch and a given price. What the
[depth curve](/docs/depth-and-liquidity) plots.

**Fill.** A completed execution. Partial fills are normal on limit orders.

**Grouping / tick.** The price increment the [order book](/docs/order-book)
buckets levels into. The venue's own tick is the floor.

**Imbalance.** The ratio of resting bid depth to ask depth. Suggestive, and
easily manufactured, because resting orders can be cancelled.

**Limit order.** Executes only at your price or better. May not fill.

**Liquidity.** How much can trade without moving price. Read it from depth and
from the spread, not from volume alone.

**Maker / taker.** The maker rests an order; the taker crosses the spread to hit
it. Most venues charge them differently.

**Market order.** Executes immediately against whatever is resting. Fills
guaranteed, price is not.

**Mid.** The midpoint between best bid and best ask.

**Notional.** Price times size: the money a level or a print represents. Usually
the more useful reading of the two.

**Regime.** Whether the market is trending or ranging, as classified by the
strategy engine. Strategies that work in one fail in the other.

**Slippage.** The gap between the price you expected and the price you got. A
function of depth and order size.

**Spot.** Buying the asset itself, settled immediately. Pairlens trades spot.
There are no margin positions, which is why the Positions tab is empty by
design.

**Spread.** Best ask minus best bid. As a percentage, the cost of changing your
mind, and the fastest comparison of liquidity across venues.

**Tick size.** The smallest price increment a venue accepts.

**Touch.** The best bid and best ask: the top of the book.

**Wall.** A level holding much more size than its neighbours. Real until it is
cancelled, which is why the [liquidity heatmap](/docs/depth-and-liquidity) beats
a single snapshot.
