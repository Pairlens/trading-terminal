---
title: Co-pilot tool reference
description: All 63 tools the Pairlens co-pilot can call, by family, with what each one reads or does and which ones require confirmation.
group: builders
parent: agent-interfaces
order: 1
eyebrow: For builders
updated: AUG 2026
readTime: 6 min read
---

The co-pilot's agentic loop runs in the terminal, not on a server. These are the
tools it can call. Every one of them executes on your machine, against data your
connectors already hold or your credentials can reach.

Tool calls are visible in the chat as labelled chips, so you can always see what
was read and in what order.

## Market data

Nine tools over live venue data. All of them default to the on-screen pair when
you omit arguments, which is what makes "is this overbought" a complete question.

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

## Context

| Tool                 | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `get_top_coins`      | Top coins by market cap with 1h, 24h, and 7d change             |
| `get_news`           | Recent news with sentiment, filterable by ticker                |
| `get_fear_greed`     | The Fear and Greed index, current and recent                    |
| `get_asset_overview` | Fundamentals for an asset: description, supply, category, links |
| `get_trade_journal`  | Your own logged trades and the reasoning attached to them       |
| `web_search`         | Live web search, through your configured search provider        |

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
anything the co-pilot draws is a real drawing you can edit or delete.

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

## Workspace

| Tool                                                           | What it does                            |
| -------------------------------------------------------------- | --------------------------------------- |
| `add_to_watchlist`, `remove_from_watchlist`, `get_watchlist`   | Manage your watchlists                  |
| `create_price_alert`, `get_price_alerts`, `remove_price_alert` | Simple price-crossing alerts            |
| `add_journal_entry`                                            | Log a trade and the reasoning behind it |
| `switch_market`, `switch_pair`, `set_timeframe`                | Move the active chart                   |

`remove_price_alert` only removes simple price alerts. Custom notification flows
built on the [alerts canvas](/docs/alerts-notifications) are yours to edit, not
the model's.

`add_journal_entry` is record-keeping. It does not place anything.

## Time

| Tool             | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `wait`           | Pause up to 120 seconds, then re-check in the same turn                   |
| `schedule_check` | Schedule a follow-up up to 240 minutes out, which re-runs with fresh data |

`wait` is for letting a candle close or an order fill inside one answer.
`schedule_check` sends your instruction back into the chat when the timer fires,
so the model runs again against new data.

**`schedule_check` only fires while the terminal is open.** For a durable,
price-triggered follow-up use `create_price_alert`, or build a flow under
[Notifications](/docs/alerts-notifications).

## Trading

Two tools, and neither of them executes.

| Tool           | What it does                                      |
| -------------- | ------------------------------------------------- |
| `place_order`  | Prepares a spot order proposal for you to confirm |
| `cancel_order` | Prepares a cancellation for you to confirm        |

A proposal renders as a confirm card in the chat. Approving it sends the order
through the same guarded path as the order ticket, with the same risk checks,
the same press-and-hold or click gesture, and the same lock-before-order prompt
if you have one configured.

The model is told to call `get_risk_limits` and `get_portfolio` before sizing
anything, and the limits are enforced regardless of whether it did.

Standing auto-approval can be granted per market, and separately for paper and
live, under [risk guardrails](/docs/risk-guardrails). Even an auto-approved
proposal is validated against your caps, and even an auto-approved proposal can
be gated behind the terminal lock.

## Adding tools

Installed plugins can contribute tools, and third-party or MCP tool ids that
Pairlens does not recognise fall back to a humanised label in the chat rather
than being hidden. See the [Plugin SDK](/docs/plugin-sdk).

## Where to next

- [Agent interfaces](/docs/agent-interfaces) for the other three surfaces
- [The AI co-pilot](/docs/ai-copilot) for personas and day-to-day use
- [Risk guardrails](/docs/risk-guardrails) for the boundary the tools sit inside
