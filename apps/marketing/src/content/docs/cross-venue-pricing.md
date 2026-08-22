---
title: Cross-venue pricing
description: The same asset trades at a different price on every exchange. The Multi-Price panel shows all of them at once, ranked, with an honest note about why the gap is harder to capture than it looks.
group: traders
parent: market-data
order: 4
eyebrow: For traders
updated: 22 AUG 2026
readTime: 5 min read
---

## Why one asset has many prices

There is no single price for Bitcoin. Each exchange runs its own separate market
with its own buyers and sellers, and those markets settle at slightly different
numbers. Usually the gap is tiny, because traders who move money between
exchanges close it for profit. Sometimes, especially on thin venues or during
fast moves, it is not tiny at all.

That matters to you in two ways. If you are buying, one exchange is cheaper
right now. And if the gaps are wide, this asset's liquidity is fragmented, which
tells you something about how easily you will get out later.

The Multi-Price panel quotes your active pair on every exchange your connectors
can reach, sorted so the answer is the top row.

## The board

| Column      | What it holds                                          |
| ----------- | ------------------------------------------------------ |
| **Venue**   | The exchange, with a status badge where it matters     |
| **Price**   | That exchange's live price                             |
| **vs best** | How much more it costs than the cheapest, as a percent |
| **24h**     | That exchange's own 24-hour change                     |

Narrow the panel and the last two columns drop. The badges already tell you the
same story qualitatively.

## Switching exchange from the board

Click any row to move there. The chart re-streams from that exchange's market,
the book follows, and the order ticket points at it.

The address bar changes too, so a link you share afterwards opens on the
exchange you were reading rather than whichever one the reader happens to
prefer. Flicking through five exchanges does not leave five entries in your back
history.

If the panel has been pinned to its own pair rather than following your chart,
clicking a row moves that panel instead. Two kinds of row do not move anything,
because there is nowhere to go: an exchange that does not list the pair, and one
that needs the desktop app.

## How rows are ranked

Live prices first, cheapest at the top. Then quotes that have gone stale, then
exchanges still connecting, then the ones that plainly do not list the pair. The
part of the board you can act on is always at the top.

**A stale quote never gets crowned "Best".** A thin exchange that last printed
ninety seconds ago is worth seeing, and its number is real, but calling it the
cheapest reads as a recommendation and that price may no longer exist. This is
not hypothetical: a thin Bitcoin market once sat apparently best at 64,352 while
every live exchange was trading 64,8xx.

## The badges

| Badge          | Meaning                                               |
| -------------- | ----------------------------------------------------- |
| **Best**       | Cheapest live price on the board                      |
| **High**       | Most expensive live price on the board                |
| **Stale**      | This exchange has stopped publishing recently enough  |
| **Delayed**    | The feed is behind                                    |
| **No prints**  | Connected, but nothing is trading                     |
| **Desktop**    | This venue needs the [desktop app](/docs/desktop-app) |
| **Not listed** | This exchange does not carry the pair                 |

Some exchanges refuse connections from web pages entirely, so in the browser
terminal they show a Desktop badge rather than an empty row. See
[connectors](/docs/connectors).

## The spread strip, and why it is not free money

When two exchanges both publish a real book, a strip above the board names the
cheapest place to buy, the dearest place to sell, and the gap between them as a
percentage.

Every new trader sees that number and thinks: buy there, sell here, repeat.

**It is a gross figure, and the panel says so twice.** What is not in it: trading
fees on both sides, withdrawal fees, the time it takes to move funds between
exchanges (during which the gap can close or invert), and the fact that the
quoted price only covers the top of each book. Any one of those is routinely
larger than the gap itself.

Real cross-exchange arbitrage is done by desks that already hold inventory on
both sides, so they never need to move anything. Treat the strip as a measure of
how fragmented this asset is, which is genuinely useful, rather than a trade you
can lift.

## A note on where the quotes come from

Most exchanges publish their best bid and ask alongside the last price. Three do
not (ByBit, MEXC and Upbit send 24-hour statistics with no quote in them), so for
those the panel opens their order book and reads the top of it. A row that still
has nothing to quote after that says `no book quoted` rather than shimmering
forever.

On-chain rows are different: decentralized exchanges have no bid and ask in the
usual sense, so a DEX row is a last price only, and it cannot take part in the
spread strip.

## Only comparable markets

The panel only quotes exchanges trading the same kind of instrument. Comparing a
Solana pool against Kraken's spot book would be comparing two different things
that happen to share a ticker, so it does not. A pair with nothing comparable
says so instead of showing an empty board.

## Sort and pause

The header carries a sort toggle between price order and exchange order, and a
pause button. Pause freezes the board, which is what you want when you are
reading a row rather than watching one.

## Try it as a workspace

The [Workspace Store](/docs/workspaces#the-workspace-store) ships a Cross-Venue
Desk template with this board next to a chart and an order ticket. It is the
fastest way to see what the panel is for.

## Where to next

- [Market discovery](/docs/market-discovery) to find the pair in the first place
- [Connect an exchange](/docs/connect-an-exchange) to widen what the board covers
- [Connectors](/docs/connectors) for what each exchange supports
