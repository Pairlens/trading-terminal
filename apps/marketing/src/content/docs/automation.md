---
title: Automation
description: Three ways to stop watching a screen. Alerts tell you when something happens, workflows attach exits to an entry, and bots make the decision themselves.
group: traders
order: 7
eyebrow: For traders
updated: 22 AUG 2026
readTime: 2 min read
---

You cannot watch a screen all day, and the moments that matter rarely wait for
you. Automation is how you delegate the parts of trading that are rules rather
than judgement.

Everything here is deterministic: you compose explicit steps, and what runs is
plain logic you can read back. The AI can help you build one. It is never what
executes it.

Three tools, three different jobs. Start with alerts, which cannot cost you
anything.

## Workflows

A chain of order and logic steps, built on a canvas and attached to an entry.
This is how you place a buy with a take-profit and a stop-loss in one action,
scale out in tranches, or wait for a condition before adding. Workflows run
from the order ticket. See [build a workflow](/docs/build-a-workflow).

## Alerts

Something happens, you get told. Nothing is placed. A price level or a percent
move takes two fields and no canvas; add conditions and channels when you want
more. Use it when you want to know, not to act. See
[alerts and notifications](/docs/alerts-notifications).

## Bots

A Python strategy deployed to a market, evaluating on every closed candle and
trading on its own signals. Use it when the decision itself should be
automated. See [bots](/docs/bots).

## Which one

| You want                                      | Reach for |
| --------------------------------------------- | --------- |
| An entry with a stop and a target attached    | Workflow  |
| To be told when price crosses a level         | Alert     |
| Something to decide entries and exits for you | Bot       |

## Guardrails do not care

Every order any of them produces goes down the same guarded path as a manual
trade. If it would breach a [risk guardrail](/docs/risk-guardrails), it is
blocked. Automation is not an exemption.
