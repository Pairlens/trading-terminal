---
title: Memecoins
description: A four-column launchpad board for Solana launches and cross-chain large caps, with bonding-curve progress, buy and sell counts, holder concentration and a deployer audit, fed entirely from keyless public sources with no Pairlens server in the path.
group: traders
parent: trading
order: 10
eyebrow: For traders
updated: 22 AUG 2026
readTime: 10 min read
---

Memecoins are their own asset class in Pairlens, not a filter over the DEX
board. They route through the same connectors and the same guarded order path
as any other token, but they are read differently: a pool desk is about
reserves, fee tier and price impact, and a memecoin desk is about market cap,
who is buying, and whether the deployer can still mint more supply.

So the class gets its own Discovery tab, its own colour, its own trade board,
and its own panes.

## The board

**Discovery → Memecoins** opens on four columns, one per stage of a token's
life. Equal widths on purpose: which stage is worth your attention is a
decision about your own risk, not one the layout should make for you.

**New Mints** is what was minted in the last six hours, newest first, with the
holder count sitting beside the ticker. Rows appear within seconds of a token's
first trade, and the age column counts in seconds while it matters.

**Graduating** is the one that takes reading. A launchpad token starts life on
a _bonding curve_, a formula that sets its price against how much has been
bought so far. When enough has been paid in, the curve completes and the token
migrates to a real AMM pool. That is graduation, and this column ranks
everything currently climbing by how close it is. The bar and the percentage
are that progress. Tokens enter the column at a third of the way up, because
below that they are still New.

**Graduated** is everything that completed a curve in the last seven days and
now trades on a pool. The third column counts time since migration.

**Legendary** is the cross-chain long tail that outlived its cycle: DOGE, SHIB,
PEPE, BONK, WIF and the rest, ranked by market cap with the 24-hour move and
traded volume beside them. Volume carries a multiple: `$310M · 1.4×` means the
coin traded 1.4 times as much of itself today as the median coin in the
column. It is the same number the Movers pane shows, and it is what makes the
volume readable across three orders of market cap, since $310M is enormous for
a $500M coin and a quiet day for a $14B one. Past 3× it is marked.

Every row on the other three columns carries market cap and a buy/sell bar:
buys green on the left, sells red on the right, the boundary between them is
the ratio, and the counts sit inside the bar. The counts are there because 8
buys to 1 sell and 800 to 100 are the same ratio and very different events. The
bar is a fixed width in every row, so the boundary lands in the same place for
the same ratio all the way down the column. On a narrow pane the counts drop
and the bar stays.

Clicking a row opens that token's chart and swap ticket.

Legendary rows take an extra step to get there, because that column ranks
_coins_ rather than contracts. A coin id like `gigachad-2` is not something a
swap ticket can use, and the ticker is no help: GIGACHAD is three different
tokens on three chains. So each row is resolved to a real contract through
CoinGecko's own coin-to-contract mapping, which is a lookup rather than a
guess.

Most large-cap memecoins list a contract on several chains, and all but one of
them is usually a bridged wrapper with almost no liquidity. BONK lists eight
chains, PEPE four. Pairlens picks the one where the token actually trades
deepest, which is the only rule that gets both right: BONK is Solana-native and
SPX6900 is Ethereum-native, so any fixed "prefer this chain" order sends one of
them to a wrapper.

A handful of rows still do not link, and that is correct rather than missing.
DOGE has no contract on any chain, and some coins list only a brokerage. When
every candidate contract measures zero liquidity, Pairlens refuses to pick one
instead of guessing.

## The trade board

Open a memecoin and you get **Memecoin Terminal** rather than the DEX layout.

**Token Stats** carries market cap, FDV, liquidity, holder count, the launchpad
that minted it, and curve progress. Market cap uses circulating supply and FDV
uses total supply; for most launchpad tokens the whole supply is circulating
and the two agree.

Holder count, the launchpad and curve progress are Solana knowledge, and they
read as a dash on a token opened on Ethereum, Base, BSC, Arbitrum or Polygon.
That is most of the Legendary column, and the reason is in
[where the data comes from](#where-the-data-comes-from): a curve is a
launchpad's own mechanic, and no source publishes one for a coin that has been
trading on Uniswap since 2021.

**Buy / Sell Flow** puts buys against sells at four horizons, 5m, 1h, 6h and
24h, each with the price move and the traded volume behind it. Counts are
trades, not traders.

**Token Safety** is the panel worth reading before an order:

- **Mint authority.** Revoked means the deployer cannot create more supply.
- **Freeze authority.** Revoked means they cannot freeze your account.
- **Top holders.** The share of supply held by the largest wallets. Above 30%
  it turns red.
- **Deployer mints.** How many tokens this wallet has launched before, and how
  many of them graduated. A wallet on its four-thousandth mint is telling you
  something.

One rule about that panel: **Unknown is not safe.** When a source publishes no
audit, the pane says Unknown rather than showing a green check, because a green
check here reads as permission to size up. An EVM token has no mint or freeze
authority to revoke in the first place, so on those chains the panel reports no
audit rather than inventing a clean one.

**Memecoin Sniper** is the second layout, for working launches: the New and
Graduating columns stay on screen beside the chart, the flow strip and the
ticket, so the two columns that decide the entry are still visible while the
order goes in.

## Where the data comes from

No Pairlens server is involved. Every request goes out from your own browser to
a keyless public API, which means each user spends their own rate-limit budget
rather than competing for one server's.

**New, Graduating and Graduated** come from Jupiter. The primary feed publishes
bonding-curve completion computed by the venue that runs the curve. If it stops
answering, the board falls back to Jupiter's published token API and
reconstructs the percentage from market cap against the curve's own formula,
which lands within a fraction of a point in the middle of the curve and can
drift a couple near the top. A reconstructed number is marked with a tilde
(`~96%`) so you always know which one you are reading.

**Legendary** comes from CoinGecko's meme-token category. Market cap comes from
there rather than from a DEX because DEX-reported market cap is unreliable at
the top end: measured on a live pair, one venue reported BONK's market cap as
over a trillion dollars.

**One token**, for the three trade-board panes, comes from Jupiter on Solana
and from DexScreener everywhere else. The split is what the board's own reach
forces: Legendary rows open on whichever of six chains the coin trades deepest
on, and Jupiter is a Solana token API. DexScreener answers for every chain the
terminal routes, sums liquidity, volume and the trade counts across a token's
pools, and quotes price, market cap and the percentage move from the deepest
one. It publishes no holders and no audit, which is why those read as unknown
there. It is also Solana's backstop, for a mint Jupiter has never indexed.

The launchpads' own APIs are not usable from a browser. pump.fun's endpoint
refuses any origin but its own, so a client-side board cannot read it at all.

Both columns cache their last answer locally, so re-opening the board paints
immediately and then refreshes, and a throttled feed leaves the previous list
on screen rather than emptying the column.

### Swapping the feed

The board reads its data through a plugin capability, `market-data:launchpad`,
not through a hardcoded fetch. The bundled **Memecoin Feed** plugin serves it
keylessly at priority 5. Any plugin declaring the same capability at a lower
priority number wins resolution and serves the same rows, with no pane
changing. That is the upgrade path if you want a paid feed behind the board.

## Trading one

Memecoin orders take the identical path as any other on-chain swap: the same
Jupiter connector, the same wallet, the same risk guardrails, the same
confirmation. See [DEX and wallets](/docs/dex-trading) for the wallet setup and
[risk guardrails](/docs/risk-guardrails) for the limits that apply.

A memecoin's identity is its chain and its mint address, never its ticker. Six
tokens on the board can be called TIMBOTHY and be six different mints. The URL
carries the address for that reason, and so does everything the board pins.

## Turning it off

Memecoins are a plugin family. Uninstalling **Pairlens Memecoins** from the
Plugin Store removes the Discovery tab, the workspaces and the panes;
uninstalling **Memecoin Feed** removes the data. A deployment can drop the
whole class at build time with `VITE_PAIRLENS_DISABLED_FAMILIES=memes`, and
nothing about the class is seeded, installed or listed.
