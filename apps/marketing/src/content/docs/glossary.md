---
title: Glossary
description: 'Two lists: the words Pairlens uses in a particular way, and the ordinary trading vocabulary the rest of the docs assume. Start with the second one if you are new.'
group: reference
order: 1
eyebrow: Reference
updated: 22 AUG 2026
readTime: 9 min read
---

Two lists. The first is terms that mean something particular in Pairlens. The
second is ordinary trading vocabulary the rest of the docs assume you know, and
if you are new, that is the one to skim first.

## Pairlens terms

**Account.** A set of exchange, broker, or wallet credentials you have
connected. Stored on this device only. See
[connect an exchange](/docs/connect-an-exchange).

**App Server.** The optional backend behind sign-in, cross-device sync, the AI
proxy, and cloud panels. The terminal is fully functional without one. It never
sees exchange credentials and is never in the order path.

**Assistant.** The one AI chat in the terminal, docked at the bottom right or in
the left nav rail, your choice, and mounted above every page. Its loop runs
client-side over 113 tools, and its conversations are kept on your device unless
you turn their sync on. It can propose trades. It cannot execute them unattended.
See [the AI assistant](/docs/ai-copilot).

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

**Plugin.** The unit of extension. Connectors, AI providers, panels, indicators
and themes are all plugins. Third-party plugins run in a sandbox and every
package is cryptographically signed. See [the Plugin SDK](/docs/plugin-sdk).

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

**Vault.** The browser's encrypted store for your exchange keys and wallet keys,
opened by whichever protector you enrolled. On desktop, credentials live in your
OS keychain instead. See [the security model](/docs/security-model).

**Venue.** An exchange, broker, event exchange, NFT marketplace, or on-chain
aggregator. Twenty-three ship in the box, plus the on-chain connectors.

**Workspace.** A saved arrangement of panes, with variables that bind them to a
pair, venue, and account. See [workspaces](/docs/workspaces).

## Market terms

**Aggressor.** The side that crossed the spread to get filled. What the
[tape](/docs/time-and-sales) reports, and the direction that moved price.

**All-time high (ATH).** The highest price an asset has ever traded at.

**Ask / offer.** The lowest price a seller will accept. The right side of the
book.

**Base and quote.** The two halves of a pair. In `BTC-USDT`, BTC is the base
(what you are buying) and USDT is the quote (what you pay with). Sizes can be
expressed in either.

**Basis.** The gap between a [perpetual](/docs/cex-futures) and the spot index
it tracks. Pairlens quotes it in basis points and annualised, so carry reads as
a yield rather than as a price difference.

**Bid.** The highest price a buyer will pay. The left side of the book.

**Candle.** One mark on a chart, covering one slice of time and recording four
numbers: the open, the high, the low and the close. See
[the chart](/docs/chart-panel).

**Depth.** How much size rests between the touch and a given price. What the
[depth curve](/docs/depth-and-liquidity) plots.

**Dollar-cost averaging (DCA).** Buying a fixed amount at regular intervals
rather than all at once, which trades a worse best case for a better worst case.

**Drawdown.** How far you are down from your peak. The number that actually
describes how a strategy feels to run.

**Event contract.** An instrument that pays one unit of collateral if its
outcome resolves true and nothing if it does not. Priced between 0 and 1 and
quoted in cents, so 53¢ reads as a 53% chance. See
[prediction markets](/docs/prediction-markets).

**Fill.** A completed execution. Partial fills are normal on limit orders.

**Floor price.** The cheapest current ask across an NFT collection. It is what
somebody is asking, not what a holder can get, which is why Pairlens marks
holdings against the top offer instead. See
[NFT collections](/docs/nft-trading).

**Fully diluted value (FDV).** What a token would be worth if every token that
will ever exist were already trading. Compare it to market cap: a large gap means
supply is still coming.

**Funding rate.** The periodic payment between longs and shorts on a
[perpetual](/docs/cex-futures) that keeps its price pinned near spot. Positive
means longs pay shorts.

**Gap.** A jump between one bar's close and the next bar's open, with nothing
traded in between. Common on stocks over a weekend, and the reason a stop-loss
cannot always protect you at the price you set.

**Gas.** The fee paid to a blockchain to process a transaction, in that chain's
own token. See [DEX and wallets](/docs/dex-trading).

**Grouping / tick.** The price increment the [order book](/docs/order-book)
buckets levels into. The venue's own tick is the floor.

**Imbalance.** The ratio of resting bid depth to ask depth. Suggestive, and
easily manufactured, because resting orders can be cancelled.

**Impermanent loss.** The value a liquidity provider gives up because the pool
sells them out of the rising asset and into the falling one. See
[DEX and wallets](/docs/dex-trading#liquidity-positions).

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

**Long / short.** Long means you profit if the price rises. Short means you
profit if it falls. Buying an asset outright is a long; shorting needs a
[perpetual](/docs/cex-futures) or a margin account.

**Market cap.** Price times the supply currently circulating. The number to
compare two assets by, since price alone says nothing without supply.

**Maker / taker.** The maker rests an order; the taker crosses the spread to hit
it. Most venues charge them differently.

**Market order.** Executes immediately against whatever is resting. Fills
guaranteed, price is not.

**Mid.** The midpoint between best bid and best ask.

**Moving average.** The average closing price over the last N bars, redrawn each
bar. The simplest way to read a trend. See [indicators](/docs/chart-indicators).

**Notional.** Price times size: the money a level or a print represents. Usually
the more useful reading of the two.

**Perpetual (perp).** A futures contract with no expiry, held near spot by a
funding rate. Sized in contracts, settled in a stablecoin or in dollars. See
[perpetual futures](/docs/cex-futures).

**Reduce-only.** An order flag that may shrink an open position but never open
the opposite side. What makes closing a position safe to do twice.

**Position.** What you currently hold in one market, and by extension your
exposure to it. **Position sizing** is deciding how large it should be, which
follows from your stop rather than from your confidence. See
[risk guardrails](/docs/risk-guardrails).

**Profit and loss (P&L).** What a position or a period has made or lost.
_Unrealised_ is the paper gain on something you still hold; _realised_ is what
you actually banked by closing it.

**Regime.** Whether the market is trending or ranging, as classified by the
strategy engine. Strategies that work in one fail in the other.

**Rug pull.** A token whose creator sells their entire holding at once, taking
the price to zero. The specific risk the memecoin
[safety panel](/docs/memecoins) checks for.

**Slippage.** The gap between the price you expected and the price you got. A
function of depth and order size.

**Stop-loss.** An order that closes your position automatically once price moves
against you by a set amount. The single most useful risk tool there is, and the
one most often skipped.

**Support / resistance.** A price where buying has repeatedly stopped a fall
(support) or selling has repeatedly stopped a rise (resistance). See
[drawing tools](/docs/drawing-tools).

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

**Sweep.** Buying the N cheapest listings in an NFT collection in one order. A
market buy sized in items, priced from the ask ladder rather than from the
floor, because five items deep can cost well over five times the first one.

**Take-profit.** The mirror of a stop-loss: an order that closes your position
once price moves in your favour by a set amount.

**Tick size.** The smallest price increment a venue accepts.

**Timeframe.** How much time one candle covers: 1m, 1h, 1D and so on. There is
no correct one, only the one that matches how long you intend to hold.

**Top offer.** The best standing collection-wide bid on an NFT collection: the
price a holder can sell any token into right now. The one number on that board
a holder can actually act on.

**Touch.** The best bid and best ask: the top of the book.

**Trait floor.** The cheapest ask among the tokens carrying one trait value. On
a mature collection this is where pricing actually happens, and the collection
floor is only a headline.

**Volume.** How much traded in a period. A big price move on low volume
convinces fewer people than the same move on high volume.

**Wall.** A level holding much more size than its neighbours. Real until it is
cancelled, which is why the [liquidity heatmap](/docs/depth-and-liquidity) beats
a single snapshot.
