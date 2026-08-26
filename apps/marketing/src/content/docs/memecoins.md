---
title: Memecoins
description: What a bonding curve is, why graduation matters, and how to read a launchpad token before you buy it. Then the four-column Pairlens board, the safety panel, and where the data comes from.
group: traders
parent: trading
order: 10
eyebrow: For traders
updated: 26 AUG 2026
readTime: 11 min read
---

## Before anything else

Memecoins are the most hostile market in this terminal. Most of them go to zero,
many are built to. Two specific mechanisms are worth naming, because they are how
people actually lose money here rather than merely being wrong:

**A rug pull.** The creator holds most of the supply, waits for buyers, and sells
everything at once. The chart goes vertical then straight to zero, in minutes.

**A honeypot.** The token's code lets you buy and quietly prevents you from
selling. You watch it go up and cannot get out.

The Token Safety panel below exists to check for exactly these before you trade.
Read it every time. And size every memecoin position as money you have already
decided to lose, because there is no thesis that survives the creator minting
another billion tokens.

## What a launchpad actually does

Most Solana memecoins are created on a **launchpad**, which is a system that lets
anyone mint a token and start trading it immediately, with no liquidity provider
needed.

It works through a **bonding curve**: a formula that sets the price purely from
how much has been bought so far. The first buyer pays almost nothing, and each
subsequent buyer pays more than the last, automatically. No seller is required,
because the curve itself is the counterparty.

**Graduation** is what happens when enough has been paid in. The curve completes,
the money it collected becomes real liquidity, and the token migrates to an
ordinary [liquidity pool](/docs/dex-trading) where it trades like any other
on-chain asset. Only a small fraction of tokens ever get there.

That is why launchpad tokens get their own board, split by where they are in that
lifecycle. It is the one thing about them that is genuinely structural rather
than vibes.

## Why they are a separate class

Memecoins route through the same connectors and the same guarded order path as
any other on-chain token. What differs is what you read before trading.

A pool desk is about reserves, fee tier and price impact. A memecoin desk is
about market cap, who is buying, and whether the creator can still mint more
supply. So the class gets its own Discovery tab, its own trade board and its own
panels.

## The board

**Discovery → Memecoins** opens on four columns, one per stage of a token's life.
Equal widths on purpose: which stage deserves your attention is a decision about
your own risk tolerance, not one a layout should make for you.

**New Mints** is what was minted in the last six hours, newest first, with the
holder count beside the ticker. Rows appear within seconds of a token's first
trade, and the age column counts in seconds while that matters.

**Graduating** ranks everything currently climbing a curve by how close it is,
shown as a bar and a percentage. Tokens enter this column a third of the way up.

**Graduated** is everything that completed a curve in the last seven days and now
trades on a real pool.

**Legendary** is the cross-chain long tail that outlived its cycle: DOGE, SHIB,
PEPE, BONK, WIF and the rest, ranked by market cap. Volume there carries a
multiple: `$310M · 1.4×` means the coin traded 1.4 times as much of itself today
as the median coin in the column. Volume alone cannot say that, because $310M is
enormous for a $500M coin and a quiet day for a $14B one. Past 3× it is marked.

Every row on the other three columns carries market cap and a buy/sell bar: the
buy count on the left, the sell count on the right, and between them a bar whose
green-to-red boundary is the ratio. The counts are there because 8 buys to 1 sell
and 800 to 100 are the same ratio and very different events. Every part of that
cell is a fixed width, so the same ratio lands in the same place all the way down
the column. On a narrow pane the counts drop and the bar stays.

A token with no picture gets a coloured mark instead of a grey one. It is
generated from the token's own address, so it is the same mark on every device
and in every session, and it follows the theme rather than fighting it. On a
column where half the rows are anonymous, that is the difference between reading
tickers and recognising rows.

Clicking a row opens that token's chart and swap ticket.

## Sorting and filtering

Every column header sorts. Click once for descending, again for ascending, and a
third time to go back to the column's own ranking, which is a real answer rather
than an absence: "closest to graduating" cannot be reproduced from any single
field once a published curve and a reconstructed one are mixed in the same list.

The fourth column sorts by net trades, buys minus sells, so descending is what is
being bought and ascending is what is being dumped. Total activity would rank a
token being sold off above one being accumulated, which is the opposite of what
anyone sorting that column is asking.

The funnel in a column's header sets bounds on it: a market cap floor or ceiling,
a liquidity or holder minimum, a curve range on Graduating, a maximum age on New
Mints, a 24-hour volume floor on Legendary. Leave a field empty for no bound.
Rows the feed published no figure for do not pass a bound, because a token whose
market cap nobody published is not a token known to clear your floor.

A column filtered down to nothing says so, and offers to clear the bounds, rather
than showing you the same empty pane a quiet market would.

Sorting and filters are saved per column, and they follow your account when cloud
sync is on: set a floor on the laptop and the desktop app opens with it.

Legendary rows take an extra step to get there, because that column ranks _coins_
rather than contracts, and a ticker is no help: GIGACHAD is three different
tokens on three chains. Each row is resolved to a real contract through a proper
coin-to-contract mapping.

Most large memecoins list a contract on several chains, and all but one is
usually a bridged wrapper with almost no liquidity. BONK lists eight chains, PEPE
four. Pairlens picks the one where the token actually trades deepest, which is
the only rule that gets both right: BONK is Solana-native and SPX6900 is
Ethereum-native, so any fixed chain preference sends one of them to a wrapper.

A handful of rows do not link at all, and that is correct rather than missing.
DOGE has no contract on any chain. When every candidate measures zero liquidity,
Pairlens refuses to pick one instead of guessing.

## The trade board

Open a memecoin and you get **Memecoin Terminal** rather than the pool layout.

**Token Stats** carries market cap, fully diluted value, liquidity, holder count,
the launchpad that minted it, and curve progress.

Market cap uses circulating supply and fully diluted value uses total supply. For
most launchpad tokens the whole supply is circulating and the two agree. When
they do not, the gap is supply that has not hit the market yet, which is supply
that eventually can.

Holder count, the launchpad and curve progress are Solana knowledge, and they
read as a dash on a token opened on Ethereum, Base, BSC, Arbitrum or Polygon.
That is most of the Legendary column. A curve is a launchpad's own mechanic, and
nobody publishes one for a coin that has been trading on Uniswap since 2021.

**Buy / Sell Flow** puts buys against sells over 5 minutes, 1 hour, 6 hours and
24 hours, each with the price move and the volume behind it. Counts are trades,
not traders, which matters here: one wallet can be a hundred trades.

**Token Safety** is the panel to read before an order:

- **Mint authority.** Revoked means the creator cannot create more supply. Not
  revoked means your holding can be diluted at will.
- **Freeze authority.** Revoked means they cannot freeze your account. Not
  revoked is the mechanism behind a honeypot.
- **Top holders.** The share of supply held by the largest wallets. Above 30% it
  turns red, because that is enough for one seller to end the market.
- **Deployer mints.** How many tokens this wallet has launched before, and how
  many graduated. A wallet on its four-thousandth mint is telling you something.

One rule about that panel: **Unknown is not safe.** When no source publishes an
audit, it says Unknown rather than showing a green check, because a green check
here reads as permission to size up. An Ethereum-style token has no mint or
freeze authority to revoke in the first place, so on those chains the panel
reports no audit rather than inventing a clean one.

**Memecoin Sniper** is a second layout for working launches: the New and
Graduating columns stay on screen beside the chart, the flow strip and the
ticket, so the two columns that decide the entry are still visible while the
order goes in.

## Where the data comes from

No Pairlens server is involved. Every request goes out from your own browser to a
keyless public API, so each user spends their own rate-limit budget rather than
competing for one server's.

**New, Graduating and Graduated** come from Jupiter, whose primary feed publishes
curve completion computed by the venue running the curve. If it stops answering,
the board falls back to Jupiter's public token API and reconstructs the
percentage from market cap and the curve's own formula. A reconstructed number is
marked with a tilde (`~96%`) so you always know which one you are reading.

**Legendary** comes from CoinGecko's meme-token category. Market cap comes from
there rather than from a DEX because DEX-reported market cap is unreliable at the
top end: measured live, one venue reported BONK's market cap as over a trillion
dollars.

**The chart** comes from Jupiter too, and this is the one source that has no
alternative. A token still on its bonding curve has no AMM pool yet, so the pool
data providers have nothing to look up: measured against three mints that were
minted within the hour, the pool provider returned no pool at all for every one
of them. Jupiter charts a token by its mint rather than by a pool, so the curve
is on screen from the first trade. Off the curve it also aggregates every pool
the token trades in, which is the number you want for a token rather than for a
particular pool, and it needs one request where a pool lookup needs two. On
chains other than Solana the chart still comes from the pool providers.

**One token**, which is what the three trade-board panes read, comes from Jupiter
on Solana and from DexScreener everywhere else. The split is forced by the
board's own reach: Legendary rows open on whichever of six chains a coin trades
deepest on, and Jupiter is a Solana token API. DexScreener answers for every
chain the terminal routes. It sums liquidity, volume and the trade counts across
a token's pools and quotes price, market cap and the move from the deepest one,
and it publishes no holders and no audit, which is why those read as unknown
there. It is also Solana's backstop, for a mint Jupiter has never indexed.

The launchpads' own APIs are not usable from a browser at all, so a client-side
board cannot read them.

Both columns cache their last answer locally, so re-opening the board paints
immediately and then refreshes, and a throttled feed leaves the previous list on
screen rather than emptying the column.

A genuinely cold board draws its own shape while it waits: real headers, real
labels, and a placeholder where each figure will land, so nothing moves when the
answer arrives. If it is still waiting after a few seconds you get a line saying
why, because the fix people reach for is a reload and a reload is the one thing
that makes it slower. It throws the paced queue away and starts from cold.

### Swapping the feed

The board reads its data through a plugin capability rather than a hardcoded
fetch. The bundled feed serves it keylessly. Any plugin declaring the same
capability at a higher priority serves the same rows instead, with no panel
changing. That is the upgrade path if you want a paid feed behind the board.

## Trading one

Memecoin orders take the identical path as any other on-chain swap: the same
connector, the same wallet, the same risk guardrails, the same confirmation. See
[DEX and wallets](/docs/dex-trading) for the wallet setup.

Two practical notes. **Set your slippage wider than you would elsewhere**, since
a thin launchpad token at 0.1% tolerance simply will not go through. And **a
memecoin's identity is its chain and mint address, never its ticker.** Six tokens
on the board can be called TIMBOTHY and be six different mints. The address is
what everything pins.

## Turning it off

Memecoins are a plugin family. Uninstalling **Pairlens Memecoins** removes the
Discovery tab, the workspaces and the panels; uninstalling **Memecoin Feed**
removes the data. A deployment can drop the whole class at build time. See
[plugins](/docs/plugins-for-traders).
