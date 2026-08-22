---
title: Place an order
description: Market versus limit explained with numbers, how to size a trade, and everything on the Pairlens order ticket, including how it changes for stocks, perpetuals, on-chain swaps, predictions and NFTs.
group: traders
parent: trading
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 9 min read
---

## The two orders that matter

Almost every trade you will ever place is one of two things.

**A market order says: get me in now, at whatever it costs.** It takes the best
prices currently available in the [order book](/docs/order-book) and fills
immediately. You are guaranteed to trade. You are not guaranteed a price.

**A limit order says: get me in at this price or better, and wait.** It sits in
the book until someone trades against it. You are guaranteed a price. You are
not guaranteed to trade at all.

A worked example. Bitcoin's best ask is $70,105 and there is 0.4 BTC there,
with the next 1.2 BTC at $70,110.

- A market order for 0.5 BTC takes all 0.4 at $70,105 and 0.1 at $70,110. You
  paid an average of about $70,106. Done in a second.
- A limit order for 0.5 BTC at $70,100 sits there. If sellers come down to you,
  you save $6 per coin. If price runs away upward, you own nothing and you watch
  it go.

**Which to use.** Market when getting in or out matters more than the price:
closing a losing position, reacting to news, or trading something so liquid the
spread is negligible. Limit when the price matters more than the certainty:
building a position patiently, or on any market where the spread is wide. On a
thin market a market order can cost you far more than any fee.

Most exchanges also charge less for limit orders that rest in the book, because
you are providing liquidity rather than taking it.

## Sizing

Before the mechanics, one sentence: decide your size from your stop, not from
your confidence. The arithmetic is in [risk guardrails](/docs/risk-guardrails),
and the terminal will enforce whatever caps you set there before this ticket
sends anything.

## The ticket

The Trade Entry panel is the order ticket. Add it to any workspace, or use a
preset that already has one. It follows your active pair and whichever account
you select.

**Buy and Sell.** Two tabs at the top. The whole ticket recolours, so you can
never be in doubt which side you are on.

**Order type.** Market, Limit, and on centralized exchanges, Workflow.

**Amount.** Type a size, or click the badge beside the field to switch between
quoting the size in the asset (0.05 BTC) and in money (2,000 USDT). Your
available balance for the current side is shown right above.

**Presets.** On the buy side, a row of one-click amounts. Configure them with
the gear button, so if you always ladder in at 250 / 500 / 1000 you can make
that the row.

**Sell percentage.** On the sell side, a slider plus 25 / 50 / 75 / 100 buttons
that size the order from what you actually hold.

**Press and hold to submit.** There is no separate confirmation dialog. The
submit button is a hold-to-confirm control, and it holds longer for real money
than for practice. The badge on it reads **PAPER**, **ON-CHAIN**, or nothing at
all for a live exchange order, so the last thing you look at before committing
tells you what kind of money is at stake.

If the hold is in your way, switch it to a single click in **Settings → Risk
Management**. The note under the button always says which is in force. Your risk
limits apply identically either way.

The limit price field prefills with the best available price and updates live,
so an aggressive limit is one keystroke away from a patient one.

## Bracket orders

A bracket is an entry with a take-profit and a stop-loss attached to it. Get in
here, get out at either of these two prices, whichever comes first. It is the
single most useful order structure in trading, because it decides your exit
while you are still calm.

In Pairlens the third order type, **Workflow**, is how you place one. Build the
chain once on the [Workflows](/docs/build-a-workflow) canvas, then select it in
the ticket and run it. The entry step places the order and the take-profit and
stop-loss steps arm against the fill.

If a step is not supported at your exchange, the ticket tells you before you run
anything, naming the step and the reason. Stop-losses in particular need the
exchange to support trigger orders natively. Where it does not, Pairlens refuses
to place a fake stop rather than quietly resting a limit order that would fill
immediately at completely the wrong price.

## How the ticket changes per market

### On-chain swaps

No Workflow tab, and a **Slippage** row with 0.1%, 0.5%, 1% and 3% presets.
Slippage tolerance is the worst price you will accept: on-chain your trade takes
time to confirm, and the price can move in between. Too tight and the swap
fails; too loose and you can be sandwiched by a bot. Limit orders, where the
chain supports them, do not need it. See [DEX and wallets](/docs/dex-trading).

### US stocks

Stocks trade on a schedule, so the ticket behaves differently on Alpaca.

Orders placed outside market hours are accepted and queued for the next open
rather than filled on the spot. They appear in Positions as live orders in the
meantime, so a Friday evening order sits until Monday morning. Market holidays
and half days come from the broker's own calendar, so they are correct.

**Outside regular hours the ticket goes limit-only.** Market and Workflow are
disabled with a line saying why: those sessions have no continuous auction for a
market order to fill against.

To trade the pre-market or after-hours session instead of waiting for the open,
leave **Extended hours** on. It turns itself on during those sessions and is one
tap to clear. It never carries over to another pair or another day, deliberately:
those sessions are thin and spreads are wide, so trading them should be a choice
you remember making.

**Fractional shares work**, and the percentage buttons produce them routinely:
selling 25% of a 7-share position is 1.75 shares. You can also size in dollars
rather than shares, which is how you buy $500 of a stock trading at $305.

One exception: stops and take-profits need whole shares. A fractional one could
only ever be a same-day order, and a stop-loss that quietly expires at the
closing bell is worse than no stop at all. The ticket asks you to round rather
than placing one. See [US equities](/docs/equities).

### Prediction contracts

The ticket switches to probabilities. The question replaces the ticker, with its
resolution date beside it. You size in dollars and the ticket converts that into
contracts. Prices are typed in cents.

Above the submit button, a payout card states what the trade returns if you are
right, with max payout, max loss and average fill price. Where the question has
exactly one other side, a switch flips the whole ticket to it; on a race, the
other runners are listed instead.

There is no Workflow tab, because neither prediction venue offers trigger
orders. See [prediction markets](/docs/prediction-markets).

### Perpetual futures

The ticket grows a leverage row and a reduce-only toggle, and sizes in contracts
rather than in the asset. Under the size field it shows what those contracts are
worth, and above the submit button it shows your total exposure and an estimated
liquidation price.

Leverage is set per order and never remembered between sessions, which is
deliberate. **Reduce-only** shrinks an open position and refuses to open the
opposite side, which is what makes closing safe. See
[perpetual futures](/docs/cex-futures).

### NFT collections

Four intents, each printing the ordinary order it really is right under the
tabs. **Sweep N** is a market buy of the N cheapest listings. **Make offer** is
a limit buy across the whole collection. **List item** is a limit sell of a
token you own. **Accept bid** is a market sell into the best standing offer.

Sizes are whole numbers, because an NFT is indivisible. A sweep is priced off
the actual ladder rather than off the floor, so five items when the floor is one
listing deep costs the sum of five asks, not five times the floor. See
[NFT collections](/docs/nft-trading).

## Watching the order

Add the **Positions** panel for three tabs: **Positions** for what you hold with
entry price and profit and loss, **Orders** for anything still waiting with a
cancel button, and **Fills** for your trade history including fees. See
[positions and portfolio](/docs/positions-and-portfolio).

## Orders the assistant proposes

The [assistant](/docs/ai-copilot) can draft a trade. It arrives as a card in the
chat showing the pair, side, size and price along with its reasoning, and
nothing happens until you confirm. The card lets you pick paper or live at the
moment of approval, with paper preselected.

Ticking **Don't ask again** creates a standing grant: practice trades
everywhere, or live trades on that one exchange. Every grant is listed and
revocable in **Settings → Risk Management**. Even an auto-approved order is
still checked against your [risk guardrails](/docs/risk-guardrails).

## Every route ends the same way

Manual ticket, workflow, bot, or AI proposal: all four converge on the same
guarded path, where your limits are checked once. There is no route that skips
them.
