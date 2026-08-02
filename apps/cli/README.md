# @pairlens/cli

**Markets from your shell.** Candles, live tickers, order books, deterministic trading signals, and paper orders — straight from exchange APIs, no accounts, no server. The CLI uses the exact same connector plugins and strategy engine as the [Pairlens terminal](../../README.md), so anything the terminal can read, you can pipe into a script.

Handy for quick lookups, cron-driven data pulls (`--format csv`), strategy prototyping against the same signal math the terminal uses, and testing new connector plugins headlessly.

## Usage

```bash
bun apps/cli/src/index.ts <command> [flags]
```

## Commands

### `candles` — Fetch historical OHLCV data

```bash
# JSON output (default)
bun apps/cli/src/index.ts candles --pair BTC-USDT --timeframe 1h --limit 100

# CSV output
bun apps/cli/src/index.ts candles --pair BTC-USDT --timeframe 1d --limit 30 --format csv

# From a specific exchange
bun apps/cli/src/index.ts candles --market binance --pair ETH-USDT --timeframe 15m --limit 50
```

| Flag          | Description                                            | Default  |
| ------------- | ------------------------------------------------------ | -------- |
| `--pair`      | Trading pair (e.g. BTC-USDT)                           | required |
| `--market`    | Exchange (okx, binance, bybit)                         | okx      |
| `--timeframe` | Candle interval (1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w) | 1h       |
| `--limit`     | Number of candles                                      | 100      |
| `--format`    | Output format (json, csv)                              | json     |
| `--country`   | ISO country code for regional routing                  | ""       |

### `ticker` — Current price

```bash
# One-shot snapshot
bun apps/cli/src/index.ts ticker --pair BTC-USDT

# Live streaming (updates in place, Ctrl+C to stop)
bun apps/cli/src/index.ts ticker --pair ETH-USDT --watch
```

| Flag       | Description         | Default  |
| ---------- | ------------------- | -------- |
| `--pair`   | Trading pair        | required |
| `--market` | Exchange            | okx      |
| `--watch`  | Stream live updates | false    |

### `orderbook` — Order book depth

```bash
# Snapshot with 10 levels per side
bun apps/cli/src/index.ts orderbook --pair BTC-USDT --levels 10

# Live streaming order book
bun apps/cli/src/index.ts orderbook --pair SOL-USDT --levels 20 --watch
```

| Flag       | Description           | Default  |
| ---------- | --------------------- | -------- |
| `--pair`   | Trading pair          | required |
| `--market` | Exchange              | okx      |
| `--levels` | Depth levels per side | 10       |
| `--watch`  | Stream live updates   | false    |

### `signals` — Compute trading signals

Fetches historical candles and runs the strategy engine (breakout, EMA pullback, mean reversion) to detect signals and market regime.

```bash
bun apps/cli/src/index.ts signals --pair BTC-USDT --timeframe 1h
bun apps/cli/src/index.ts signals --pair SOL-USDT --timeframe 4h --lookback 30
```

| Flag          | Description                                 | Default  |
| ------------- | ------------------------------------------- | -------- |
| `--pair`      | Trading pair                                | required |
| `--market`    | Exchange                                    | okx      |
| `--timeframe` | Candle interval                             | 1h       |
| `--lookback`  | How many candles to scan for recent signals | 20       |

### `order` — Place a trade

```bash
# Paper mode market order
bun apps/cli/src/index.ts order --pair BTC-USDT --side buy --size 0.001 --mode paper

# Live limit order
bun apps/cli/src/index.ts order --pair ETH-USDT --side sell --type limit --size 0.5 --price 2200 --mode live

# Credentials via flags
bun apps/cli/src/index.ts order --pair BTC-USDT --side buy --size 0.001 \
  --api-key YOUR_KEY --api-secret YOUR_SECRET --passphrase YOUR_PASS

# Credentials via environment variables
OKX_API_KEY=... OKX_API_SECRET=... OKX_PASSPHRASE=... \
  bun apps/cli/src/index.ts order --pair BTC-USDT --side buy --size 0.001
```

| Flag           | Description                             | Default           |
| -------------- | --------------------------------------- | ----------------- |
| `--pair`       | Trading pair                            | required          |
| `--side`       | buy or sell                             | required          |
| `--size`       | Order size in base asset                | required          |
| `--type`       | market or limit                         | market            |
| `--price`      | Limit price (required for limit orders) | —                 |
| `--mode`       | paper or live                           | paper             |
| `--market`     | Exchange                                | okx               |
| `--api-key`    | Exchange API key                        | `$OKX_API_KEY`    |
| `--api-secret` | Exchange API secret                     | `$OKX_API_SECRET` |
| `--passphrase` | Exchange passphrase                     | `$OKX_PASSPHRASE` |

### `markets` — List available exchanges

```bash
bun apps/cli/src/index.ts markets
# → Available markets: okx, binance, bybit
```

## Regional routing

Use `--country` to route API requests to the correct regional endpoint:

```bash
# US users → us.okx.com
bun apps/cli/src/index.ts candles --pair BTC-USDT --country US

# EU users → eea.okx.com
bun apps/cli/src/index.ts ticker --pair ETH-USDT --country DE
```

## For AI agents

The CLI outputs structured JSON by default, making it suitable for tool use by AI agents:

```bash
# Get market snapshot for analysis
bun apps/cli/src/index.ts candles --pair BTC-USDT --timeframe 1d --limit 30

# Check current signals
bun apps/cli/src/index.ts signals --pair BTC-USDT --timeframe 4h

# Get real-time price
bun apps/cli/src/index.ts ticker --pair BTC-USDT
```
