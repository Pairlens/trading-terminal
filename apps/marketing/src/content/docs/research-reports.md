---
title: Research reports
description: A full analyst write-up on one asset, built from your own live market data plus cited web sources, in about a minute. What is in it, what it costs, and why live data always wins a disagreement.
group: traders
parent: ai-copilot
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 5 min read
---

Ask the assistant to research something and you get a proper write-up rather than
a chat reply: trend and structure off your own live data, what is actually
happening to the asset with sources you can click, a trade setup with levels, and
what would make the whole thesis wrong.

"Research SOL" is enough. Name an exchange if you want a specific market;
otherwise it uses whatever is on screen.

It takes tens of seconds. You can minimize the window and keep working.

## How it is built

**It gathers.** 200 daily and 200 hourly candles for the asset, straight from
your own connector, with signals computed over them. If you have a web-search
provider connected, it also searches for current material. If not, the report is
built from market data alone and says so.

**It writes.** The report streams in, grounded in the market data your terminal
already holds.

**It comes back to the assistant.** The report is a tool result, not a dead end,
so the assistant summarises it in the chat and can act on it: draw the levels the
report named, set an alert at the invalidation, add the pair to your watchlist.

**Live data wins a disagreement.** Where a web source conflicts with the price
your connector is streaming, the report trusts the live data and notes the
discrepancy. That is the failure mode a research tool most needs to get right: a
confident report built on a stale quote is worse than no report.

## What is in it

The report lands as a card in the conversation, collapsed, with the assistant's
own summary underneath it, which is often enough on its own. Expand it and each
section is laid out rather than dumped as text.

**Executive summary.** The verdict, bullish, bearish or neutral, as a badge, then
the reasoning.

**Price action and structure.** Trend, volume, moving averages and volatility,
above a small chart of the last few months with the support and resistance the
report named drawn across it. Those levels repeat as chips, so you can read them
without reading the paragraph.

**Catalysts and developments.** What is actually happening, with numbered
citations wired to the pages they came from. For stocks that covers earnings,
revenue and guidance; for crypto, protocol and ecosystem events.

**Market context.** The wider backdrop: policy, rates, the dollar, inflation and
employment where relevant.

**Trade setup.** A card rather than a paragraph: bias, entry zone, invalidation
(your stop), targets, and reward against risk. When nothing looks attractive, it
states the conditions that would create a setup instead of inventing levels,
which is the honest answer most of the time.

**Risk factors.** What would make the thesis wrong. Read this one first if you
already like the idea.

**Sources.** Numbered to match the citations. The model is forbidden from
inventing or altering a URL, so a link that does not resolve is a bug worth
reporting rather than something to expect.

Reports run 1,000 to 1,800 words and end with an explicit note that they are
informational and not financial advice.

The little chart inside the report is a picture of the report, not your chart. To
get the levels onto the real one, say "draw those levels" and the assistant puts
support, resistance, entry, stop and target on it as drawings you can drag or
delete.

## What it costs

Research is the most expensive thing the AI does: a long generation plus web
searches. On hosted Intelligence it draws from the same credit budget as
everything else, with each web search costing a flat amount on top of the tokens.
On your own provider key, it costs whatever your provider charges.

Ask for one per asset per session, not one per idle moment.

## Related

- [The AI assistant](/docs/ai-copilot)
- [AI providers](/docs/ai-providers)
- [Assistant tool reference](/docs/copilot-tools)
