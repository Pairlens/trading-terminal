---
title: Risk guardrails
description: Daily loss caps, position caps, trade caps, and a configurable breach action, enforced by the order path rather than by the AI.
group: traders
parent: trading
order: 3
eyebrow: For traders
updated: 15 AUG 2026
readTime: 4 min read
---

Risk guardrails sit between you and a bad day. They are enforced before any
order leaves your machine, by the order path itself, not by the AI. The
assistant can suggest, warn, and propose. It cannot move these limits.

Find them in **Settings → Risk Management**.

## What you can cap

**Max daily loss (%).** The most you are willing to lose inside the reset
window, as a percentage of your portfolio.

**Max position size (%).** The largest single position you will hold, as a
percentage of your portfolio. On a [perpetual](/docs/cex-futures) this measures
notional, not margin: one BTC contract is the same exposure at 1x as at 25x,
and leverage changes only how much the venue holds against it.

**Max trades.** How many trades you may place inside the reset window. This is
the one that saves you from revenge trading.

Leave any of them unset for no limit.

## What happens on a breach

Each limit has its own **On breach** action, so you can be strict about losses
and relaxed about trade count:

| Action               | Effect                                    |
| -------------------- | ----------------------------------------- |
| **Block all orders** | Nothing goes out until you unlock         |
| **Block buy orders** | You can still reduce or exit, but not add |
| **Warn only**        | The order goes through, with a warning    |
| **Off**              | The limit is tracked but never acts       |

When a limit blocks, a banner appears across the terminal and the Risk panel
switches from **All clear** to **Limit hit**. Unlocking is a deliberate click,
not something that happens by accident.

Blocking buys rather than everything is the underrated option. A blown daily
loss limit usually means you should stop opening new risk, not that you should
be trapped in what you are already holding.

## The reset window

Tracked metrics (P&L, trade count) and any order lock reset on a schedule you
pick: every 4 hours, every 12 hours, daily, or weekly. The Risk panel shows the
current window's P&L, trade count, when the window started, and how long until
it resets.

## Order confirmation

The last guardrail is the one in your hand. By default you commit an order by
pressing and holding the submit button until it fills, and a live order holds
longer than a paper one. It is the cheapest protection in the app: it costs
half a second and it catches the order you did not mean to send.

If that half second is in your way, the same settings page switches the gesture
to a single click. It applies to the ticket and to the assistant's order cards,
and the note under the button always says which gesture is in force. Nothing
else changes. The caps above are enforced identically under either one.

## AI trade permissions

The same settings page controls what the assistant may do without asking.

**Auto-approve paper trades.** Simulated funds only. The assistant places paper
orders with no confirmation card.

**Auto-approve live trades.** Off by default, and granted per exchange. The
only way to grant one is to tick **Don't ask again** on a live order card,
which means the first live auto-approval is always a deliberate act. Every
granted exchange is listed here with a revoke button.

Auto-approval skips the confirmation card. It does not skip the guardrails.
Every order the assistant places is validated exactly like one you typed.

## Bots have their own guards

A [bot](/docs/bots) carries its own limits, set when you create it: daily loss
cap, max trades per day, max position notional, cooldown bars after a loss, and
a maximum losing streak. Those are enforced by the bot runtime, on top of the
account-wide guardrails here. A bot that trips one of its own guards halts
itself and says which guard stopped it.

## Why it is not the AI's job

Keeping guardrails out of the AI's reach is deliberate. The model's job is
analysis. The guardrails are a hard boundary. A language model can be wrong,
can be talked into things, and can be adversarially prompted through data it
reads. Your risk limits should not depend on it behaving.
