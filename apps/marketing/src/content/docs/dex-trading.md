---
title: DEX and wallets
description: What a decentralized exchange is, how a liquidity pool sets a price, and what changes when you trade from your own wallet. Then swapping, bridging and liquidity positions in Pairlens.
group: traders
parent: trading
order: 5
eyebrow: For traders
updated: 22 AUG 2026
readTime: 14 min read
---

## What a decentralized exchange actually is

A regular exchange matches your buy against somebody else's sell, keeps a
[order book](/docs/order-book) of everyone's offers, and holds your funds while
it does. A **decentralized exchange**, or DEX, has none of that. There is no
book, no company, and nobody holding your money.

Instead there are **liquidity pools**. Someone deposits, say, $1m of ETH and $1m
of USDC into a smart contract. You come along and trade against that pool: you
put USDC in, you take ETH out. The price is set by a formula on the ratio of the
two sides, so buying ETH from the pool makes the remaining ETH scarcer and
therefore more expensive, automatically, with no seller involved.

That is the whole mechanism. Four things follow from it, and they are what make
on-chain trading feel different:

**Your trade moves the price by itself.** Take a big enough bite out of a pool
and you push the ratio, so the last part of your order fills much worse than the
first. This is called **price impact**, and on a small pool it can be brutal.
Pairlens shows you the impact before you trade.

**You pay gas.** Every transaction on a blockchain costs a fee paid in that
chain's own token: ETH on Ethereum, SOL on Solana, BNB on BNB Chain. You need
some in your wallet or nothing can be sent, no matter how much of the token you
are trading you hold.

**There is no cancel.** A swap either lands on the chain or it fails. There is no
resting order to pull back and no partial fill to manage.

**Anyone can create a token called anything.** There is no listing committee. A
token's real identity is its **contract address**, a long string of hex, and the
ticker is just a label the creator typed. Dozens of tokens use each popular
ticker, and that is a deliberate tactic rather than an accident.

### Custody: the real difference

On an exchange, your funds sit in the exchange's account and you have a login. On
a DEX, your funds sit in **your wallet**, and the wallet is controlled by a
private key. Whoever holds that key holds the funds. There is no password reset,
no support desk, and no reversal.

This is genuinely better in one way (nobody can freeze or lose your money for
you) and genuinely worse in another (nobody can help you if you lose the key or
sign something you should not have). Trade accordingly.

Launchpad tokens have their own class and their own board. If you are here for
memecoins, see [memecoins](/docs/memecoins).

## Supported chains

**Solana**, routed through Jupiter.

**Ethereum, Base, Arbitrum, BNB Chain and Polygon**, each routed through the
KyberSwap aggregator, which quotes across every DEX on that chain and picks the
best path for you.

Price and pool data comes from three read-only providers. All are keyless, and
none of them ever sees a key of yours.

## Adding a wallet

**Accounts → Connect Account → Crypto Wallet.** You import a private key, stored
exactly like an exchange key: in the OS keychain on desktop, in your encrypted
vault in a browser, never on a Pairlens server.

The five EVM chains share one wallet entry, because one key controls the same
address on all of them. Solana needs its own.

**Import a key you are comfortable putting on a trading machine.** A hot wallet
funded with what you intend to trade this month is the sane setup. Do not import
the key that holds everything you own. This is standard practice on-chain and it
is not paranoia: a trading wallet is exposed to every contract you have ever
approved.

## Finding a pool

The **DEX** Discovery tab goes chain first, then pool.

**Chains** is the rail down the left: every chain, with its gas price, total
liquidity and a day's volume. Chains you have no connector for still appear,
dimmed, with an install link, because a chain that is simply missing looks like a
gap in the product while a dimmed row is an answer.

**Pool Map** draws the chain's top pools as a treemap: tiles sized by the day's
volume and tinted by the day's move, so the biggest money and the biggest
movement read in one glance. Switch the sizing to Liquidity, Trades, or
**Turnover**, which is a day's volume against the liquidity backing it. Turnover
is the one that separates a pool actually trading from a pool merely large.

Two filters decide which pools get a tile, and both exist because fake volume is
cheap on-chain: a pool must hold at least $10,000 of published liquidity, and its
claimed volume has to stay within plausible bounds for that liquidity. A footer
opens the full ranked list, dust included.

Clicking a tile pins the token's **contract address** rather than its ticker,
because a pool map is exactly where two tokens with the same symbol turn up next
to each other.

**Liquidity Flow** charts net trading flow through the selected pool in
five-minute buckets, with the biggest single swaps beside it. The name is
careful: this measures money that crossed the pool, buys minus sells, not
deposits or withdrawals. It is the number that moves price.

**Pool Detail** is the selected pool at a glance: both tokens, the price with the
day's and the hour's move, liquidity, volume, turnover, buys against sells, the
price impact of a $10k swap, the fee tier, how old the pool is, and both sides'
reserves. Under it, an hour of buy versus sell pressure and the pool's recent
swaps over a dollar. The pool's own address links to the block explorer.

Fields nobody publishes are left out rather than filled with dashes.

### Why the board takes a few seconds

On-chain data comes from public APIs with tight free-tier limits, shared with
whatever your charts are already polling. Pairlens paces itself inside that
budget rather than bursting through it and taking a rate limit that would knock
out your chart too.

So the board fills in progressively: the pool you are looking at jumps the queue,
the chain rail fills one chain at a time, the map draws its first page as soon as
it lands, and the last ranking is cached so your next visit paints instantly
while a fresh copy loads behind it. Panels waiting on data draw their own shape
rather than a spinner, and if a provider is being slow they say so, so you know
to wait rather than reload.

## What a token is called

A token chart's address carries forty hex characters, because the contract
address is the token's identity and a ticker is whatever the deployer typed. That
is what keeps a swap pointed at the PEPE you picked rather than the eightieth
copy of it.

The title above the chart is not that string. Pairlens remembers what a token was
called on the row you picked it from, so the header reads `USDT-USDC`, the ticket
says Sell USDT, and the address is one hover away.

Open a token from a link instead and the terminal has never seen it, so it shows
`0xdac1…1ec7` until the chart's own data resolves the name. Both ends of the
address are always kept when shortened, because tokens from one deployer share a
prefix and a leading-only cut makes different contracts look identical.

In lists that mix chains, the chain rides along after the ticker: `WETH-USDC
BASE` beside `WETH-USDC ARB`, because those are different tokens.

## What replaces the order book

An on-chain pair has no order book, and the layout does not draw one. Some data
providers synthesize a fake bid and ask around the pool price, and a book built
from that would be fabricated depth. Three panels do the job instead.

**Pool Stats** sits under the chart: value locked, both reserves, a day's volume,
the fee tier, and **price impact at $1,000, $10,000 and $100,000**. Those impact
rows are the most useful numbers on the board, and they are live quotes rather
than arithmetic on the reserves, which is why one can beat the pool's own curve:
the router may split your order across pools this panel never read.

**On-chain Trades** is the tape: every swap through the pool as it confirms. The
counterparty column is an address and nothing else. No wallet-labelling source is
connected, and a badge reading "market maker" would be a guess about who is on
the other side of your trade, so the address links to the explorer and you decide
for yourself.

**Route** shows how the aggregator would split a swap across pools, so the
slippage number on your ticket has a stated cause. It quotes a probe size you
pick rather than reading your ticket, and nothing on that path signs anything.

## The same token on every chain

On the **Cross-Chain** board, the **Chain Ladder** prices a token on every chain
and ranks by what actually lands: output value minus the chain's gas cost.

That last column is the point. **The deepest pool is routinely not the best
fill.** Ethereum wins on price impact and loses on gas below a few hundred
thousand dollars, and the ranking flips above that. Comparing raw quotes would
hide exactly that.

One honest limit, which the ladder states: there is no canonical way to say a
token on one chain is "the same" as a token on another. Bridged, wrapped and
native versions are genuinely different contracts. A row is quoted only where
that chain's resolver actually finds a pool, and a chain where it does not is
drawn dimmed rather than quietly dropped.

## Placing a swap

Select an on-chain pair and the ticket adjusts.

**Market swaps get a Slippage row**: 0.1%, 0.5%, 1% and 3%. Slippage tolerance is
the worst price you will accept. Your transaction takes seconds to confirm and the
price can move in between, so the setting is a trade-off: too tight and the swap
simply fails, too loose and you can be picked off by a bot that sees your pending
transaction and trades around it. On a thin memecoin, 0.1% will not go through.

**Limit orders** appear where the chain supports resting orders. They fill at your
price, so there is no tolerance to set.

**No Workflow tab.** Bracket orders need exchange-side trigger orders, which
on-chain venues do not provide.

The submit button carries an **ON-CHAIN** badge and holds for the full duration,
because a swap is irreversible the moment it lands.

## Liquidity positions

You can be on the other side of all this: instead of trading against a pool, you
can supply it. Deposit both tokens, earn a share of every trading fee, and take
your capital back whenever you like.

Modern pools let you concentrate that capital in a **price range** you pick,
which multiplies your fee income while price stays inside it and earns you
nothing while price is outside. That is the trade.

**The risk has a name: impermanent loss.** As price moves, the pool sells you out
of whichever token is rising and into whichever is falling. Come back after a big
move and you can hold less value than if you had simply held the two tokens and
done nothing. Fees are meant to compensate for that, and often do not. Understand
this before providing liquidity to a volatile pair.

**LP Position** and **Fee Accrual** read your positions directly off the chain,
on all five EVM chains and on Solana: your price range, whether the pool is
trading inside it, how much headroom is left, what your liquidity currently
stands for in both tokens, and what fees you are owed.

The fee figure is what a claim would genuinely pay right now, not what the chain
has last written down. On Solana those can differ enormously: one real test
position showed 0.0136 SOL settled and 1.0856 SOL actually claimable, eighty
times more, simply because nothing had touched it in a while.

Reading a position needs only your address. It is public chain state, so it works
with a locked vault, never asks for a key, and nothing on that path can sign.

**Four things chain state does not carry**, and the panels say so rather than
estimating: your **cost basis** (a position stores its liquidity and bounds,
never what it cost), **fees earned to date**, **time in range**, and therefore
**how you did versus simply holding**. Every one of those needs a history the
chain does not keep. An invented impermanent-loss figure is a number somebody
closes a real position on.

## Managing a position

**Manage Liquidity** does the three things you can do to a position without
replacing it.

**Collect** claims your earned fees, both tokens, to your wallet.

**Remove** takes part of the range back: 25%, 50%, 75%, 100%, or any percentage
you drag to. Removing a quarter still pays out all your fees, because the claim
and the withdrawal go together in one transaction.

**Add** puts more in, at the ratio the current price implies.

Every one of them is two steps. A section states what would happen, then a
confirmation card restates exactly what will be signed: the action, the position,
the chain, the contract that will execute it, the amounts, and the minimum those
amounts may not fall below. Nothing here submits from a single click, because
nothing here is reversible.

**There is deliberately no range editor.** Moving your price range is not an
edit. It burns the position and mints a new one, which is a different position
with fresh approvals. Shipping that as a slider beside the other three would make
an irreversible replacement look like an adjustment. Do it as a remove and a
re-add, and you can see both halves.

Every transaction is simulated against the chain before it is sent, and a
simulation that fails is a refusal: you get the error and nothing goes out, so a
mistake costs you a message rather than a fee and a confusing explorer page.

## Bridging

Moving an asset from one chain to another is **bridging**, and it is the riskiest
routine operation in crypto. Bridges have been the single largest category of
hack by value. Move what you need, when you need it, rather than parking funds
mid-flight.

**Bridge Route** takes a source chain, a target chain and a size, and answers
with a live route: what lands, the guaranteed floor under that, the bridge's fee,
the gas, and which bridge would carry it. Fee and gas stay separate because
different things go wrong with each, and the floor sits beside the estimate
because the floor is the number your transfer actually executes against.

**Confirming matters more here than anywhere else in the app.** A bridge quote
goes stale in about a minute and bridges re-price constantly, so the panel freezes
the terms it asked you about and re-quotes at signing time, refusing anything
worse than what you confirmed.

Solana is on both sides, and a transfer between Solana and an EVM chain is the
one case where two wallets are involved: one signs the send, the other receives.
Connect only one and the panel still prices the route, then says which wallet is
missing rather than letting you confirm a transfer with nowhere to land.

Every Solana transfer is simulated before your key is ever fetched, and the
simulation has to show your wallet spending exactly what it agreed to and nothing
else. Nothing else of yours may move, and no account of yours may come away with
a new spending permission it did not have before. A failing simulation is a
refusal that quotes what the chain said.

**In Flight** tracks what is still crossing. A bridge send outlives the tab it
was made in, so the rows are kept locally and polled until each transfer settles
or fails.

There is no progress bar, on purpose. The aggregator publishes a stage, not a
percentage, and a bar drawn from that would advance smoothly on a transfer that
is stuck. Each row states the stage, the elapsed time against the estimate, and
links both transactions so you can go and look.

## The Solana endpoint

Every Solana read goes through one connection point, and it is a plugin rather
than something hardcoded. **Helius Solana RPC** ships in the box.

Paste a free Helius key into its settings and every Solana read follows it.
Without a key it falls back to the public node and says so, which is a degraded
mode rather than a refusal: a fresh install still reads a wallet. The public node
sheds load without explanation, which is why a Solana wallet occasionally read as
empty before the key option existed.

Prefer your own node? Install a plugin declaring the same capability and every
read follows it.

## Guardrails still apply

[Risk guardrails](/docs/risk-guardrails) are enforced on on-chain orders exactly
as anywhere else. Position caps, trade caps and loss caps do not care which venue
you are hitting.
