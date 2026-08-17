---
title: DEX and wallets
description: Swap on-chain from the same crypto trading terminal, on Solana via Jupiter and five EVM chains via KyberSwap, bridge between chains through LI.FI, read and manage concentrated-liquidity positions, and keep your private key on your own device.
group: traders
parent: trading
order: 5
eyebrow: For traders
updated: 17 AUG 2026
readTime: 14 min read
---

On-chain markets work like any other market in Pairlens. Same chart, same
ticket, same guardrails. What changes is where the order goes and what secret
signs it.

## Supported chains

**Solana**, routed through Jupiter.

**Ethereum, Base, Arbitrum, BNB Chain, and Polygon**, each a separate market
routed through the KyberSwap aggregator, which quotes across every DEX on that
chain and picks the best path.

Price and liquidity data for on-chain pairs comes from three read-only data
providers: GeckoTerminal answers first, DexPaprika is the fallback on desktop,
and DexScreener fills in the pool figures neither of the first two can deliver
to a browser. All three are keyless, and none of them ever sees a key of yours.

## Adding a wallet

**Accounts → Connect Account → Crypto Wallet.** You import a private key, which
is stored exactly like an exchange API key: in the OS keychain on desktop, in
your encrypted vault in a browser, and never on a Pairlens server.

The five EVM chains share one wallet entry, because one EVM private key
controls the same address on all of them. Solana needs its own.

Import a key you are comfortable putting on a trading machine. A hot wallet
funded with what you intend to trade is the sane setup. Do not import the key
that holds everything you own.

## Finding a pool

The **DEX** tab on Discovery is chain first, then pool.

**Chains** is the rail down the left: every chain the terminal knows, with gas,
liquidity and a day's volume beside it. Chains you have no connector for still
appear, dimmed, with an install link, because a chain that is simply absent
looks like a gap in the product while a dimmed row is an answer. The volume
column says what it covers: DexPaprika publishes chain-wide totals and is
reachable from the desktop app, and in a browser the same figure can only be
summed over the pools the provider sampled, so the subtitle switches to say so
rather than passing a top-20 sum off as a chain's whole day.

**Pool Map** ranks the selected chain's pools by turnover, a day's volume
against the liquidity backing it, not by volume alone. Volume alone puts the
deepest pools on top, which is where they always are and says nothing;
turnover is what separates a pool actually trading from a pool merely large. A
click selects, a double click opens the pair, and both pin the base token's
contract address rather than its ticker, because a pool map is exactly where
two tokens with the same symbol turn up next to each other.

**Liquidity Flow** charts net taker flow through the selected pool in
five-minute buckets, with the biggest single swaps beside it as evidence. The
name is careful: neither provider has a liquidity-flow endpoint, so nothing
here measures deposits or withdrawals. What it measures is the money that
crossed the pool, buy notional minus sell notional, which is the number that
moves price.

**Pool Detail** is the selected pool at a glance, one click from its chart and
a swap. It shows only what the provider actually published, so turnover
collapses without a liquidity figure and the fee tier collapses on a venue that
labels none, rather than filling the space with dashes.

## What replaces the order book

The on-chain pair layout ships with no order book and no depth curve, and that
is a decision rather than an omission. The data providers synthesize a bid and
an ask around the pool price, so a book drawn from them would be fabricated
depth. Three panels do the job an AMM can actually support.

**Pool Stats** sits under the chart: value locked, both reserves where a
provider publishes them, a day's volume, the fee tier, and price impact at
$1,000, $10,000 and $100,000. Those impact rows are live aggregator quotes at
each notional, not reserve math, which is why one can beat the pool's own
curve: the router may split across pools this panel never read.

**On-chain Trades** is the tape, every swap through the pool as it confirms.
The counterparty column is an address and nothing else. No wallet-labelling
source is connected, and a badge reading "market maker" would be a guess about
who is on the other side of your trade, so the address links to the chain's
explorer and you can decide for yourself.

**Route** shows how the aggregator would split a swap across pools, so the
slippage figure on the ticket has a stated cause. It quotes a probe size of
$1,000, $10,000 or $100,000, labelled as such, rather than reading the ticket's
own amount. Everything on it is a real quote through the same endpoint an order
would take, and nothing on that path signs anything.

## The same token on every chain

On the **Cross-Chain** board, the **Chain Ladder** prices the token on every
chain a connector reaches and ranks by what lands: output value minus the
aggregator's own gas estimate. That last column is the point. The deepest pool
is routinely not the best fill, since Ethereum wins on impact and loses on gas
below a few hundred thousand dollars and the ladder flips above that, and
comparing raw quotes would hide exactly that.

Cross-chain identity is the honest limit, and the ladder states it. There is no
canonical mapping from a token on one chain to "the same" token on another,
because bridged, wrapped and native versions are different contracts. A row is
quoted only where that chain's own resolver finds a pool for the pair, and a
chain where it does not is drawn dimmed and says so rather than being quietly
dropped.

The rest of that board is how you act on the ladder: **Bridge Route** and **In
Flight** sit beside it, so the chain that wins on total value is one panel away
from the transfer that gets you there.

## Placing a swap

Select an on-chain pair and the ticket adjusts:

**Market swaps** get a **Slippage** row: 0.1%, 0.5%, 1%, and 3%. Tight slippage
protects you from a bad fill but gets your transaction reverted more often on a
volatile pair. On a thin memecoin, 0.1% will simply fail.

**Limit orders** appear where the chain supports resting orders. They fill at
your price, so there is no slippage tolerance to set.

**No Workflow tab.** Bracket orders need exchange-native trigger orders, which
on-chain venues do not provide.

The submit button carries an **ON-CHAIN** badge and holds for the full live
duration, because an on-chain swap is irreversible the moment it lands.

## What is different from a CEX

**Gas.** Every EVM swap costs the chain's native token. Keep some ETH, BNB, or
POL in the wallet or the transaction cannot be sent.

**Finality, not fills.** A swap either lands or reverts. There is no partial
fill and no resting state to cancel for a market swap.

**Token identity matters.** Anyone can mint a token called anything. Pairlens
pins the addresses of well-known tokens so you get the real one, but a pair you
searched up yourself deserves a look at its contract address before you trade
it.

**Data-provider rate limits.** On-chain price data comes from public APIs with
request limits, so a page full of on-chain panels updates less often than a CEX
chart streaming over a WebSocket. Pairlens paces its own requests to stay inside
GeckoTerminal's free tier, so opening a board across five chains queues instead
of tripping the limit. When a provider throttles anyway, the pane says it is
rate limited and keeps retrying: a limit is never reported as a pair the venue
does not carry.

**Providers disagree on what they publish.** GeckoTerminal reports value locked
as one USD figure and nothing per side. DexPaprika reports both reserves and the
buy and sell split, but its API sends no CORS header, so only the desktop app
can reach it. DexScreener reports both reserves too and is reachable from a
browser, so **Pool Stats** shows both sides of a pool on the web terminal and on
your phone as well: when the pool DexScreener lists matches the one the primary
provider resolved, its reserves are filled in behind the primary answer and the
reserves cell names where they came from. Fields nobody publishes still read as
absent rather than as zero, because halving a USD figure to fake two reserves
would be inventing a constant-product pool that a concentrated-liquidity venue
is not. DexScreener publishes no candles and no ranked pool listing, so it never
answers the chart or the pool map.

## LP positions

**LP Position** and **Fee Accrual** read your concentrated-liquidity positions
straight off the chain, on all five EVM chains and on Solana. Connect a wallet
and the panels ask each chain what that address holds: Uniswap v3 on every EVM
chain, PancakeSwap v3 on BNB Chain where most of that chain's concentrated
liquidity sits, and Orca Whirlpool plus Raydium CLMM on Solana.

What you get per position is measured, not modelled. The band in prices rather
than ticks, whether the pool is trading inside it, how much headroom is left
before the upper bound, the two token amounts the liquidity currently stands for,
the fee tier, and what is owed in fees. The composition figures are computed from
the pool's own state each refresh, so they are what a burn would return right now
rather than what was deposited.

**The fee figure means two different things, and the pane says which.** On EVM it
is a static `collect` simulation sent from your address: the exact number the real
call would pay this block. On Solana neither program offers that simulation, so
the panes report the settled figure, the fees the position banked the last time it
was touched, captioned _as of last pool touch_. That is a floor rather than a
live number, and a floor labelled as one is useful in a way that the same number
presented as live is not.

Reading a Solana position is six batched RPC calls for a wallet of any size: the
position NFTs, the program accounts derived from their mints, the pools behind
them, and the token mints for decimals. A wallet holding no position NFTs stops
after the first two.

Only the address is involved. A position read is public chain state, so it works
with a sealed vault and never asks for a key, and nothing on that path can sign.

Four things chain state does not carry, and the panels say so rather than
estimating them: **cost basis** (a position stores its liquidity and its bounds,
never what it cost), **fees earned to date** and therefore **fee APR** (collected
fees leave no trace in state), **time in range** (the pool publishes its current
tick, not its history), and **loss versus simply holding**, which needs the first
two. Each needs an indexer or a fee-growth snapshot diffed over time. An invented
impermanent-loss figure is a number somebody closes a real position on.

## Managing a position

**Manage Liquidity** does the three things you can do to an EVM position without
replacing it, on Uniswap v3 and PancakeSwap v3.

**Collect** claims the fees the position has earned, both tokens, straight to
your wallet.

**Remove** takes part of the range back. Pick 25%, 50%, 75% or 100%, or drag the
slider to any whole percent. A removal is sent as one `multicall` pairing
`decreaseLiquidity` with `collect`, so the burnt amounts and the fees land in the
same transaction rather than sitting credited-but-unswept inside the position
manager. That is also why removing a quarter still pays out all of the fees: the
collect leg takes everything the position owes.

**Add** puts more in, in the ratio the current price implies for that band.

Every one of them is two steps. A section states what would happen, then a
confirmation card restates exactly what will be signed: the action, the position,
the chain, the manager contract, the amounts and the minimum those amounts may
not fall below. Slippage is a chip on the card, 0.1%, 0.5%, 1% or 3%, and it is
what sets that minimum. Nothing here submits from a single click, because nothing
here is reversible.

**There is no range editor, on purpose.** Moving a band is not an edit. It burns
the position and mints a new one at new ticks, which is a different NFT, a
different token id and a fresh set of approvals. Shipping that as a slider beside
the other three would make an irreversible replacement look like an adjustment.
Do it as a remove and a re-add and you can see both halves.

Solana positions are read-only for now: Orca and Raydium build their instructions
differently enough that the writer is its own piece of work.

## Bridging

**Bridge Route** and **In Flight** move one asset between the five EVM chains,
quoted and routed through the LI.FI aggregator.

**Bridge Route** takes a source chain, a target chain and a size, and answers
with a live route: what lands, the guaranteed floor under it, the bridge's own
fee, the source chain's gas, and which bridge would carry it. Fee and gas stay
two figures because two different things go wrong with them, and the floor sits
next to the estimate because the floor is the number a transfer executes against.

The confirm step matters more here than anywhere else in the app. A bridge quote
goes stale in about a minute and bridges re-price, so the pane freezes the terms
it is asking about, restates them, and the connector re-quotes at signing time
and refuses anything worse than what you confirmed. It signs with the EVM wallet
you already connected, so there is no second connect step and no second copy of
the key.

**In Flight** tracks what is still crossing. A bridge send outlives the tab it
was made in, so the rows come from a local transfer ledger and the poller keeps
running against the aggregator until each transfer settles or fails. There is no
progress bar, deliberately: LI.FI publishes a stage ("waiting for the destination
transaction"), not a block count, and a bar drawn from that would advance
smoothly on a transfer that is stuck. Each row states the stage, the elapsed time
against the quoted estimate, and links both transactions so you can go and look.

Solana legs are refused rather than quoted. A Solana transfer needs a Solana
signer and a different transaction shape, so the route comes back as a typed
refusal and the pane says so.

## The Solana endpoint

Every Solana surface, balances, swap sends, resting trigger orders and LP reads,
goes through one endpoint, and that endpoint is a plugin rather than a constant.
**Helius Solana RPC** ships in the box and answers the `rpc:solana` capability.

Paste a free Helius key into the plugin's settings and every Solana read in the
terminal follows it. Without a key it falls back to the public
`api.mainnet-beta.solana.com` node and says so, which is a degraded mode rather
than a refusal: a fresh install still reads a wallet. The public node sheds load
with a bare 403 and no retry hint, which is why a Solana wallet occasionally read
as empty before the key existed.

Prefer your own validator or another provider? Install a plugin declaring
`rpc:solana` at a lower priority number and every Solana read follows it, with no
connector change.

## Guardrails still apply

[Risk guardrails](/docs/risk-guardrails) are enforced on on-chain orders the
same as anywhere else. Position caps, trade caps, and loss caps do not care
which venue you are hitting.
