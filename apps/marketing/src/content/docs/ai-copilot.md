---
title: The AI co-pilot
description: A co-pilot that reads your market data and drives your chart, with around sixty tools, three personas, and a hard boundary at your risk limits.
group: traders
order: 4
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

Add the **AI Lens** panel to a workspace and you get a chat that can actually
see what you are looking at. It reads live candles, the order book, your
positions, and the news, and it can drive the chart the way you would.

The agentic loop runs on your machine. When you use a hosted model, the App
Server is only an inference proxy: it forwards a request and streams a response
back. It does not decide anything and it never sees your exchange credentials.

## What it can do

Around sixty tools, grouped by what they touch.

**Market reads.** Snapshot of a pair, candles at any timeframe, ticker, order
book, strategy-engine signals, multi-timeframe views, pair comparison, market
listing, instrument search.

**Context reads.** Top coins, news, the Fear and Greed index, an asset
overview, your trade journal, and web search when a search provider is
connected.

**Portfolio reads.** Balances and holdings, open orders, your configured risk
limits, and account settings.

**Chart control.** Add, update, and remove indicators. Draw horizontal lines,
vertical lines, trend lines, rectangles, circles, and Fibonacci retracements.
Annotate. Draw stop-loss, take-profit, and entry levels. Undo and redo. Change
chart type and price scale. Fit content, scroll to latest. Take a screenshot.
Add or remove a compare symbol. Start and exit replay. Read back the chart's
current state, indicators, and drawings.

**Workspace actions.** Add to and remove from your watchlist, create and remove
price alerts, add a journal entry, switch market, switch pair, set the
timeframe.

**Trading.** Propose an order, and cancel one. Both go through the guarded path.

"Draw the levels you would trade this off" is a request it can actually
execute, and the lines stay on your chart afterwards.

## Personas

Three modes, switchable from the panel header:

**Mentor.** Explains its reasoning step by step. Best when you are learning why
a setup is a setup.

**Balanced.** Clear signals with enough context to judge them. The default.

**Technical.** Data-driven, minimal commentary. Best when you already know what
you are looking at and want numbers.

## Order proposals

The co-pilot cannot place an order silently. A proposal appears as a card in
the chat showing the pair, side, size, and limit price, with the reasoning
above it. Paper is preselected. Nothing is sent until you confirm.

Ticking **Don't ask again** turns that into a standing grant, either for paper
trades generally or for live trades on that one exchange. Grants are listed and
revocable in **Settings → Risk Management**.

Auto-approval skips the card. It does not skip your
[risk guardrails](/docs/risk-guardrails), which are enforced on the order path
itself. This is the boundary the whole design rests on: a language model can be
wrong, and can be manipulated through the data it reads. It should not be the
thing standing between you and a blown account.

## What it knows about you

The co-pilot sees market data your terminal already has, plus whatever your
prompt includes. Chat history is stored locally by default and synced when you
are signed in. It never receives your API keys or private keys, because those
live in the OS keychain or your encrypted vault and are only ever read by the
connector signing an order.

## Choosing a model

Bring your own provider key, or subscribe to hosted Intelligence. Both work,
and bring-your-own-key is always free. See
[AI providers](/docs/ai-providers).

## Related

- [Research reports](/docs/research-reports) for the long-form analysis panel
- [AI providers](/docs/ai-providers) for keys, plans, and credits
- [Co-pilot tool reference](/docs/copilot-tools) for all 63 tools it can call
- [Risk guardrails](/docs/risk-guardrails) for the limits the AI cannot move
