---
title: Place an order
description: The order ticket, market and limit orders, bracket orders built from a workflow, and how the co-pilot proposes trades you approve.
group: traders
parent: trading
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
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

## Watching the order

Add the **Positions** panel and you get three tabs: **Positions** for what you
hold with entry price, mark price, and P&L; **Orders** for anything still
resting, with a cancel button; and **Fills** for your trade history with fees.
The **Portfolio** panel shows holdings and allocation across the account.

## Co-pilot proposals

The AI can propose a trade. It fills a card in the chat showing the pair, side,
size, and limit price, along with its reasoning, and nothing happens until you
confirm. The card lets you choose paper or live at the moment of approval, with
paper preselected.

If you tick **Don't ask again**, that becomes a standing grant: paper trades
across the board, or live trades on that one exchange. You can see and revoke
every grant in **Settings → Risk Management**, under AI trade permissions. Even
an auto-approved order is still validated against your
[risk guardrails](/docs/risk-guardrails). Read
[the co-pilot](/docs/ai-copilot) before you turn live auto-approval on.

## Every route ends the same way

Manual ticket, workflow, bot, or co-pilot proposal: all four converge on the
same guarded order path. Guardrails are checked there, once, so there is no
route that skips them.
