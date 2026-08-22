---
title: The order book
description: 'What an order book actually is, how bids and asks meet in the middle, and how to read the Pairlens book: grouping, size versus value, the depth bars, the spread, and the pressure gauge.'
group: traders
parent: market-data
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 9 min read
---

## What an order book is

A market is not a price. It is a crowd of people announcing what they are
willing to do.

Some of them want to buy. Each one names a price they are happy to pay and how
much they want. Some of them want to sell, and each names a price they will
accept. Nobody is forced to trade at any particular number, so all these offers
just sit there, waiting.

The exchange stacks them up. Buy offers, called **bids**, are sorted with the
most generous buyer first, because that is the best deal for anyone wanting to
sell. Sell offers, called **asks** or **offers**, are sorted with the cheapest
seller first, for the same reason. The two stacks face each other:

```
    ASKS (people selling)     cheapest seller at the bottom
       $70,120   0.8 BTC
       $70,110   1.2 BTC
       $70,105   0.4 BTC   ← best ask
    ─────────────────────   the spread
       $70,100   0.6 BTC   ← best bid
       $70,095   2.1 BTC
       $70,090   0.9 BTC
    BIDS (people buying)      most generous buyer at the top
```

The best bid and the best ask meet in the middle. They never cross: if a buyer
were ever willing to pay more than a seller was asking, those two would trade
immediately and both offers would vanish from the book. That is exactly what a
trade is. The gap left between them is called the **spread**.

This whole structure is the order book, and Pairlens shows it live.

## Why you should care

The chart tells you where price has been. The book tells you what it would cost
to move right now.

If you want to buy 5 BTC and the cheapest seller only has 0.4 available, you
take their 0.4, then the next seller's, then the next, walking up the ladder and
paying more each step. That is **slippage**, and it is real money. A thick book
means you barely notice. A thin one means your own order moves the price against
you.

Reading the book is how you find that out before you pay for it.

## The three columns

| Column           | What it holds                                             |
| ---------------- | --------------------------------------------------------- |
| **Price**        | The price level, green for bids and red for asks          |
| **Size / Value** | How much is waiting at that price, in your chosen reading |
| **Total**        | Everything from the best price down to this level         |

Asks are above the spread, bids below, exactly like the diagram.

### Size or Value

The middle heading is also a switch. Click it and the whole book flips between
two ways of measuring the same offers:

**Size** counts the asset itself. On BTC-USDT that means BTC. A row reading
`1.2` is someone offering 1.2 Bitcoin.

**Value** counts the money. That same row reads roughly `$84,000`.

**Value is usually what you want.** Compare two walls: 40,000,000 DOGE and 3
BTC. Which is bigger? In Size, the DOGE row looks enormous and the BTC row looks
like nothing. In Value they are about $8m and about $210,000, and the answer
flips. Size is only comparable inside a single market. Value is comparable
anywhere.

Your choice sticks. It survives a reload, and every other book panel, window and
your phone all follow it.

## Price grouping

Exchanges quote in tiny increments. Binance will happily list Bitcoin bids one
cent apart, which means twenty rows of book covers twenty cents of a seventy
thousand dollar asset. Technically accurate, completely useless.

**Grouping** merges neighbouring prices into buckets so the ladder spans a range
you might actually trade through. Set grouping to $10 and every offer between
$70,100 and $70,110 becomes one row. You lose the penny detail and gain the
shape of the market.

The selector sits in the top right and offers clean steps: 0.01, 0.02, 0.05,
0.1, and so on up.

**Auto is the default and it re-fits itself.** It picks the coarsest bucket that
still fills the rows you can see, and it re-measures when you change venue,
change pair, or resize the panel. Pick a value by hand and it stays pinned until
you change pair.

Prediction contracts get their own ladder, because a contract priced between 0
and $1 has nowhere to go: bucketing a one-dollar range into fifty-cent rows
gives you two rows, not a coarser view. Those books group in cents instead.

## When a side is empty

On an ordinary market, a missing side means the feed is broken. On a
[prediction market](/docs/prediction-markets) it is completely normal, so the
panel says which it is instead of drawing a blank half.

Nobody offers to sell a contract that has already been won, and nobody bids for
one that has already lost. A contract trading at 99.9¢ has bids and no asks. The
panel prints **No asks** or **No bids** with a line explaining that nobody is
quoting that side.

There is no hidden liquidity on the other ticker either. A venue's Yes and No
books mirror each other exactly: a 225-contract Yes ask at 21.7¢ _is_ the
225-contract No bid at 78.3¢. If a side is empty, it is empty.

## Reading the bars

Every row has a horizontal bar behind it, and it encodes two different things at
once.

**Length is cumulative.** It grows as you move away from the spread, because it
represents everything stacked between the best price and this row. A long bar
close to the spread means there is a lot of size packed in near the current
price.

**Colour intensity is that row's own amount.** One bright row in a run of dim
ones is a level holding far more than its neighbours. That is a **wall**, and it
is the thing your eye should catch. Walls sometimes act as resistance, because
price has to chew through all that size to get past. They also sometimes vanish
the moment price approaches, which brings us to the honest caveat below.

Both sides are scaled against one shared reference, so a bid and an ask of equal
size look identical. Otherwise the panel would quietly lie about which side is
heavier.

## The spread row

Between the two sides sits the spread: the gap between best bid and best ask, in
dollars and as a percentage.

**The percentage is the number to watch.** It is the immediate cost of changing
your mind. Buy at the ask and sell straight back at the bid, and the spread is
what you lost for the privilege.

It is also the fastest way to compare venues without knowing anything about the
asset. A pair quoting 0.005% is deep and liquid. The same pair quoting 0.4%
somewhere thin will cost you that difference on the way in and again on the way
out, which is usually more than any fee discount you were chasing.

## The buy-sell pressure gauge

The bar across the bottom splits the total bid depth against the total ask
depth, as percentages. Green is buyers, red is sellers.

It looks like a crystal ball. It is not. Read it with two caveats.

**It only counts what is on screen.** It sums the rows currently rendered, which
depends on your grouping and how tall you dragged the panel. Widen the grouping
and the number changes, because you are now measuring a wider slice of the book.
It reads pressure near the current price, not across the whole market.

**Resting orders are not promises.** Anyone can place an order and cancel it a
second later, and some traders do exactly that to make a market look one-sided.
The practice is called **spoofing**. A book leaning heavily one way that never
actually trades in that direction is telling you something, but not what it
appears to be telling you.

Cross-check against [the tape](/docs/time-and-sales). The tape is a record of
trades that already happened, which is the one thing nobody can fake.

## Venue and pair binding

The panel follows your workspace's active pair unless you pin it. When it is
quoting a different exchange from the chart, a footer names that venue, so a
layout with four books does not require you to remember which is which.

Stream health is not shown per panel. The connection dot in the pair header owns
that, because it is the one place that can tell "streaming" apart from
"stalled". See
[troubleshooting](/docs/troubleshooting#market-data-looks-frozen).

## Why US stock books are one row deep

Open a stock and the book looks nearly empty. That is the data, not a bug.

The free market-data plan from Alpaca carries the IEX feed, which publishes only
the single best bid and single best offer. There is no depth behind it to group,
so the cumulative bars and the pressure gauge have almost nothing to work with.
Outside market hours it thins further, often carrying a bid with no matching
offer until the next open.

The chart keeps updating in that window because trades still print. The book
just sits on one side. See [US equities](/docs/equities).

## On mobile

The [mobile terminal](/docs/mobile-terminal) carries the same book. The Trade
tab compresses it to a single live row above the ticket, and the full ladder is
its own screen with the same grouping and the same Size and Value switch.

## Where to next

- [Time and sales](/docs/time-and-sales) for the other half of the reading
- [Depth and liquidity](/docs/depth-and-liquidity) to see slippage as a curve
- [Place an order](/docs/place-an-order) to act on what you are seeing
