---
title: Research reports
description: deep_research, the assistant's long-form analyst report on one instrument, built from live market data plus cited web sources and rendered section by section on a card in the chat.
group: traders
parent: ai-copilot
order: 1
eyebrow: For traders
updated: 15 AUG 2026
readTime: 4 min read
---

Ask the assistant to research something and it calls `deep_research`: a full
analyst write-up on one instrument, built from live market data plus cited web
sources. It used to be a panel you added to a workspace. It is now a tool, which
means you can ask for it from anywhere and the assistant can act on what comes
back.

"Research SOL" is enough. Name a venue and pair if you want a specific tape;
otherwise it uses whatever is on screen.

## How it works

Three phases, tens of seconds end to end.

**Gather.** It pulls 200 daily and 200 hourly candles for the instrument and
computes strategy-engine signals over them. If you have a web-search provider
connected, it also searches for current material on the asset. If not, the
report is built from market data alone and says so.

**Write.** The report streams in from your inference provider, grounded in the
market data your terminal already holds.

**Read.** The assistant gets the report back as a tool result and carries on. It
summarises the findings in the chat, and it can act on them: draw the levels the
report named, set a price alert at the invalidation, put the pair on your
watchlist.

Live data is authoritative. Where a web source conflicts with the price your
connector is streaming, the report trusts the live data and notes the
discrepancy. That is the failure mode a research tool most needs to get right: a
confident report built on a stale quote is worse than no report.

## What you get

The report lands as a card in the conversation, collapsed, titled with the pair
and venue and showing its source count. The assistant's own summary sits
underneath it, which is usually enough on its own. Expand the card and the
report opens in place, with the full presentation the old panel had rather than
a wall of markdown: every section gets its own renderer.

**Executive Summary.** The verdict, Bullish, Bearish or Neutral, pulled out as
a coloured badge, then the reasoning.

**Price Action and Structure.** Trend, volume, moving averages and volatility,
above an SVG sparkline of roughly the last 120 daily closes with the support
and resistance the report named drawn across it. The levels also repeat as
chips, so you can read them without reading the paragraph.

**Catalysts and Developments.** What is actually happening, with inline
numbered citations wired to their sources and the cited pages surfaced as
cards. For equities this covers earnings, revenue and EPS surprises, and
guidance changes; for crypto, protocol and ecosystem events.

**Market Context.** The wider backdrop: policy, yields, the dollar, inflation
and employment data where relevant.

**Trade Setup.** A card, not a paragraph: bias with a direction icon, entry
zone, invalidation (the stop), targets, and reward-to-risk, each in its own
field. When nothing is attractive, it states the conditions that would create a
setup instead of inventing levels.

**Risk Factors.** What would make the thesis wrong.

**Sources.** Source cards under the report, numbered to match the citations,
all from the search results or news list. The prompt forbids inventing or
altering a URL, so a link that does not resolve is a bug worth reporting rather
than a hallucination you should expect.

Reports run 1,000 to 1,800 words and end with an explicit note that they are
informational and not financial advice.

The sparkline is a picture of the report, not your chart. To get the levels onto
the real one, say "draw those levels": the assistant puts support, resistance,
entry, stop and target on it as drawings you can drag or delete.

## Cost

Research is the most expensive thing the AI does: a long generation plus web
searches. On hosted Intelligence it draws from the same credit budget as
everything else, with each hosted web search costing a flat amount of credits
on top of the tokens. On your own provider key, it costs whatever your provider
charges.

Ask for one per pair per session, not one per idle moment. While it runs, the
line beside the orb reads **Looking on the web...**, and you can minimize the
window and keep working; the run does not stop.

## Related

- [The AI assistant](/docs/ai-copilot)
- [Assistant tool reference](/docs/copilot-tools)
- [AI providers](/docs/ai-providers)
