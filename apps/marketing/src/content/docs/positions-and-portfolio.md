---
title: Positions and portfolio
description: The Positions, Portfolio, and Risk panels. Open orders, fill history, balances, allocation, and the guardrail state, read straight from the venue.
group: traders
parent: trading
order: 6
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

Three panels answer "what do I actually hold and what is still working". All
three read from the venue through your connector, using the credentials on this
device. Nothing about your account passes through a Pairlens server.

## Positions

Four tabs, bound to whichever connected account you select in the panel header.

| Tab           | What it shows                                                     |
| ------------- | ----------------------------------------------------------------- |
| **Positions** | Margin positions. Empty on spot, and it says so                   |
| **Orders**    | Resting orders, with a cancel button per row                      |
| **Fills**     | Trade history: side, pair, price, size, fee, and time             |
| **Balances**  | Every asset on the account, with a total in your display currency |

**The Positions tab is empty on purpose.** Pairlens trades spot. Spot has no
margin positions, so rather than showing a plausible-looking table with nothing
in it, the tab says "Spot mode, no margin positions". What you hold is under
Balances.

**Orders can be cancelled from the row.** A confirmation names the side and the
pair before anything is sent, because a misclick here is not recoverable. Order
status reads Open, Partial, Filled, or Canceled.

**Fills are the venue's record, not ours.** Fees come back in whatever currency
the venue charged them in, and are shown that way rather than converted, because
a converted fee is a number you cannot reconcile against your exchange
statement.

If no account is selected, each tab says which one it needs rather than
rendering blank. Connect one under [Accounts](/docs/connect-an-exchange).

## Portfolio

Holdings as a donut with a ranked list beside it: every asset, its share of the
total, and its value in your display currency (USD, EUR, or GBP, set in
[settings](/docs/settings#currency)).

It is the answer to "am I concentrated", which is a question the Balances tab
technically answers but does not make visible. Values fall back to raw amounts
for assets with no price available, so a long-tail token still appears rather
than silently dropping out of your total.

Portfolio is a singleton: one per workspace.

## Risk

A compact panel that reads your current window against the caps you configured.
It sits in a corner and says one of:

| State             | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| **All clear**     | Inside every limit                                  |
| **Caution**       | Approaching one                                     |
| **Limit hit**     | A cap has been breached                             |
| **Buys Locked**   | New buys are blocked by the breach action you chose |
| **Orders Locked** | All new orders are blocked                          |

Alongside the state it carries the window's P&L, trade count, and exposure.

The panel is a readout, not the enforcement. Limits are enforced in the order
path itself, which is why the AI cannot talk its way around one and a bot cannot
either. Configure them under
[risk guardrails](/docs/risk-guardrails), which also covers the reset window and
what each breach action does.

If you have not set any limits, the panel prompts you to, which is the correct
first thing to do with it.

## What syncs and what does not

None of this is Pairlens state. Balances, orders, and fills are fetched live
from the venue every time, so they are as current as the venue's API and they
disappear the moment you disconnect the account.

The one exception is the **trade journal**, which is yours: trades you or the
[co-pilot](/docs/ai-copilot) log, stored in your account when you are signed in
and sync is on. It exists to hold the reasoning behind a trade, which no
exchange API will ever give you back.

## Where to next

- [Place an order](/docs/place-an-order) for the ticket that creates these rows
- [Risk guardrails](/docs/risk-guardrails) for the caps behind the Risk panel
- [Paper trading](/docs/paper-trading) to see all of this without real money
