---
title: Research reports
description: A long-form analyst report on the active pair, built from live market data plus cited web sources, with the levels drawn on your chart.
group: traders
parent: ai-copilot
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 3 min read
---

The **Research** panel writes a full analyst report on whatever pair you are
looking at. It is a different shape of AI from the chat: one long, structured,
cited document rather than a conversation.

## How it works

Two phases.

**Phase one, gather.** If you have a web-search provider connected, it searches
for current material on the asset. If not, the report is built from market data
alone and says so.

**Phase two, write.** The report streams in from your inference provider,
grounded in the live market data your terminal already holds.

Live data is authoritative. Where a web source conflicts with the price your
connector is streaming, the report trusts the live data and notes the
discrepancy. That is the failure mode a research tool most needs to get right:
a confident report built on a stale quote is worse than no report.

## What you get

Every report uses the same structure, which makes them comparable across pairs
and across days.

**Executive Summary.** Opens with a bold verdict, Bullish, Bearish, or Neutral,
followed by the reasoning.

**Price Action and Structure.** Trend, key levels, volume, moving averages,
volatility. It emits explicit support and resistance lines, and those levels
render on your chart.

**Catalysts and Developments.** What is actually happening, with inline
citations. For equities this covers earnings, revenue and EPS surprises, and
guidance changes; for crypto, protocol and ecosystem events.

**Market Context.** The wider backdrop: policy, yields, the dollar, inflation
and employment data where relevant.

**Trade Setup.** A card with bias, entry zone, invalidation (the stop),
targets, and reward-to-risk ratio. When nothing is attractive, it states the
conditions that would create a setup instead of inventing levels.

**Risk Factors.** What would make the thesis wrong.

**Sources.** Numbered URLs, all from the search results or news list. The
prompt forbids inventing or altering a URL, so a link that does not resolve is
a bug worth reporting rather than a hallucination you should expect.

Reports run 1,000 to 1,800 words and end with an explicit note that they are
informational and not financial advice.

## Cost

Research is the most expensive thing the AI does: a long generation plus web
searches. On hosted Intelligence it draws from the same credit budget as
everything else, with each hosted web search costing a flat amount of credits
on top of the tokens. On your own provider key, it costs whatever your provider
charges.

Generate one per pair per session, not one per idle moment.

## Related

- [The AI co-pilot](/docs/ai-copilot)
- [AI providers](/docs/ai-providers)
