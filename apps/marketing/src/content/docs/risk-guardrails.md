---
title: Risk guardrails
description: Position sizing in one paragraph, then the four limits Pairlens enforces before any order leaves your machine, and why the AI is deliberately not allowed near them.
group: traders
parent: trading
order: 3
eyebrow: For traders
updated: 22 AUG 2026
readTime: 5 min read
---

## The part nobody wants to read

Most people who lose money trading do not lose it on one bad idea. They lose it
by putting too much into one position, then trying to win it back the same
afternoon.

A worked example. Say you have $10,000 and you cap yourself at losing 1% on any
trade. That is $100. If your stop is 5% below your entry, the largest position
you can take is $2,000, because a 5% loss on $2,000 is your $100. Change the
stop to 10% and the position halves to $1,000.

That is position sizing, and it is the whole of risk management in one
paragraph. The size follows from the stop, not from how confident you feel.

Guardrails are the automated version. You decide your limits once, while calm,
and the terminal enforces them later, when you are not. Find them in
**Settings → Risk Management**.

## What you can cap

**Max daily loss (%).** The most you are willing to lose inside a window, as a
percentage of your portfolio. This is the one that ends bad days before they
become bad weeks.

**Max position size (%).** The largest single position you will hold. On a
[perpetual](/docs/cex-futures) this measures your total exposure, not your
margin: one Bitcoin contract is the same exposure at 1x as at 25x, and leverage
only changes how much the exchange holds against it.

**Max trades.** How many trades you may place inside the window. This is the one
that saves you from revenge trading, which is the specific failure of trying to
win losses back immediately.

Leave any of them unset for no limit.

## What happens on a breach

Each limit has its own action, so you can be strict about losses and relaxed
about trade count:

| Action               | Effect                                    |
| -------------------- | ----------------------------------------- |
| **Block all orders** | Nothing goes out until you unlock         |
| **Block buy orders** | You can still reduce or exit, but not add |
| **Warn only**        | The order goes through, with a warning    |
| **Off**              | The limit is tracked but never acts       |

When a limit blocks, a banner appears across the terminal and the Risk panel
switches from **All clear** to **Limit hit**. Unlocking is a deliberate click.

**Blocking buys rather than everything is the underrated option.** A blown daily
loss limit usually means you should stop opening new risk, not that you should
be trapped in what you already hold.

## The reset window

Your tracked profit and loss, trade count and any order lock reset on a schedule
you pick: every 4 hours, every 12 hours, daily, or weekly. The Risk panel shows
the current window's numbers, when it started, and how long until it resets.

## Order confirmation

The last guardrail is the one in your hand. By default you commit an order by
pressing and holding the submit button, and a live order holds longer than a
practice one. It costs half a second and it catches the order you did not mean
to send.

If that half second is in your way, the same settings page switches it to a
single click. The note under the button always says which one is in force.
Nothing else changes: the caps above are enforced identically either way.

## What the AI is allowed to do

The same page controls what the assistant may do without asking.

**Auto-approve paper trades.** Simulated funds only. The assistant places
practice orders with no confirmation card.

**Auto-approve live trades.** Off by default, and granted one exchange at a
time. The only way to grant it is to tick **Don't ask again** on a live order
card, so the first live auto-approval is always a deliberate act by you. Every
exchange you have granted is listed here with a revoke button.

Auto-approval skips the confirmation card. It does not skip the guardrails.
Every order the assistant places is checked exactly like one you typed.

## Bots have their own guards too

A [bot](/docs/bots) carries limits of its own, set when you create it: a daily
loss cap, maximum trades per day, maximum position size, a cooldown after a
loss, and a maximum losing streak. Those sit on top of the account-wide limits
here. A bot that trips one of its own guards halts itself and tells you which
one stopped it.

## Why the AI cannot touch any of this

Keeping guardrails out of the model's reach is deliberate, and it is the single
most important design decision in the product.

A language model can be wrong. It can be argued into things. It can be
manipulated by text it reads while researching, because it cannot always tell a
web page's instructions from yours. None of that is acceptable in the thing
standing between you and a margin call.

So the limits are enforced by the code that sends orders, below the AI entirely.
The assistant can analyse, warn, and propose. It cannot raise a cap, disable a
block, or place a live order you did not approve.
