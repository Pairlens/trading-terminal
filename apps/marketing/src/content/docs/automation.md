---
title: Automation
description: Workflows chain orders and conditions into brackets you can reuse. Alerts watch the market and tell you. Bots trade a strategy on their own.
group: traders
order: 7
eyebrow: For traders
updated: AUG 2026
readTime: 2 min read
---

Automation in Pairlens is deterministic, not black-box. You compose explicit
step chains, and the running thing is plain, inspectable logic. The AI can help
you build one. It is not what executes it.

There are three tools, and they do different jobs.

## Workflows

A chain of order and logic steps, built on a canvas and attached to an entry.
This is how you place a buy with a take-profit and a stop-loss in one action,
scale out in tranches, or wait for a condition before adding. Workflows run
from the order ticket. See [build a workflow](/docs/build-a-workflow).

## Alerts

An event, optionally guarded by a condition, ending in a notification. Nothing
is placed. Use it when you want to know, not to act. See
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
