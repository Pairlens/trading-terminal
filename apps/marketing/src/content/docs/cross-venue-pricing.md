---
title: Cross-venue pricing
description: The Multi-Price panel quotes the active pair on every venue that lists it, ranked by price, with a gross executable spread and the caveats that make it honest.
group: traders
parent: market-data
order: 4
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

A single chart cannot answer "where is this cheapest right now". The Multi-Price
panel quotes the active pair on every venue your connectors can reach, sorted so
the answer is the top row.

## The board

| Column      | What it holds                                          |
| ----------- | ------------------------------------------------------ |
| **Venue**   | The exchange, with a status badge where it matters     |
| **Price**   | That venue's live quote                                |
| **vs best** | The premium over the cheapest live quote, as a percent |
| **24h**     | That venue's own 24-hour change                        |

The panel is width-aware: venue and price are the floor, the premium column
joins at around 16rem and the 24-hour column at 24rem. Everything past the floor
is a comparison the badges already make qualitatively, so dropping a column
costs emphasis rather than meaning.

## Switching venue from the board

Click any row to move to that venue. Both this panel and the compact
**Venue Ladder** do it, and what moves depends on which pair the panel is
showing.

On a pair page the click is a navigation: the address becomes
`/spot/kraken/BTC-USDT`, the chart re-streams from the new tape, and the book
and the ticket follow it. That is deliberate: the venue is part of the address,
so a link you share afterwards opens on the venue you were reading rather than
on whichever one the reader happens to prefer. The switch replaces the address
instead of stacking on it, so flicking through five venues on one pair does not
leave five entries to walk back out of.

On a board where the panel holds its own pair, either as a pane override or
bound to a workspace variable, the click moves that pair instead. An override
moves this panel alone; a bound variable moves every panel bound to it, which is
how a chart beside the board follows along.

Two kinds of row do not move anything, because there is nothing to move to: a
venue that does not list the pair, and a connector that needs the desktop app.

## How rows are ranked

Live prices first, cheapest at the top. Then quotes that have gone stale, then
venues still connecting, then the definite "not listed here" answers. The
actionable part of the board is always the top of it.

**Stale quotes get a row but never rank.** A thin venue that last printed ninety
seconds ago is worth seeing, and the number is real. Crowning it "Best" is not,
because the cheapest price on the board reads as a recommendation and that fill
may no longer exist. This was measured on BTC-USDT, where a thin USDT book sat
apparently best at 64,352 while every live venue traded 64,8xx.

## The badges

| Badge          | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| **Best**       | Cheapest live quote on the board                         |
| **High**       | Dearest live quote on the board                          |
| **Stale**      | The venue has stopped publishing recently enough to rank |
| **Delayed**    | The feed is behind                                       |
| **No prints**  | Connected, but nothing is trading                        |
| **Desktop**    | This venue needs the [desktop app](/docs/desktop-app)    |
| **Not listed** | This venue does not carry the pair                       |

Five connectors cannot run in a browser at all, because their REST endpoints
send no CORS headers. In the hosted web terminal those venues show a Desktop
badge rather than a dead row. See [connectors](/docs/connectors).

## The executable spread strip

When two venues both publish a real book, a strip above the board names the
cheapest ask and the dearest bid and the gross gap between them, as a
percentage: buy on one, sell on the other.

**It is gross, and the panel says so in two places.** The tooltip on the strip
and the footer on the panel both spell out what is not in that number: exchange
fees on both legs, withdrawal costs, transfer time between venues, and depth
past the top of the book. Any one of those is routinely larger than the gap you
are looking at.

Treat the strip as a measure of how fragmented this asset's liquidity is, which
is genuinely useful, rather than as a trade you can lift. Real cross-venue
execution needs inventory already sitting on both sides.

## Only comparable venues

Venues are only quoted when they share an asset class with the charted one.
Quoting a Solana pool against Kraken's spot book would be comparing two
different instruments that happen to share a ticker, so the panel does not.
A pair with no comparable venue says so instead of showing an empty board.

## Sort and pause

The header carries two controls: a sort toggle between price order and venue
order, and a pause. Pausing freezes the board where it is, which is what you
want when you are reading a row rather than watching one.

## Why this beats one panel per venue

The panel takes bulk ticker snapshots per venue rather than opening a stream per
row, which is also how it detects which venues actually list the pair. Fanning
individual ticker subscriptions across a dozen venues is the naive version and
it is much heavier for a strictly worse result.

One caveat on DEX rows: on-chain data providers do not publish a real bid and
ask, so a DEX quote on this board is a last price, not a two-sided book. It
cannot participate in the executable spread strip.

## The Cross-Venue Desk

The [Workspace Store](/docs/workspaces#the-workspace-store) ships a template
built around this panel, with the board next to a chart and an order ticket. It
is the fastest way to see what the panel is for.

## Where to next

- [Market discovery](/docs/market-discovery) to find the pair in the first place
- [Connect an exchange](/docs/connect-an-exchange) to add venues to the board
- [Connectors](/docs/connectors) for what each venue supports
