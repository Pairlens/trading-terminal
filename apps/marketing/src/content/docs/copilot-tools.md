---
title: Assistant tool reference
description: All 110 tools the Pairlens assistant can call, by category, with what each one reads or does, which are gated on what is mounted, and which need your confirmation.
group: builders
parent: agent-interfaces
order: 1
eyebrow: For builders
updated: 19 AUG 2026
readTime: 10 min read
---

The assistant's agentic loop runs in the terminal, not on a server. These are
the tools it can call. Every one of them executes on your machine, against data
your connectors already hold or your credentials can reach.

Tool calls are visible in the chat as labelled chips, so you can always see what
was read and in what order. A turn runs up to 28 steps before it stops.

Two rules govern which of the 110 are actually on the table for a given step, and
both are re-read on every step rather than fixed when the turn started:

- The 27 chart tools that change something are offered only while a chart is
  mounted. `update_script`, `delete_file` and `set_preview_target` only while
  the workbench is open.
- Surfaces publish their own actions, so the mounted screen adds tools of its
  own. See [surface actions](#surface-actions).

## Market data

Ten tools over live venue data. All of them default to the instrument on screen
when you omit arguments, which is what makes "is this overbought" a complete
question, and none of them are limited to it: any instrument on any connected
venue is one call away.

What "the instrument on screen" resolves to is decided by the mounted surface
that ranks highest, not by the chart. That distinction is the whole reason a
prediction board works: it has no candle chart, and its desk names the outcome
the order ticket is pointed at.

| Tool                  | What it does                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `get_market_snapshot` | Candle summary (SMA 20/50/200, ATR14, trend), ticker, latest signal and regime, in one call |
| `get_candles`         | OHLCV for any pair and timeframe, as a summary plus the most recent bars                    |
| `get_ticker`          | Current price and 24h stats                                                                 |
| `get_signals`         | The deterministic strategy signal (breakout, EMA pullback, mean reversion) and the regime   |
| `get_orderbook`       | Top of book with spread and bid/ask imbalance                                               |
| `get_recent_trades`   | The live tape: recent prints with size, side and time, plus the buy/sell split              |
| `get_multi_timeframe` | The same pair across several timeframes at once, for confluence                             |
| `compare_pairs`       | Percentage change and trend across several pairs, for relative strength                     |
| `list_markets`        | Which venues this session has, with asset classes, timeframes, and capabilities             |
| `search_instruments`  | Find pairs and long-tail tokens by name or symbol                                           |

Signals come from [the strategy engine](/docs/strategies-and-backtests), which is
pure deterministic math. The model reads its output; it does not invent it.

## Context and research

| Tool                 | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `get_top_coins`      | Top coins by market cap with 1h, 24h, and 7d change             |
| `get_news`           | Recent news with sentiment, filterable by ticker                |
| `get_fear_greed`     | The Fear and Greed index, current and recent                    |
| `get_asset_overview` | Fundamentals for an asset: description, supply, category, links |
| `get_trade_journal`  | Your own logged trades and the reasoning attached to them       |
| `web_search`         | Live web search, through your configured search provider        |
| `deep_research`      | A full sourced report on one instrument, rendered as a card     |

`deep_research` is what used to be the Research panel, and the panel's
rendering came with it. It searches the web, pulls 200 daily and 200 hourly bars
plus signals, and writes a structured report with citations, which lands in the
chat as a collapsible card that keeps the per-section presentation: verdict
badge, sparkline with levels, trade-setup card, source cards. It takes tens of
seconds and costs accordingly. See [research reports](/docs/research-reports).

`web_search` needs an `ai:web-search` provider (Tavily or Exa with your own key,
or hosted Intelligence). Whatever it finds is attributed: an answer built on a
search carries a source count under it that opens into the list of pages. The
rest of this family reads from the App Server and is unavailable in
[standalone mode](/docs/self-hosting#standalone-mode).

## Prediction markets

A prediction market publishes its prices on the **event**, as an outcome ladder.
Nothing else in this reference can reach one: candles and order books address a
single outcome, and an event has neither. These two tools are how the assistant
sees an event at all.

| Tool                       | What it does                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_prediction_event`     | One event in full: question, category, resolution date and criteria, volume, liquidity, and every outcome with its probability, bid, ask and 24h move |
| `search_prediction_events` | Search events across every active venue by text or category, with each one's leading outcomes                                                         |

On a race, `get_prediction_event` also returns **what the whole field costs**:
the sum of every Yes price, and how far that sits from a fair 100%. Buying every
answer of a field priced at 103.4% is a guaranteed 3.4% loss. A binary market
gets no such number, because its two legs sum to a dollar by construction and
reporting that as a reading would invent an edge.

Prices come back as probabilities in collateral units, 0 to 1, with the
percentage alongside. Every outcome carries the `pairKey` an order takes, which
is what makes "buy me some of that one" actionable: an event id is not tradeable,
an outcome is.

Both tools ask each venue directly, so a venue that refuses is reported as
refusing. Kalshi needing the desktop app is a fact about your build, not an
event that does not exist.

Open one with `open_instrument`, described under [Terminal](#terminal).

## Calendars, filings and market structure

Eleven reads over the data layers behind the calendar, fundamentals, session,
funding, liquidation, pool and bridge panes. Each is one call, so "what is on the
calendar this week" no longer means finding the pane first.

The five below go through the App Server.

| Tool                       | What it does                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `get_economic_calendar`    | US macro releases ahead (CPI, payrolls, FOMC), with consensus and prior where published           |
| `get_earnings_calendar`    | Who reports inside a window, with the EPS estimate and the stated before-open or after-close slot |
| `get_company_fundamentals` | One listed company: market cap, margins, growth, multiples, analyst ratings, next report          |
| `get_ipo_calendar`         | Upcoming listings with expected date, exchange and price range                                    |
| `get_insider_activity`     | Recent Form 4 filings, with a buy against sell summary over the span actually on file             |

These six go to your connectors instead, so they keep working on a build with
no App Server. `get_new_listings` uses both and degrades to the on-chain half.

| Tool                       | What it does                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `get_funding_rates`        | Funding and open interest across every active perpetual venue, or named contracts                     |
| `get_liquidation_clusters` | Forced liquidations collapsed onto price buckets, long and short sides kept apart                     |
| `get_pool_stats`           | One pool's price, 1h and 24h moves, volume, value locked, fee tier and who measured it                |
| `get_new_listings`         | Pairs that started trading recently: venue listings merged with newly created pools                   |
| `get_bridge_quote`         | Prices a cross-chain transfer: what lands, the guaranteed floor, fee, gas and ETA                     |
| `get_market_session`       | Where the US equity trading day is: open, pre-market, after-hours or closed, on the venue's own clock |

**`get_bridge_quote` prices, it never sends.** There is no execution tool. A
transfer is signed by you in the Bridge pane, and the assistant points you there.

Three honesty rules these follow, because a confident wrong answer about a
calendar is worse than no answer:

- An empty result is never used for a missing provider. A standalone build, a
  deployment with no fundamentals key, a throttled provider and an upstream
  failure each come back as themselves, and the assistant relays the reason.
- Liquidation coverage is per venue, read from the collector's own venue list. Ask
  about a venue nobody collects and it says so and names the ones it has, rather
  than drawing a map from someone else's data.
- A venue that refuses funding is reported as refusing. KuCoin Futures needing
  the desktop app is a fact about your build, not a zero funding rate.

Results are capped so a venue-wide sweep does not crowd out the rest of the
turn, and a capped list always states the total it was cut from.

## Portfolio

| Tool                   | What it does                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- |
| `get_portfolio`        | Holdings across connected exchanges and wallets                               |
| `get_open_orders`      | Open orders and recent order history, paper and live                          |
| `get_risk_limits`      | Your guardrails and current usage: caps, today's P&L, trade count, lock state |
| `get_account_settings` | Trading mode, AI persona, and standing auto-approval permissions              |

These require connected credentials. The credentials themselves never enter the
model's context: the tool runs locally, signs the venue request, and returns the
result.

## Chart control

Thirty tools, split four ways. This is the same surface a user drives by hand, so
anything the assistant draws is a real drawing you can edit or delete.

**Indicators (4).** `add_indicator`, `remove_indicator`, `remove_all_indicators`,
`update_indicator`.

**Drawings (14).** `draw_horizontal_line`, `draw_vertical_line`, `draw_trendline`,
`draw_rectangle`, `draw_circle`, `draw_fibonacci`, `annotate_chart`,
`draw_stop_loss`, `draw_take_profit`, `draw_entry_price`, `remove_drawing`,
`clear_drawings`, `undo`, `redo`.

The three trade-level tools are the useful ones in practice: ask for a setup and
you get entry, stop, and target drawn in their conventional colours, which makes
the risk-reward visible instead of described.

**View (9).** `set_chart_type`, `set_price_scale`, `fit_content`,
`scroll_to_latest`, `take_screenshot`, `add_compare_symbol`,
`remove_compare_symbol`, `start_replay`, `exit_replay`. `take_screenshot`
puts the captured chart in the conversation, which is how "mark the levels
and show me" ends with a picture rather than a sentence.

**Read-back (3).** `get_chart_state`, `get_chart_indicators`,
`get_chart_drawings`. These are what let it answer questions about what is
already on your chart, including levels you drew yourself.

The first 27 are the gated ones. On the bots page there is no chart, so they are
not offered; ask for a drawing there and the assistant navigates to a chart
first.

## Workspace

| Tool                                                           | What it does                            |
| -------------------------------------------------------------- | --------------------------------------- |
| `add_to_watchlist`, `remove_from_watchlist`, `get_watchlist`   | Manage your watchlists                  |
| `create_price_alert`, `get_price_alerts`, `remove_price_alert` | Simple price-crossing alerts            |
| `add_journal_entry`                                            | Log a trade and the reasoning behind it |
| `switch_market`, `switch_pair`, `set_timeframe`                | Move the active chart                   |

`remove_price_alert` deletes simple price alerts only. A custom flow built on
the [alerts canvas](/docs/alerts-notifications) has to be edited there, or
through `update_alert_flow` below.

`add_journal_entry` is record-keeping. It does not place anything.

## Terminal

| Tool              | What it does                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate_to`     | Open a page, optionally on one record: Discovery, Accounts, Bots, Indicators, Workflows, Notifications, the Plugin Store, the Workspace Store        |
| `open_instrument` | Put any instrument on screen by class, venue and id: a spot pair, a perp, an on-chain token, a stock, or a prediction event                          |
| `get_screen`      | Read what is mounted right now, what each surface is showing (with real record ids), which surface actions are available, and what can be pointed at |
| `highlight_ui`    | Glow a pane, the script editor or the whole terminal frame for six seconds, to show you where something just happened                                |

`navigate_to` takes a page id from a closed list, not a free path, so it cannot
send you to a route that does not exist. It also takes a `target`: a workflow
id, a bot id, an alert rule id, a script id, a plugin id, a template id, or a
Discovery section. So it opens the thing it was just talking about rather than
dropping you on a list to find it yourself. A target that is not a usable id is
dropped and you land on the page. It is how the assistant acts somewhere else
instead of telling you to go there: the page's own tools become available on its
next step.

`get_screen` returns ids, not just prose. A workflow id from it goes straight
into `get_workflow`, a bot id into `get_bot`, and so on, which is what makes
"explain this alert" a single question rather than a game of twenty.

`highlight_ui` is the pointing finger described in
[the assistant's page](/docs/ai-copilot). Targets are published by whatever is
mounted, so every pane in your workspace is one, under its own name, including
panes that arrive with a plugin. Pointing at something that is not on screen is
refused and handed back with the list of what is, rather than silently doing
nothing and letting the answer claim otherwise. `navigate_to` glows the terminal
frame on its own, so a page change you did not make is always attributable.

## Scripts and bots

Fifteen tools, the ones that used to belong to the builder rail on
**Indicators & Strategies** and **Bots**.

| Tool                                               | What it does                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `list_scripts`, `get_script`                       | Read your Python indicators and strategies, every file of them                |
| `create_script`, `update_script`, `delete_file`    | Write them. Every write is validated in the Pyodide runtime                   |
| `validate_script`                                  | Re-run validation and get the traceback back                                  |
| `run_backtest`                                     | Backtest a strategy through the same engine live bots use                     |
| `set_preview_target`                               | Move the workbench preview onto the venue, pair, timeframe and depth it needs |
| `get_sdk_reference`, `list_venues`                 | Look up the `pairlens` Python SDK, and which venues are connected             |
| `list_bots`, `get_bot`, `create_bot`, `update_bot` | Read, deploy and tune bots                                                    |
| `ask_user`                                         | Ask one question with tappable options, and stop until you answer             |

`ask_user` is the one tool with no implementation. The model's turn ends on the
call, the terminal renders the options, and the answer you tap becomes the tool
result that resumes the run. That is how a decision that is yours stays yours.

Validation is a loop, not a check. When the runtime rejects a write, the
traceback goes back to the model rather than to you, so what you see is the
attempt and the repair, and the script works by the time it says it is done.

**A bot is always created in paper mode and switched off.** No tool here can
enable, arm, or retarget one. The ARM LIVE gate stays yours. See
[bots](/docs/bots).

## Workflows and alerts

| Tool                                         | What it does                                                 |
| -------------------------------------------- | ------------------------------------------------------------ |
| `list_workflows`, `get_workflow`             | Read your workflows and their step graphs                    |
| `create_workflow`, `update_workflow`         | Write a whole step graph in one call, laid out and validated |
| `get_step_reference`                         | The installed workflow step palette, with each step's config |
| `list_alerts`, `get_alert`                   | Read your alerts, simple and custom                          |
| `create_simple_alert`, `update_simple_alert` | Two-field price and percent-move alerts                      |
| `create_alert_flow`, `update_alert_flow`     | Full alert step graphs                                       |
| `bind_alert`                                 | Point an alert at a venue and pair                           |
| `get_alert_step_reference`                   | The alert step palette                                       |

Workflow graphs and alert flows land in the open builder as **pending changes**.
The commit bar you already use is what makes them real, and the assistant has no
tool that commits.

Simple price and percent-move alerts are the exception and arm on creation,
because an alert nobody armed is not an alert. The assistant says so when it
makes one.

## Time

| Tool             | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `wait`           | Pause up to 120 seconds, then re-check in the same turn                   |
| `schedule_check` | Schedule a follow-up up to 240 minutes out, which re-runs with fresh data |

`wait` is for letting a candle close or an order fill inside one answer.
`schedule_check` sends your instruction back into the chat when the timer fires,
so the model runs again against new data. Because the assistant is mounted above
the routed content, a scheduled follow-up now survives you walking to another
page.

**`schedule_check` only fires while the terminal is open.** For a durable,
price-triggered follow-up use `create_price_alert`, or build a flow under
[Notifications](/docs/alerts-notifications).

## Trading

Two tools, and neither of them executes.

| Tool           | What it does                                  |
| -------------- | --------------------------------------------- |
| `place_order`  | Prepares an order proposal for you to confirm |
| `cancel_order` | Prepares a cancellation for you to confirm    |

A proposal renders as a confirm card in the chat. Approving it sends the order
through the same guarded path as the order ticket, with the same risk checks,
the same press-and-hold or click gesture, and the same lock-before-order prompt
if you have one configured. Spot, perpetual and prediction-market orders all
take this route.

The model is told to call `get_risk_limits` and `get_portfolio` before sizing
anything, and the limits are enforced regardless of whether it did.

Standing auto-approval can be granted per market, and separately for paper and
live, under [risk guardrails](/docs/risk-guardrails). Even an auto-approved
proposal is validated against your caps, and even an auto-approved proposal can
be gated behind the terminal lock.

## Surface actions

The 110 above are the fixed set. Anything mounted can publish tools of its own,
and they exist for exactly as long as it is on screen.

The workspace board is the built-in example. It publishes
`list_workspace_panes`, `add_pane` and `remove_pane`, so "put a depth chart and
a tape next to this" is executed by the board that owns the layout rather than
by a global tool that would have to find one. Navigate away and all three
withdraw.

A published action can also require approval, in which case the call parks and
the chat renders a card, the same mechanism the order proposals use.

## Adding tools

Installed plugins can contribute tools, and third-party or MCP tool ids that
Pairlens does not recognise fall back to a humanised label in the chat rather
than being hidden. See the [Plugin SDK](/docs/plugin-sdk).

## Where to next

- [Agent interfaces](/docs/agent-interfaces) for the other ways to drive Pairlens
- [The AI assistant](/docs/ai-copilot) for day-to-day use
- [Risk guardrails](/docs/risk-guardrails) for the boundary the tools sit inside
