---
title: Positions and portfolio
description: What you hold, what is still waiting, and what it is all worth. The Positions, Portfolio and Risk panels, read live from your exchange.
group: traders
parent: trading
order: 7
eyebrow: For traders
updated: 22 AUG 2026
readTime: 5 min read
---

Three panels answer the question "what do I actually have on right now".

All three read from your exchange through your connector, using the credentials
on this device. Nothing about your account passes through a Pairlens server, and
nothing here is our copy of the truth. It is the exchange's own record.

## Positions

Four tabs, bound to whichever connected account you pick in the panel header.

| Tab           | What it shows                                                 |
| ------------- | ------------------------------------------------------------- |
| **Positions** | Leveraged positions. Empty on a spot account, and it says so  |
| **Orders**    | Orders still waiting to fill, with a cancel button per row    |
| **Fills**     | Your trade history: side, pair, price, size, fee and time     |
| **Balances**  | Every asset on the account, totalled in your display currency |

**Why the Positions tab is empty on a spot account.** A "position" in the
trading sense is something you opened with borrowed money and will have to close
to realise. Buying Bitcoin outright is not a position, it is just owning
Bitcoin, and that shows up under Balances.

Rather than draw a plausible-looking empty table, the tab says "Spot mode, no
margin positions" so you know nothing is missing.

Leveraged positions get their own panels. **Futures Positions** lists your open
perpetuals with entry, mark, liquidation level and unrealised profit and loss.
**Prediction Positions** lists event contracts. Both are separate panels because
a position with a liquidation price and a contract that settles on a real-world
event need genuinely different columns.

**Cancelling an order** is done from its row. A confirmation names the side and
the pair first, because a misclick here is not recoverable.

**Fills are the venue's record.** Fees come back in whatever currency the
exchange charged them in, and are shown that way rather than converted, because
a converted fee is a number you cannot reconcile against your exchange
statement at tax time.

If no account is selected, each tab says which one it needs rather than showing
you a blank. Connect one under [Accounts](/docs/connect-an-exchange).

## Portfolio

Your holdings as a donut with a ranked list beside it: every asset, its share of
the total, and its value in your display currency (USD, EUR or GBP, set in
[settings](/docs/settings#currency)).

This panel answers one question the Balances tab technically answers but does
not make visible: **am I concentrated?** If one asset is 70% of your portfolio,
you are not really diversified, you are making one bet with extra steps. Seeing
it as a picture makes that obvious in a way a list of numbers does not.

Assets with no available price fall back to their raw amount rather than
silently dropping out of your total.

Portfolio appears once per workspace.

## Risk

A compact readout of your current window against the caps you set. It sits in a
corner and says one of:

| State             | Meaning                                      |
| ----------------- | -------------------------------------------- |
| **All clear**     | Inside every limit                           |
| **Caution**       | Approaching one                              |
| **Limit hit**     | A cap has been breached                      |
| **Buys Locked**   | New buys are blocked by the action you chose |
| **Orders Locked** | All new orders are blocked                   |

Alongside it: the window's profit and loss, your trade count, and your exposure.

The panel is a readout, not the enforcement. Limits are enforced in the order
path itself, which is why neither the AI nor a bot can talk its way around one.
Configure them in [risk guardrails](/docs/risk-guardrails).

If you have not set any limits, the panel prompts you to. That is the correct
first thing to do with it.

## What syncs and what does not

None of this is Pairlens state. Balances, orders and fills are fetched live from
your exchange every time, so they are exactly as current as its API, and they
disappear the moment you disconnect the account.

The one exception is your **trade journal**: notes you or the
[assistant](/docs/ai-copilot) record against a trade, stored in your account
when you are signed in with sync on. It exists to hold the reasoning behind a
trade, which no exchange API will ever give you back and which is the single
most useful thing to reread after a losing month.

## Where to next

- [Place an order](/docs/place-an-order) for the ticket that creates these rows
- [Risk guardrails](/docs/risk-guardrails) for the caps behind the Risk panel
- [Paper trading](/docs/paper-trading) to see all of this with no money at stake
