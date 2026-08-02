---
title: Build a workflow
description: Wire an entry, a take-profit, a stop-loss, and conditional branches into one reusable chain you fire from the order ticket.
group: traders
parent: automation
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

A workflow is a graph of steps on a canvas. Open **Workflows** in the left nav,
drag steps from the palette, and connect them. Each step has a config panel on
the right.

The point of a workflow is the bracket order: one action that places an entry
and arms its exits, so you are never sitting in a position you meant to protect
and forgot to.

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

## Guardrails still apply

Every order a workflow places goes through the same guarded path as a manual
trade. If it would breach a [risk guardrail](/docs/risk-guardrails), it is
blocked and the workflow reports it. A stop-loss step that cannot be armed
fails loudly rather than leaving you unprotected and unaware.
