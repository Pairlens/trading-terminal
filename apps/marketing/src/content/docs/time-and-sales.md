---
title: Time and sales
description: The tape is the record of trades that already happened. What the side column really means, how to spot one big order walking the book, and why the tape is the one panel nobody can fake.
group: traders
parent: market-data
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

## What the tape is

Every time a buyer and a seller agree, the exchange announces it: the price, the
size, the moment. That stream of announcements is the **tape**, and traders have
been reading it since it literally came out of a ticker-tape machine.

The Trades panel is that stream, newest at the top. One row, one trade that
actually happened.

This is the tape's whole value. The [order book](/docs/order-book) shows offers
that can be cancelled a second later. The tape shows money that has already
changed hands. Nothing on it can be withdrawn or faked.

## The four columns

| Column    | What it holds                                        |
| --------- | ---------------------------------------------------- |
| **Side**  | Which side was the aggressor, as an arrow and a word |
| **Price** | What it traded at                                    |
| **Size**  | How much, in the asset itself                        |
| **Value** | The same trade in money                              |

Narrow the panel and it drops columns rather than squashing them: Value goes
first, then the word beside the side arrow.

### The side column is more subtle than it looks

Every trade has a buyer and a seller. So what does a green row mean?

It means the **aggressor** was a buyer. Somebody had a sell order sitting
patiently in the book, and a buyer came along and took it, paying the seller's
asking price to get filled immediately.

That distinction is the whole point. The patient side is not moving price. The
impatient side is. A run of green rows means buyers are reaching up and paying
sellers' prices, which is how price rises.

Exchanges do not all report this the same way (Coinbase publishes the patient
side, the opposite convention), so Pairlens normalises it. Every tape reads the
same way here regardless of which exchange it came from.

## Sorting

Every heading sorts. Click once for that column's natural direction, click again
to flip it. Time descending is the default, which is the tape's own order.

Size and Value open descending, because the question behind clicking them is
"what were the big trades", not "what was the dust". Side opens ascending, so
buys group together.

Your choice sticks across a reload.

## Size intensity

Rows are tinted by how large the trade is compared to the other trades currently
on screen.

That comparison is deliberately relative. A 2 BTC print is enormous on a
micro-cap and unremarkable on Bitcoin, so "big" here means big for this market,
right now. Switch from BTC to a small token and the tinting recalibrates itself.

One consequence: a quiet market still shows bright rows, because the yardstick
falls with it. Bright means "bigger than what else is happening", not "big in
dollars".

## What to actually read

**Compare prints against the book.** Put the tape next to the
[order book](/docs/order-book) and watch where trades land relative to the best
bid and ask. This is the highest-value reading on the panel.

A run of green prints hitting the ask, while the ask keeps stepping higher, is
genuine demand eating through supply. The same green prints hitting the _same_
price over and over, with the level never lifting, is a big seller quietly
absorbing every buyer who shows up. Both look like buying. Only one of them is
going anywhere.

**Watch for clusters.** One large print is one trader. Twenty medium prints in
the same second at climbing prices is usually a single big order walking up the
book, taking each level as it goes. The walk is the information, and it is often
the start of something.

**Watch the disagreements.** A heavy stack of bids under a tape printing sell
after sell means that stack is not being defended, it is being fed into. A thin
book under aggressive buying means the next trade can gap. The order book and
the tape contradicting each other is exactly when you learn something, which is
why the two panels ship side by side in the default layouts.

## Venue coverage

Thirteen of the fourteen crypto exchanges publish a trade feed. MEXC does not,
and the panel says so plainly rather than spinning forever, naming the venue and
suggesting you switch. See [connectors](/docs/connectors).

If the pair simply is not listed on the exchange you pinned, the panel says that
instead, which is a different problem with a different fix.

## A note on speed

A busy market can print dozens of trades a second. The panel keeps up and stays
readable, and unlike the other market panels it is never slowed down by the
[Data Rate](/docs/settings#data-rate) setting. A tape with trades removed from
it is a different instrument, not a cheaper one.

## Where to next

- [The order book](/docs/order-book) for the waiting side of the same market
- [Depth and liquidity](/docs/depth-and-liquidity) for where levels actually hold
- [Place an order](/docs/place-an-order) to act on what the tape is showing
