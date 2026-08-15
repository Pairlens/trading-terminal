---
title: Place an order
description: The order ticket, market and limit orders, bracket orders built from a workflow, US stock hours and fractional shares, and how the assistant proposes trades you approve.
group: traders
parent: trading
order: 2
eyebrow: For traders
updated: 16 AUG 2026
readTime: 7 min read
---

The Trade Entry panel is the order ticket. Add it to any workspace, or use a
workspace preset that already has one. It binds to the active pair and to
whichever account you select.

## The ticket

**Buy and Sell.** Two tabs at the top. The whole ticket recolours so you can
never be in doubt which side you are on.

**Order type.** Market, Limit, and on centralized venues, Workflow.

**Amount.** Type a size, or click the denomination badge to switch between
quoting the size in the base asset (0.05 BTC) and the quote asset (2,000
USDT). Your available balance for the current side is shown right above the
field.

**Presets.** On the buy side, a row of one-click amounts. They are yours to
configure with the gear button, so if you always ladder in at 250 / 500 / 1000
you can make that the row.

**Sell percentage.** On the sell side, a slider plus 25 / 50 / 75 / 100 buttons
that size the order off what you actually hold.

**Press and hold to submit.** There is no separate confirmation dialog for
orders you place yourself. The submit button is a hold-to-confirm control, and
it holds longer for live funds than for paper. The mode badge on the button
reads **PAPER**, **ON-CHAIN**, or nothing at all for a live CEX order, so the
last thing you look at before committing tells you what kind of money is at
stake.

If you would rather not wait through the hold, switch the gesture to a single
click in Settings, Risk Management, under Order confirmation. It applies to
this ticket and to the assistant's order cards, and the note under the button
tells you which gesture is live. Risk limits are enforced the same either way.

## Market and limit

**Market** fills immediately at the best available price. Fast, and on a thin
book, expensive. Turn on bid and ask lines in the
[chart toolbar](/docs/chart-panel) to see the spread you are about to cross.

**Limit** rests at your price until it fills or you cancel it. The price field
prefills with the best ask when buying and the best bid when selling, updating
live, so an aggressive limit is one keystroke away from a passive one.

## Bracket orders through a workflow

The third order type, **Workflow**, is how you place an entry with a
take-profit and stop-loss attached. Build the chain once on the
[Workflows](/docs/build-a-workflow) canvas, then select it in the ticket and
run it. The workflow's entry step places the order and its Take Profit and Stop
Loss steps arm against the fill.

If a step is not supported at the selected venue, the ticket says so before you
run anything, naming the step and the reason. Stop-losses in particular need
exchange-native trigger orders. On a venue without them, Pairlens refuses to
place a fake stop rather than quietly resting a limit order that would fill
immediately at the wrong price.

## On-chain swaps

For a DEX market the ticket swaps the venue-specific bits: no Workflow tab, and
a **Slippage** row with 0.1%, 0.5%, 1%, and 3% presets for market swaps. Limit
orders, where the chain supports them, rest at your price and do not need a
slippage tolerance. See [DEX and wallets](/docs/dex-trading).

## US stocks

Stocks trade on a schedule, so the ticket behaves a little differently on
Alpaca.

Orders placed outside regular market hours, 9:30am to 4:00pm Eastern on trading
days, are accepted and queued for the next open rather than filled on the spot.
They show up in Positions as live orders in the meantime, and a market order
placed on a Friday evening sits until Monday morning.

### Extended hours

To trade before the open or after the close instead of waiting for it, switch
the ticket to **Limit** and turn on **Extended hours**. The order then works
the pre-market session from 4:00am and the after-hours session through 8:00pm
Eastern. The toggle appears only on stock venues and only for limit orders. It
stays on while you keep placing limit orders, clears the moment you switch to
Market or Workflow, and is never carried over to your next session: those
sessions are thin and spreads are wider, so routing into them should be a
choice you still remember making, not one inherited from last night.

Only limit orders are eligible. A market order has no continuous auction to
fill against out of session, and stops and take-profits are not accepted at
all, so the ticket refuses those combinations up front and tells you which one
to change rather than sending an order the venue will bounce.

Fractional shares work, and the percentage buttons in the ticket produce them
routinely: selling 25% of a 7 share position is 1.75 shares. Alpaca accepts
fractional quantities on market and limit orders only, and only for the current
session, so a fractional limit order rests for the day instead of resting
indefinitely. Stops and take-profits are the exception. Those need a whole
number of shares, because the fractional version could only ever be a day
order, and a stop-loss that quietly expires at the closing bell is worse than
no stop at all. The ticket says so and asks you to round the size rather than
placing one.

You can also size a market order in dollars instead of shares by switching the
size field to USD, which is how you buy $500 of a stock trading at $305.

## Event contracts

For a prediction-market outcome the ticket switches to contracts. The question
replaces the ticker at the top, sizes are whole contracts rather than an amount
of an asset, prices are typed in cents, and a max loss line above the submit
button says what the order can cost you. When the question has exactly one other
side, a switch beside it flips the whole ticket to that outcome. There is no
Workflow tab, because neither prediction venue has trigger orders, and Kalshi
offers Limit only. See [prediction markets](/docs/prediction-markets).

## Perpetual futures

For a perpetual the ticket grows a leverage row and a reduce-only toggle, and
sizes in contracts rather than in the base asset. Under the size field it shows
what the count is worth in the base asset on venues whose contract is a
fraction of it, and above the submit button it shows the notional and an
estimated liquidation price. Leverage is applied per order and never remembered
between sessions. Reduce-only shrinks an open position and refuses to open the
opposite side, which is what makes closing safe. See
[perpetual futures](/docs/cex-futures).

## Watching the order

Add the **Positions** panel and you get three tabs: **Positions** for what you
hold with entry price, mark price, and P&L; **Orders** for anything still
resting, with a cancel button; and **Fills** for your trade history with fees.
The **Portfolio** panel shows holdings and allocation across the account.

## Assistant proposals

The [assistant](/docs/ai-copilot) can propose a trade from wherever you keep
it. It fills a card in the chat showing the pair, side, size, and limit
price, along with its reasoning, and nothing happens until you confirm. The card
lets you choose paper or live at the moment of approval, with paper preselected.
Spot, perpetual and prediction-market orders all work this way.

If you tick **Don't ask again**, that becomes a standing grant: paper trades
across the board, or live trades on that one exchange. You can see and revoke
every grant in **Settings → Risk Management**, under AI trade permissions. Even
an auto-approved order is still validated against your
[risk guardrails](/docs/risk-guardrails). Read
[the assistant](/docs/ai-copilot) before you turn live auto-approval on.

## Every route ends the same way

Manual ticket, workflow, bot, or assistant proposal: all four converge on the
same guarded order path. Guardrails are checked there, once, so there is no
route that skips them.
