---
title: Glossary
description: Every term Pairlens uses with a specific meaning, from capabilities and connectors to guardrails, panes, protectors, and the three kinds of paper trading.
group: reference
order: 1
eyebrow: Reference
updated: 17 AUG 2026
readTime: 6 min read
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

**Assistant.** The one AI chat in the terminal, docked at the bottom right or in
the left nav rail, your choice, and mounted above every page. Its loop runs client-side over 105 tools. It can propose
trades. It cannot execute them unattended. See
[the AI assistant](/docs/ai-copilot).

**Bot.** A Python strategy deployed to a market, evaluating on closed candles
and acting on its own. Not an LLM. See [bots](/docs/bots).

**Bridge.** Moving one asset from one chain to another. Pairlens quotes and
tracks transfers between the five EVM chains and Solana through the LI.FI
aggregator, signed with the wallets you already connected. A Solana send is
simulated against the chain before your key is fetched. See
[DEX and wallets](/docs/dex-trading#bridging).

**Capability.** What a plugin declares it provides, such as
`market-data:candles`, `trading:orders`, `ai:inference`, or `theme:override`.
The resolver picks the best plugin for each requested capability at runtime.

**Connector.** A plugin that talks to a venue: streams its data and routes its
orders, directly from your machine. See [connectors](/docs/connectors).

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

**Pane / panel.** A panel is a kind of view (Chart, Order Book, Watchlist). A pane
is one instance of it in a workspace layout. Some panels are singletons: one per
workspace. See [panels](/docs/panels).

**Paper trading.** Three different things depending on where you are: a venue's
own demo environment, a bot's paper mode, or an assistant paper trade. They
simulate different amounts of reality. See [paper trading](/docs/paper-trading).

**Plugin.** The unit of extension. Connectors, AI providers, panels, indicators,
and themes are all plugins. Third-party plugins run sandboxed and Ed25519
signed. See [the Plugin SDK](/docs/plugin-sdk).

**Protector.** A way to unlock the credential vault: a vault password, a
passkey, or Touch ID on macOS desktop. Each one wraps its own copy of the vault's
data key. See [settings](/docs/settings#credential-vault).

**Proposal.** An order the assistant has prepared but not placed. It renders as a
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

**Surface.** Anything mounted that tells the assistant what it is showing, and
optionally publishes actions only it can perform. A workspace board publishes
`add_pane` and `remove_pane`; leave the board and they withdraw. See
[the AI assistant](/docs/ai-copilot).

**Terminal lock.** A password prompt in front of the screen. It stops the person
at your desk. It does not stop armed bots, and it is not the vault.

**Vault.** The browser's encrypted credential store: AES-256-GCM ciphertext in
local storage under one data key, wrapped by each protector you enrol. On
desktop, credentials live in the OS keychain instead. See
[the security model](/docs/security-model).

**Venue.** An exchange, broker, event exchange, or on-chain aggregator. Twenty
ship in the box, plus the on-chain connectors.

**Workspace.** A saved arrangement of panes, with variables that bind them to a
pair, venue, and account. See [workspaces](/docs/workspaces).

## Market terms

**Aggressor.** The side that crossed the spread to get filled. What the
[tape](/docs/time-and-sales) reports, and the direction that moved price.

**Ask / offer.** The lowest price a seller will accept. The right side of the
book.

**Basis.** The gap between a [perpetual](/docs/cex-futures) and the spot index
it tracks. Pairlens quotes it in basis points and annualised, so carry reads as
a yield rather than as a price difference.

**Bid.** The highest price a buyer will pay. The left side of the book.

**Depth.** How much size rests between the touch and a given price. What the
[depth curve](/docs/depth-and-liquidity) plots.

**Event contract.** An instrument that pays one unit of collateral if its
outcome resolves true and nothing if it does not. Priced between 0 and 1 and
quoted in cents, so 53¢ reads as a 53% chance. See
[prediction markets](/docs/prediction-markets).

**Fill.** A completed execution. Partial fills are normal on limit orders.

**Funding rate.** The periodic payment between longs and shorts on a
[perpetual](/docs/cex-futures) that keeps its price pinned near spot. Positive
means longs pay shorts.

**Grouping / tick.** The price increment the [order book](/docs/order-book)
buckets levels into. The venue's own tick is the floor.

**Imbalance.** The ratio of resting bid depth to ask depth. Suggestive, and
easily manufactured, because resting orders can be cancelled.

**Level 1.** The top of the book and nothing behind it: best bid, best ask,
their sizes, and the spread. What a broker's free stock feed carries, and what
the [Level 1 panel](/docs/equities) stands in for an order book with.

**Limit order.** Executes only at your price or better. May not fill.

**Leverage.** How much exposure you hold per unit of margin posted. It changes
the margin a venue holds against a position, never the size of the position
itself.

**Liquidation cluster.** A price bucket holding real force-order prints from a
venue, measured rather than modelled. Pairlens collects them for Binance
Futures; other venues get the estimate marks instead, and the pane says which it
is drawing. See [perpetual futures](/docs/cex-futures#reading-the-risk).

**Liquidation price.** The price at which a leveraged position no longer has
enough margin behind it and the venue closes it for you. Pairlens shows an
estimate on the ticket; the venue's own number depends on your whole margin
balance.

**Liquidity.** How much can trade without moving price. Read it from depth and
from the spread, not from volume alone.

**Maker / taker.** The maker rests an order; the taker crosses the spread to hit
it. Most venues charge them differently.

**Market order.** Executes immediately against whatever is resting. Fills
guaranteed, price is not.

**Mid.** The midpoint between best bid and best ask.

**Notional.** Price times size: the money a level or a print represents. Usually
the more useful reading of the two.

**Perpetual (perp).** A futures contract with no expiry, held near spot by a
funding rate. Sized in contracts, settled in a stablecoin or in dollars. See
[perpetual futures](/docs/cex-futures).

**Reduce-only.** An order flag that may shrink an open position but never open
the opposite side. What makes closing a position safe to do twice.

**Regime.** Whether the market is trending or ranging, as classified by the
strategy engine. Strategies that work in one fail in the other.

**Slippage.** The gap between the price you expected and the price you got. A
function of depth and order size.

**Open interest.** The total size currently open in a contract, on one venue.
Rising open interest into a move means new money; falling means positions
closing. Pairlens never sums it across venues, because the total would mean one
exchange on a fresh install and three on a full one. See
[perpetual futures](/docs/cex-futures).

**Outcome.** One side of an event contract, Yes or No on a binary question, or
one of several on a categorical one. Each outcome is its own instrument with its
own book, and you can buy or sell either side.

**Overround.** The sum of every Yes price across an event's outcomes. Over 100%
is the book's margin, which is why sweeping the whole field is not free money;
under 100% is a field the book has not finished quoting. The event header and
the [basket ticket](/docs/prediction-markets) both state it.

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
