---
title: Agent interfaces
description: 'Every way an AI agent can drive Pairlens: the in-app assistant, the chart MCP tools, the headless CLI, and deployed Python bots. What each can do, and where the trading boundary sits.'
group: builders
order: 2
eyebrow: For builders
updated: 19 AUG 2026
readTime: 6 min read
---

There are four ways an agent can operate Pairlens, and they differ in one
important respect: how close to an order they get, and who confirms it.

| Surface                              | Runs where          | Can place orders             |
| ------------------------------------ | ------------------- | ---------------------------- |
| [The assistant](/docs/copilot-tools) | Inside the terminal | As proposals you confirm     |
| [Chart MCP tools](/docs/chart-mcp)   | Any MCP client      | No. Chart control only       |
| [CLI](/docs/cli-reference)           | Your shell or CI    | Yes, headless and unattended |
| [Bots](/docs/bots)                   | Your machine        | Yes, once you arm them       |

## The assistant

One in-app agent, docked in the terminal chrome rather than in a pane and
mounted above the routed content, so it is the same assistant on a chart, on
the bots page and in the script workbench. Its threads are kept in the client's
own storage, on that device, and no transcript ever reaches the App Server.
The agentic loop runs client-side over 105 tools: market data, research, chart
control, portfolio reads, watchlists and alerts, Python scripts and backtests,
bots, workflows, navigation, and two trading tools. One turn runs up to 28
tool-calling steps. The App Server, when you use one, is nothing but an
OpenAI-compatible inference proxy. It does not run the loop and it never sees
your credentials.

It replaced four separate chats: a co-pilot pane scoped to one pair, a research
pane, and a builder rail on each of the four builder pages. Merging them removed
the question nobody should have had to answer, which was which chat can do the
thing I want.

Two mechanisms make it context-aware rather than merely global. Mounted surfaces
publish what they are showing, so "this" has a referent. And a surface can
publish **actions** that only it can perform: the workspace board publishes
`add_pane` and `remove_pane`, and they withdraw the moment you leave the board.
Its abilities grow with what is on screen.

Trading tools are **proposals**. `place_order` and `cancel_order` do not execute;
they render a confirm card that you approve, and the approved order then goes
through the same guarded order path as one you typed by hand, risk limits
included. An AI cannot raise its own limit, and it cannot route around the
ticket.

The rest of its write surface is fenced the same way, structurally rather than
by prompt. A bot it creates is always paper mode and switched off, and no tool
it has can enable, arm or retarget one; the ARM LIVE gate stays yours. Workflow
graphs and alert flows land in the open builder as pending changes, and it has
no tool that commits. Simple price and percent-move alerts are the exception and
arm on creation, because an alert nobody armed is not an alert.

One tool is conversational rather than mechanical. `ask_user` has no
implementation at all: the model's turn ends on the call, the terminal renders
the options, and the answer you tap becomes the tool result that resumes the
run, which is how a decision that is yours stays yours.

Full list in the [assistant tool reference](/docs/copilot-tools).

## Chart MCP tools

`@pairlens/fast-financial-charts` ships a genuine MCP tool surface: 52
deterministic tools plus a machine-readable schema and an executor, so a model
can add indicators, draw, navigate, read data back, and take screenshots without
you writing a per-action bridge.

**This is chart control, not trading.** There is no order tool in it, because the
charting library has no venue connection and no credentials. It is the right
surface for "look at this and tell me what you see", and the wrong one for
"trade this". See [the MCP tool surface](/docs/chart-mcp).

The library is MIT and lives in its own repo, so an MCP server you write around
it does not need Pairlens at all.

## The CLI

The CLI is the honest answer to "can an agent trade Pairlens headlessly". It
uses the same connector plugins and the same strategy engine as the terminal, it
emits JSON, and it exits with a status code, which is everything a subprocess
needs.

```bash
bun apps/cli/src/index.ts candles --pair BTC-USDT --timeframe 1h --limit 100
```

```bash
bun apps/cli/src/index.ts signals --pair SOL-USDT --timeframe 4h
```

```bash
bun apps/cli/src/index.ts order --pair BTC-USDT --side buy --size 0.001 --mode paper
```

Reads (`candles`, `ticker`, `orderbook`, `signals`, `markets`) need no
credentials at all. `order` takes them as flags or environment variables, and
defaults to `--mode paper`.

Three things to be clear about before you point an agent at it.

**It never reads the vault or the keychain.** Credentials are arguments. That is
deliberate: a headless tool that could unseal your vault would undo the point of
having one. It also means the secrets are in your process environment, so treat
that environment accordingly.

**There is no confirmation step.** `--mode live` with real keys places a real
order immediately. The terminal's press-and-hold, its risk guardrails, and its
lock-before-order prompt are all terminal features. None of them exist here.

**Start on paper.** `--mode paper` routes to the venue's own demo environment
where one exists. See [paper trading](/docs/paper-trading).

## Bots

A [bot](/docs/bots) is a Python strategy deployed to a market, evaluating on
closed candles and acting on its own. It is not an LLM, and that is the point:
what executes is deterministic, inspectable logic that you backtested. The AI
can help you write one. It is not what runs it.

Bots are the right shape for unattended trading. An LLM in the order path is
not, which is why the assistant's trading tools stop at a confirm card.

## Is there an MCP server for trading?

Not today. MCP in Pairlens covers the chart engine. If you want an agent placing
orders, the supported paths are the CLI (headless, unattended, no confirmation)
or the assistant (in-app, confirmed).

If you want to build one, everything you need is already public: the
[MarketAdapter API](/docs/marketadapter-api) is the venue interface, the
[Plugin SDK](/docs/plugin-sdk) is how you ship it, and the CLI is a working
example of driving connectors outside the terminal in about 200 lines.

## Where the boundary is, in one paragraph

Pairlens will let an agent read anything and draw anything. It will let an agent
propose an order. What it will not do is let a model's output become an
execution without either a human confirming it or you explicitly arming an
unattended path with your own hands. Risk limits are enforced in the order path
itself, below every one of these surfaces, so the guarantee holds no matter
which one is driving. See [risk guardrails](/docs/risk-guardrails).

## Where to next

- [Assistant tool reference](/docs/copilot-tools) for all 105 tools
- [CLI reference](/docs/cli-reference) for every flag
- [The MCP tool surface](/docs/chart-mcp) for chart control
- [Plugin SDK](/docs/plugin-sdk) to add a surface of your own
