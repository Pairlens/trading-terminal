---
title: DEX and wallets
description: Swap on-chain from the same crypto trading terminal, on Solana via Jupiter and five EVM chains via KyberSwap, bridge between Solana and every EVM chain through LI.FI, read and manage concentrated-liquidity positions, and keep your private key on your own device.
group: traders
parent: trading
order: 5
eyebrow: For traders
updated: 20 AUG 2026
readTime: 20 min read
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

**Pool Map** draws the selected chain's top pools as a treemap: tiles sized by
the day's volume and tinted by the day's move, so the biggest money and the
biggest movement read in one glance. The sizing metric is a toggle, Volume by
default, then Liquidity, Trades, and Turnover, a day's volume against the
liquidity backing it, which is the one that separates a pool actually trading
from a pool merely large. Two rules decide which pools get a tile, and both are
about what a bot cannot fake cheaply: the pool has to hold at least $10,000 of
published liquidity, and its claimed volume has to stay inside 500 daily turns
of that liquidity. The ceiling is set where the impossible starts rather than
where the unusual does, because a concentrated-liquidity pool services enormous
volume on a small active range: Solana's busiest tokenized-equity pools run 150
to 370 turns a day on real capital, and a tighter bar dropped every one of
them. A footer strip opens the full ranked list, dust included. A click selects,
a double click opens the pair, and both pin the base token's contract address
rather than its ticker, because a pool map is exactly where two tokens with the
same symbol turn up next to each other, sometimes as two tiles at once.

**Liquidity Flow** charts net taker flow through the selected pool in
five-minute buckets, with the biggest single swaps beside it as evidence. The
name is careful: neither provider has a liquidity-flow endpoint, so nothing
here measures deposits or withdrawals. What it measures is the money that
crossed the pool, buy notional minus sell notional, which is the number that
moves price.

**Pool Detail** is the selected pool at a glance, one click from its chart and
a swap, and the board selects its busiest pool on open so the pane never sits
empty. It carries the price impact of a $10k swap from a real aggregator quote
and an hour of buy against sell pressure summed from the same trades feed the
flow pane reads. It shows only what the provider actually published, so
turnover collapses without a liquidity figure and the fee tier collapses on a
venue that labels none, rather than filling the space with dashes.

### How the board loads

Everything on this board comes from one on-chain data provider on a free tier
of roughly 30 requests a minute, shared with the candle and ticker pollers any
charted pair is already running. Pairlens paces itself inside that budget
rather than bursting through it and taking a rate limit that would knock out
the chart too, so opening the board is a few seconds of real work. Three things
keep those seconds from feeling like a stall.

The reads are prioritised. The selected pool's own state and its swap tape jump
the queue ahead of the chain rail's background sweep across every other chain,
because they are the two panes you are looking at and the last two that can be
asked for: nothing can request a pool's swaps until the map has ranked the
chain and picked one.

The map paints in two passes. It ranks three pages deep to get past the pools a
bot has painted volume onto, and it draws the first page as soon as that page
lands instead of waiting for the walk to finish. The selection is seeded from
it immediately, so Pool Detail and Liquidity Flow start loading while the
deeper pages are still coming. The header says "more pools loading" while that
is happening.

The last ranking is kept. A chain's pools and the rail's chain volumes are
stored locally and painted instantly on your next visit, marked "refreshing"
while a live copy is fetched behind them. Nothing older than half an hour is
ever shown, and a fresh read always goes out, so the cache only ever buys you
the first paint.

While a pane genuinely has nothing yet it draws its own shape rather than a
spinner: the map shows a treemap of placeholder tiles, Liquidity Flow shows its
bars around the midline. If a read runs past about four seconds, both add a
line saying the provider is metered, so you know to wait rather than reload,
which throws the paced queue away and starts it from cold.

## What a pair is called

An on-chain pair is routed by contract address, not by ticker, because the
address is the token's identity and a ticker is whatever the deployer typed.
That is what keeps a swap pointed at the PEPE you picked rather than the
eightieth copy of it, and it is why the URL of a token chart carries forty hex
characters.

The title above the chart is not that string. Pairlens writes down what a token
was called at the moment you picked it, on the row you picked it from, and every
later surface reads it back: the chart header, the recents strip, the watchlist,
and the size and Buy or Sell labels on the ticket. So the header reads
`USDT-USDC`, the ticket says Sell USDT, and the address is one hover away in the
tooltip. Open a token from a link or a bookmark instead and the terminal has
never seen it, so it shows `0xdac1…1ec7` until the pool read behind the chart
resolves the ticker, which takes about as long as the first candles.

Both ends of the address are always kept when it is shortened. Tokens from one
deployer share a prefix, so a leading-only cut makes different contracts look
identical.

Where a list can hold several chains at once, the chart's own chain rides along
after the ticker: the watchlist and the recents strip show `WETH-USDC BASE`
beside `WETH-USDC ARB`, because those are different tokens and nothing else in
the row says so. The chart header leaves it out, since the asset-class badge
next to the title already names the chain.

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
pins the addresses of well-known tokens so you get the real one, and search rows
carry the chain and contract of each match so eight identically named results
can be told apart, but a pair you searched up yourself deserves a look at its
contract address before you trade it. Hover the pair title for the full one.

**Data-provider rate limits.** On-chain price data comes from public APIs with
request limits, so a page full of on-chain panels updates less often than a CEX
chart streaming over a WebSocket. Pairlens paces its own requests to stay inside
GeckoTerminal's free tier, and paces the burst as well as the minute, because a
Discovery board opening cold asks about six chains at once. When a provider
throttles anyway it holds the queue back for a few seconds, and panes waiting on
it keep saying they are loading, because that is what they are doing: a hold
that ends in seconds is a slow pane, not a broken one. Only a hold longer than a
pane's own refresh is reported as a refusal, with a Try again button where the
pane has given up. A limit is never reported as a pair the venue does not carry,
or as a chain with no pools.

That last part takes some care in a browser. GeckoTerminal sends a CORS header
on its successful responses and none on its rate-limited ones, so from a web
page a 429 is not a status you can read, it is a blocked response and a bare
network error. Read literally it looks identical to "there is nothing here",
which is how a rate limit used to empty the whole on-chain board and blame the
chain for it. Pairlens treats an unreadable refusal from that provider as a
refusal, so the board waits and retries instead of inventing an answer.

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

**The fee figure is what a claim would actually pay, on both families.** On EVM
that is a static `collect` simulation sent from your address: the exact number the
real call would pay this block. Neither Solana program offers such a simulation,
and neither settles fees until the position is next touched, so the connector
replays the pool's fee growth instead. It reads the pool's lifetime fee growth and
the two ticks at the edges of your band, works out the growth that accumulated
inside the band, and multiplies the part since the position's own checkpoint by
its liquidity. That is the same arithmetic the programs run, and it is verified
against them: the test vector for it is a real mainnet position whose expected
value came out of Orca's own `update_fees_and_rewards`, simulated over the same
bytes, and the replay reproduces it exactly.

It is worth knowing how large that gap was. The fixture position had 0.0136 SOL
settled and 1.0856 SOL actually claimable, eighty times the number the old path
printed, on a range that had simply not been touched in a while.

**A single position can still report a floor**, and it says so when it does. If a
boundary tick account cannot be read, that row keeps its settled figure with the
_as of last touch_ caption while every other row stays live. Per position, not per
page: one unreadable account does not relabel a whole wallet.

Reading a Solana position is seven batched RPC calls for a wallet of any size: the
position NFTs, the program accounts derived from their mints, the pools behind
them, the boundary tick arrays of every position still holding liquidity, and the
token mints for decimals. A wallet holding no position NFTs stops after the first
two, and a position with no liquidity skips the tick reads entirely, because
nothing is accruing to it.

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

**Manage Liquidity** does the three things you can do to a position without
replacing it, on Uniswap v3 and PancakeSwap v3 across the EVM chains and on Orca
Whirlpool and Raydium CLMM on Solana.

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
the chain, what will execute it, the amounts and the minimum those amounts may
not fall below. On EVM that last one is a position-manager contract and the card
shows its address, because the address is the thing worth checking. On Solana it
is a program, so the card names it, Orca Whirlpool or Raydium CLMM, with its
pinned id beside the name. Slippage is a chip on the card, 0.1%, 0.5%, 1% or 3%,
and it is what sets that minimum. Nothing here submits from a single click,
because nothing here is reversible.

**There is no range editor, on purpose.** Moving a band is not an edit. It burns
the position and mints a new one at new ticks, which is a different NFT, a
different token id and a fresh set of approvals. Shipping that as a slider beside
the other three would make an irreversible replacement look like an adjustment.
Do it as a remove and a re-add and you can see both halves.

**Solana differs in three ways worth knowing before you sign.**

There are no token approvals. An EVM deposit needs one per token before the
manager can pull them, which is why adding liquidity there can be two or three
transactions; a Solana deposit is one.

A collect settles first. `collect_fees_v2` pays out what the position has banked,
and that figure is stale until something touches the position, so Pairlens sends
`update_fees_and_rewards` ahead of it in the same transaction. Without that leg a
claim would pay the settled number and leave the rest in the pool, which is the
same gap the fee panes exist to close. Raydium ships no collect instruction at
all, so a claim there is a `decrease_liquidity_v2` that burns nothing.

**Every transaction is simulated before it is sent, and a simulation that fails
is a refusal.** The instructions are built by hand, from each program's published
IDL rather than from an SDK, and the program itself is the only thing that can
confirm they are right. When simulation fails you get the program's own log line
and nothing goes out, so a mistake costs you a message rather than a fee and a
confusing explorer page.

Before any of that, and before your key is ever fetched: the program you named
has to be one of the two pinned ids, the position account has to exist at the
address derived from its mint under that program, and the position NFT has to be
in your wallet's associated token account under the token program the mint itself
declares. That last read is both the ownership proof and what decides which token
program goes into the instruction, so the two cannot disagree. Every one of those
checks runs before the vault is opened.

## Bridging

**Bridge Route** and **In Flight** move one asset between the five EVM chains
and Solana, quoted and routed through the LI.FI aggregator.

**Bridge Route** takes a source chain, a target chain and a size, and answers
with a live route: what lands, the guaranteed floor under it, the bridge's own
fee, the source chain's gas, and which bridge would carry it. Fee and gas stay
two figures because two different things go wrong with them, and the floor sits
next to the estimate because the floor is the number a transfer executes against.

The confirm step matters more here than anywhere else in the app. A bridge quote
goes stale in about a minute and bridges re-price, so the pane freezes the terms
it is asking about, restates them, and the connector re-quotes at signing time
and refuses anything worse than what you confirmed. It signs with the wallets you
already connected, so there is no second connect step and no second copy of a
key.

### Solana legs

Solana is one of the six chains, on both sides. SOL or an SPL token can leave
Solana for any EVM chain, and any EVM asset can land on Solana.

A transfer that crosses between the two families is the one case where two
wallets are involved: the Solana key signs the send and the EVM key receives it,
or the other way round. Connect both and nothing changes about the flow. Connect
only one and the pane still prices the route, then says which wallet is missing
rather than letting you confirm a transfer with nowhere to land.

The safety check is different on Solana, because the transaction is different. An
EVM transfer can be checked against a pinned contract address, a fixed value and
one recipient. A Solana transaction is a bundle of instructions across programs
that change with whichever bridge won the quote, so instead of asking who it
calls, the terminal asks what it does: every transfer is **simulated against the
chain before your key is ever fetched**, and the simulated result has to show the
wallet spending exactly what it agreed to. An SPL send must move exactly the
quoted amount of exactly that token. A native send is measured across SOL and
wrapped SOL together, because some bridges unwrap your wrapped SOL to fund the
send. Nothing else of yours may fall, no token account may change owner, and none
may come away with a spending delegate or a close authority it did not already
have, which is the Solana shape of the standing claim an unlimited token approval
would leave behind. A failing simulation is a refusal that quotes what the chain
said, not a spinner.

Two more refusals worth knowing about. The transaction has to be paid for by your
wallet, and your signature has to be the only one still missing: bridges that
build a two-signer transaction have to have signed their half already, so nobody
can change the transaction after you sign it. And a transfer that touches an
account of yours under a token program the connector does not recognise is
refused rather than skipped, because an account it cannot decode is an account it
cannot prove was left alone.

**In Flight** tracks what is still crossing. A bridge send outlives the tab it
was made in, so the rows come from a local transfer ledger and the poller keeps
running against the aggregator until each transfer settles or fails. There is no
progress bar, deliberately: LI.FI publishes a stage ("waiting for the destination
transaction"), not a block count, and a bar drawn from that would advance
smoothly on a transfer that is stuck. Each row states the stage, the elapsed time
against the quoted estimate, and links both transactions so you can go and look.

A Solana send is tracked exactly like an EVM one: the base58 signature is what
the aggregator's status endpoint is polled with, and the row links it on Solscan.

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
