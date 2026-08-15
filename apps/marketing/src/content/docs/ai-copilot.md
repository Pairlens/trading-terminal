---
title: The AI assistant
description: One assistant for the whole terminal, docked bottom-right. 94 tools over markets, charts, portfolio, scripts, bots, workflows and alerts, three personas, and a hard boundary at your risk limits.
group: traders
order: 4
eyebrow: For traders
updated: 15 AUG 2026
readTime: 7 min read
---

The assistant sits in the bottom-right corner of the terminal, outside the
content area: a line of text and an orb. The text tells you what it would do
here. On a chart it reads **Analyze the chart of BTC/USDT**. On the workflows
page, **Build a workflow**. On Discovery, **Find me something to trade**.

Click the orb and a chat window opens over the terminal. Click it again and the
window folds back into the orb. <kbd>⌘J</kbd> (<kbd>Ctrl</kbd>+<kbd>J</kbd>
on Windows and Linux) does the same from the keyboard.

## One assistant, one conversation

There used to be four AI chats in Pairlens: a co-pilot pane scoped to one pair,
a research pane, and a builder rail on each of the four builder pages. You had
to know which one you were talking to. Now there is one, and it follows you.

Because it is mounted above the routed content, none of the following interrupt
it: navigating to another page, switching pair, minimizing the window. Ask for a
backtest on the workbench, minimize the orb, go read the order book, and the run
is still going when you come back. While it works, the line beside the orb
becomes the status: **Thinking...**, **Using tools...**, **Looking on the
web...**, so a collapsed assistant is never a black box.

The history is one thread, not one per pair. The window header carries the two
controls that act on it: the persona dropdown and an eraser that clears the
conversation.

## What it can do

94 tools. One turn runs up to 28 tool-calling steps, which is enough to read the
chart, pull two more timeframes, write a strategy, backtest it and deploy it
without coming back to you in between.

**Markets.** Candles, tickers, order books, deterministic strategy signals,
multi-timeframe reads and pair comparisons, for any instrument on any connected
venue. Not just the one on screen. It can search instruments it does not know
the id of.

**Charts.** Add and configure indicators, draw horizontal and vertical lines,
trendlines, rectangles, circles and Fibonacci retracements, annotate, mark
entry, stop and target, change chart type and price scale, add a compare
symbol, run replay, and read back what is on the chart right now, including the
levels you drew yourself.

**Account.** Balances and holdings, open orders, your risk guardrails and what
today has already used of them, your trade journal, your watchlists, and which
venues and wallets are connected. It can see that an account exists. It can
never see its keys.

**Scripts and bots.** Read, write and validate Python indicators and
strategies, run backtests through the same engine live bots use, and deploy a
strategy as a bot.

**Automation.** Build and edit workflows, price alerts and alert flows.

**Research.** Web search, news, top coins, Fear and Greed, asset overviews, and
`deep_research` for a full sourced report. See
[research reports](/docs/research-reports).

**Navigation.** Take you to any page, pair or workspace, and then act there.

**Trading.** Prepare spot, perpetual and prediction-market orders for you to
confirm, and cancel resting ones.

Full list in the [assistant tool reference](/docs/copilot-tools).

## Personas

Three modes, switchable from the dropdown in the chat window's header, next to
the clear button. Your choice sticks across sessions and syncs to your other
devices when sync is on. It carries over from the old co-pilot, so a persona you
picked back then is still the one you get.

**Mentor.** Explains its reasoning step by step, with analogies. Best when you
are learning why a setup is a setup.

**Balanced.** Clear signals with enough context to judge them. The default.

**Technical.** Data and structure, terse. Short bullets, key levels,
percentages, one sentence per insight. Best when you already know what you are
looking at and want numbers.

The persona changes how it writes, not what it can do. All 94 tools are
available in every mode, and the safety rules below hold identically in all
three.

## It can see what you are looking at

Every mounted surface publishes what it is showing, and the assistant is handed
that description on every turn. A chart reports its pair, venue, timeframe,
indicators and drawing count. A page reports which page it is. So "is this
overbought" is a complete question, and "add an order book to this" has a
referent.

Some surfaces publish **actions** as well, and those become tools only while the
surface is mounted. The workspace board is the clearest example: it publishes
`list_workspace_panes`, `add_pane` and `remove_pane`, so "put a depth chart and
a tape next to this" is a request the board itself executes. Leave the board and
the three tools withdraw with it.

The same gating runs the other way for tools that need somewhere to land. The
27 chart tools that change something are only offered while a chart is mounted,
and the three that write into the script editor only while the workbench is
open. The gate is re-read at every step, so if the assistant navigates to a
chart in step 2 it can draw on it in step 3.

## Order proposals

The assistant cannot place an order. `place_order` prepares one and renders a
card in the chat with the pair, side, size and limit price, its reasoning above
it, and paper preselected. Nothing is sent until you confirm, with the same
press-and-hold or click gesture as the order ticket.

Ticking **Don't ask again** turns that into a standing grant, either for paper
trades generally or for live trades on that one exchange. Grants are listed and
revocable in **Settings → Risk Management**.

Auto-approval skips the card. It does not skip your
[risk guardrails](/docs/risk-guardrails), which are enforced on the order path
itself. This is the boundary the whole design rests on: a language model can be
wrong, and can be manipulated through the data it reads. It should not be the
thing standing between you and a blown account.

The same shape holds everywhere it builds something that could cost you money.
A bot it creates is always paper mode and switched off, and it has no tool that
can arm one. Workflows and alert flows land as uncommitted drafts in the builder
for you to review and commit. Simple price alerts are the one exception: they
arm on creation, because an alert nobody armed is not an alert, and the
assistant tells you so when it makes one.

When a decision is genuinely yours, it asks with buttons rather than a
paragraph. Those question cards end the model's turn until you tap an answer.

## What it knows about you

It sees market data your terminal already has, the surfaces you have open, and
whatever your prompt includes. Chat history is stored locally by default and
synced when you are signed in. It never receives your API keys or private keys,
because those live in the OS keychain or your encrypted vault and are only ever
read by the connector signing a request.

## On a phone

The [mobile terminal](/docs/mobile-terminal) has no room for a floating window,
so the assistant is one of the five destinations instead of a dock. Same
conversation, same tools, same confirm cards. The phone has no window header, so
it uses the persona you picked on the desktop rather than offering the
dropdown.

## Choosing a model

The assistant runs on any `ai:inference` provider. Bring your own key from
Groq, OpenAI, Anthropic or OpenRouter, which is free and always will be, or
subscribe to hosted Pairlens Intelligence. The agentic loop runs on your machine
either way: when you use a hosted model the App Server is only an inference
proxy, forwarding a request and streaming a response back. It decides nothing
and never sees your exchange credentials. See
[AI providers](/docs/ai-providers).

## Related

- [Assistant tool reference](/docs/copilot-tools) for all 94 tools
- [Research reports](/docs/research-reports) for the long-form sourced write-up
- [AI providers](/docs/ai-providers) for keys, plans, and credits
- [Risk guardrails](/docs/risk-guardrails) for the limits the AI cannot move
