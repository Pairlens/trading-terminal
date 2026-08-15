---
title: Assistant tool reference
description: All 94 tools the Pairlens assistant can call, by category, with what each one reads or does, which are gated on what is mounted, and which need your confirmation.
group: builders
parent: agent-interfaces
order: 1
eyebrow: For builders
updated: 16 AUG 2026
readTime: 8 min read
---

The assistant's agentic loop runs in the terminal, not on a server. These are
the tools it can call. Every one of them executes on your machine, against data
your connectors already hold or your credentials can reach.

Tool calls are visible in the chat as labelled chips, so you can always see what
was read and in what order. A turn runs up to 28 steps before it stops.

Two rules govern which of the 94 are actually on the table for a given step, and
both are re-read on every step rather than fixed when the turn started:

- The 27 chart tools that change something are offered only while a chart is
  mounted. `update_script`, `delete_file` and `set_preview_target` only while
  the workbench is open.
- Surfaces publish their own actions, so the mounted screen adds tools of its
  own. See [surface actions](#surface-actions).

## Market data

Nine tools over live venue data. All of them default to the on-screen pair when
you omit arguments, which is what makes "is this overbought" a complete question,
and none of them are limited to it: any instrument on any connected venue is one
call away.

| Tool                  | What it does                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `get_market_snapshot` | Candle summary (SMA 20/50/200, ATR14, trend), ticker, latest signal and regime, in one call |
| `get_candles`         | OHLCV for any pair and timeframe, as a summary plus the most recent bars                    |
| `get_ticker`          | Current price and 24h stats                                                                 |
| `get_signals`         | The deterministic strategy signal (breakout, EMA pullback, mean reversion) and the regime   |
| `get_orderbook`       | Top of book with spread and bid/ask imbalance                                               |
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
or hosted Intelligence). The rest of this family reads from the App Server and is
unavailable in [standalone mode](/docs/self-hosting#standalone-mode).

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
`remove_compare_symbol`, `start_replay`, `exit_replay`.

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

| Tool          | What it does                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate_to` | Open a page, optionally on one record: Discovery, Accounts, Bots, Indicators, Workflows, Notifications, the Plugin Store, the Workspace Store |
| `get_screen`  | Read what is mounted right now, what each surface is showing (with real record ids), and which surface actions are available                  |

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

The 94 above are the fixed set. Anything mounted can publish tools of its own,
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
