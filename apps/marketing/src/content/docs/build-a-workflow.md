---
title: Build a workflow
description: Bracket orders, explained and then built. Wire an entry, a take-profit, a stop-loss and conditional branches into one reusable chain you fire from the order ticket.
group: traders
parent: automation
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

## The problem this solves

You buy something at $100, intending to take profit at $110 and cut the loss at
$95. Then the market moves, and you are deciding in the moment rather than
sticking to the plan. That is where most discipline is lost.

A **bracket order** fixes it by deciding both exits at the same moment you
decide the entry. One action places the buy and arms a take-profit above and a
stop-loss below. Whichever hits first closes the position and cancels the other.

In Pairlens you build that once as a **workflow**, then fire it from the order
ticket on any pair. Open **Workflows** in the left nav, drag steps from the
palette, and connect them. Every step carries its own controls, so a size, a
price or a wait is set right there on the graph.

Workflows go further than a plain bracket when you need it: scale out in
tranches, wait for a condition before adding, branch on whether something
filled. But if you only ever use them for entry plus stop plus target, that
alone is worth the ten minutes.

## Describe it instead

The assistant that writes Python indicators and deploys bots wires steps here
too. Open it from the sparkle above the workflow list, or from its dock on any
page. "After my entry fills, take profit at +5% and stop out at -3%" gets you
the graph, laid out and connected, in one message. It reads the installed step palette first, so it
uses the steps this terminal actually has rather than inventing one, and it
reads the validator back: a missing trigger or a dangling edge is its problem
to fix before it answers.

What it cannot do is commit. Everything it writes lands as pending changes on
the canvas, exactly as if you had dragged the steps in yourself, and the commit
bar is still where a workflow becomes real. Ask it to change the plan and it
rewrites the graph; the diff shows you what moved.

The empty page leads with the same offer, one sentence and three starting
points. When a request is really an alert (something that fires on its own
rather than off your order), it says so and builds it on
[Notifications](/docs/alerts-notifications) instead, without restarting the
conversation.

## The step palette

### Trigger

**Order Input.** Every workflow starts here. It represents the order that
kicks the chain off, the one you submit from the ticket. Steps downstream
inherit its side, size, and fill price.

### Orders

**Market Order.** Fires immediately. Side can inherit from the trigger, invert
it (which is how an exit is expressed), or be pinned to buy or sell. Size is
either a percentage of the input order or a fixed amount.

**Limit Order.** Same side and size options, plus a price mode: a fixed price,
a percentage offset from current price, or an absolute offset from current
price. Offsets are what make a workflow reusable across price levels.

**Take Profit.** Arms against the entry fill. Trigger on a percentage gain or
an absolute price level, close all or part of the position with the **Close %**
slider, and execute as market or limit.

**Stop Loss.** The mirror image: trigger on a percentage loss or a price level,
close all or part, market or limit.

Take Profit and Stop Loss use exchange-native trigger orders where the venue
provides them, so the order rests at the exchange and survives Pairlens being
closed. On a venue with no trigger-order support, a stop-loss is refused rather
than faked. A resting limit below the market would fill instantly, which is the
opposite of a stop.

### Logic

**Condition.** Two outputs, pass and fail, so the chain forks. Conditions are
price above a level, price below a level, or percentage change from the entry
price (signed: +5 passes on a 5% rise, -3 on a 3% fall).

**Parallel Split.** Two to eight branches that run at once. This is how you
scale out: split into three, and give each branch its own Take Profit at a
different level with a different close percentage.

**Wait.** Pause for a duration in seconds, minutes, or hours before continuing.

Installed plugins can contribute more step types through the
`workflow:step-types` capability, and they show up in the palette next to the
built-ins.

## A worked example: entry with a bracket

1. **Order Input**, the entry you submit from the ticket.
2. **Take Profit**, trigger at +4%, close 100%, market.
3. **Stop Loss**, trigger at -2%, close 100%, market.

Wire both exits off the trigger. Save. Now select this workflow in the ticket's
**Workflow** tab, set your size, and hold to run. You get the entry and both
exits from one action, at a 2:1 reward-to-risk ratio you can read off the
canvas.

## A worked example: scaling out

1. **Order Input**
2. **Parallel Split** into three branches
3. Branch one: **Take Profit** at +2%, close 50%
4. Branch two: **Take Profit** at +5%, close 30%
5. Branch three: **Stop Loss** at -3%, close 100%

## Validating and running

The canvas validates as you build. A step with a missing or out-of-range field
is flagged before you can commit, and the commit bar summarises what changed.

When you select a workflow in the order ticket, Pairlens checks it against the
selected venue first. If a step is unsupported there, the ticket names the step
and the reason instead of letting you run something that would half-execute.

While a workflow is executing you get a progress toast, and its steps report as
executed or skipped, so a chain that took the fail branch is legible after the
fact rather than mysterious.

## Linking to one workflow

The workflow on the canvas is in the address, as `/workflows?workflow=<id>`. A
link opens that plan rather than an empty canvas, the back button walks between
the ones you were comparing, and "add a second take-profit to this" needs no
further explanation to the assistant.

## Guardrails still apply

Every order a workflow places goes through the same guarded path as a manual
trade. If it would breach a [risk guardrail](/docs/risk-guardrails), it is
blocked and the workflow reports it. A stop-loss step that cannot be armed
fails loudly rather than leaving you unprotected and unaware.
