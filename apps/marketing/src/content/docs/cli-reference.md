---
title: CLI reference
description: Candles, tickers, order books, signals, and orders from the command line, using the same connectors and strategy engine as the terminal.
group: builders
order: 3
eyebrow: For builders
updated: AUG 2026
readTime: 4 min read
---

The Pairlens CLI is a Bun program for headless market interaction. It uses the
exact same connector plugins and strategy engine as the terminal, so what you
see on the command line matches what you would see on the chart.

```bash
bun apps/cli/src/index.ts help
```

## Common flags

| Flag        | Meaning                                                 | Default  |
| ----------- | ------------------------------------------------------- | -------- |
| `--market`  | Which connector to use (`okx`, `binance`, `bybit`, ...) | `okx`    |
| `--pair`    | Trading pair, for example `BTC-USDT`                    | required |
| `--country` | ISO country code, for regional endpoint routing         | empty    |

`--country` matters for the same reason it matters in the terminal: several
venues serve different endpoints by region, and some refuse requests from
certain countries.

## Commands

### candles

Historical OHLCV.

```bash
bun apps/cli/src/index.ts candles --market okx --pair BTC-USDT --timeframe 1h --limit 100
```

`--timeframe` defaults to `1h`, `--limit` to `100`, and `--format` accepts
`json` (default) or `csv`. CSV output pipes straight into anything.

```bash
bun apps/cli/src/index.ts candles --pair BTC-USDT --format csv > btc-1h.csv
```

### ticker

Current price, once or streaming.

```bash
bun apps/cli/src/index.ts ticker --market okx --pair ETH-USDT
bun apps/cli/src/index.ts ticker --market okx --pair ETH-USDT --watch
```

`--watch` holds the WebSocket open and prints each update.

### orderbook

Order book snapshot, or a live book.

```bash
bun apps/cli/src/index.ts orderbook --market binance --pair BTC-USDT --levels 20
bun apps/cli/src/index.ts orderbook --pair BTC-USDT --levels 20 --watch
```

`--levels` defaults to `10`.

### signals

Signals computed on demand from the candle buffer with
`@pairlens/strategy-engine`.

```bash
bun apps/cli/src/index.ts signals --market okx --pair SOL-USDT --timeframe 4h
```

`--timeframe` defaults to `1h` and `--lookback` to `20` candles.

### order

Place an order in paper or live mode.

```bash
bun apps/cli/src/index.ts order --market okx --pair BTC-USDT --side buy --size 0.001 --mode paper
```

| Flag      | Meaning                          | Default  |
| --------- | -------------------------------- | -------- |
| `--side`  | `buy` or `sell`                  | required |
| `--size`  | Order size                       | required |
| `--type`  | `market` or `limit`              | `market` |
| `--price` | Limit price, when `--type limit` | none     |
| `--mode`  | `paper` or `live`                | `paper`  |

Live orders need credentials. Pass them with `--api-key`, `--api-secret`, and
`--passphrase`, or set `OKX_API_KEY`, `OKX_API_SECRET`, and `OKX_PASSPHRASE` in
the environment. The order goes straight to the venue, exactly as it does from
the terminal.

Prefer environment variables over flags in any shared shell. Flags land in your
shell history.

### markets

List the connectors available in this build, the prediction venues included.

```bash
bun apps/cli/src/index.ts markets
```

Nothing here runs in a browser, so the venues that need the desktop app in the
terminal are reachable from the CLI on any machine.

## What the CLI does not do

It is a market-interaction tool, not a headless terminal. Workflows, bots,
alerts, Python indicators, and the AI co-pilot all live in the terminal
process. A bot in particular needs the running app, which is
[covered in its own doc](/docs/bots).

For how the CLI compares to the other ways an agent can drive Pairlens, see
[agent interfaces](/docs/agent-interfaces).
