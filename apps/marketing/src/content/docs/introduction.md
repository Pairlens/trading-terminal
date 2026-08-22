---
title: Introduction
description: What Pairlens is, who it is for, and how a trading terminal differs from an exchange website. Charts, order books, orders, automation and an AI assistant, all running on your own machine.
group: get-started
order: 1
eyebrow: Get started
updated: 22 AUG 2026
readTime: 5 min read
---

Pairlens is a trading terminal. That word has a specific meaning, and it is
worth 30 seconds before anything else.

An **exchange** is where trades happen. Coinbase, Binance, Kraken and the rest
each run a marketplace, hold your funds, and match your buy against somebody
else's sell. A **terminal** is the cockpit you sit in to watch those
marketplaces and act on them. It does not hold your money. It connects to the
exchanges you already have accounts with, pulls their live prices onto one
screen, and sends your orders back to them.

That split is why professional traders use one. An exchange website shows you
its own market and nobody else's, in whatever layout it decided you want. A
terminal shows you every market you care about, side by side, in a layout you
built, with the same tools on all of them.

## The one rule

Pairlens never touches your money.

Your machine talks straight to the exchange. There is no Pairlens server in the
middle holding your keys, marking up prices, or taking a cut of your trades.
When you connect an account, the API key you paste in is stored on your own
device and used only to sign requests to that one venue. We could not move your
funds if we wanted to, because we never hold anything that would let us.

The full source code is public, so you never have to take our word for it.

## What you can trade

One terminal, seven kinds of market, all with the same chart, the same order
ticket and the same risk limits:

**Crypto spot.** Buying and selling coins outright on 14 exchanges. This is the
plain version of trading: you pay dollars, you own the coin.

**Perpetual futures.** Contracts that track a coin's price without ever
expiring, usually traded with leverage. Higher risk, and the place most new
traders lose money fastest. See [perpetual futures](/docs/cex-futures).

**US stocks and ETFs.** Apple, SPY, and everything else on the US market,
through a broker called Alpaca. See [US equities](/docs/equities).

**On-chain tokens.** Swapping directly on decentralized exchanges from your own
wallet, on Solana and five other chains. See [DEX and wallets](/docs/dex-trading).

**Memecoins.** The launchpad end of on-chain trading, with its own board for
watching new tokens appear and graduate. See [memecoins](/docs/memecoins).

**Prediction markets.** Contracts that pay $1 if an event happens and nothing
if it does not, so their price reads as a probability. See
[prediction markets](/docs/prediction-markets).

**NFT collections.** Treated as markets rather than galleries: floor prices,
bid and ask ladders, and a sales tape. See [NFT collections](/docs/nft-trading).

You do not need all of them. Most people use one or two and ignore the rest.

## No lock-in, anywhere

Pairlens is not tied to one exchange, one broker, or one country. Use whichever
venues work where you live, switch between them freely, or run several side by
side. Your accounts stay yours and your data stays on your machine. If you ever
leave, there is nothing to cancel and nothing to export from our servers,
because nothing of yours was ever on them.

## What is in the box

**Charts.** 16 chart types, 90 indicators, 45 drawing tools, and bar replay for
practising on history. See [the chart](/docs/chart-panel).

**Market reading.** Order book, trade tape, depth curve and liquidity heatmap.
These are the panels that tell you what is happening right now, underneath the
candles. See [reading the market](/docs/market-data).

**Trading.** Market, limit and bracket orders routed straight to your venue,
with [risk guardrails](/docs/risk-guardrails) checked before anything leaves
your machine.

**Automation.** [Alerts](/docs/alerts-notifications) that watch a level and tell
you. [Workflows](/docs/build-a-workflow) that fire an entry, a stop and a
target as one chain. [Bots](/docs/bots) that trade a strategy while you sleep.

**Python.** Write your own indicators and strategies in real Python, running on
your machine. Optional, and nothing else depends on it. See
[Python scripts](/docs/python-scripts).

**An AI assistant.** One assistant across the whole terminal that can read your
charts, explain what a panel is showing, research an asset with cited sources,
and propose trades you approve or reject. It can never place an order on its
own and it can never move your risk limits. See
[the AI assistant](/docs/ai-copilot).

## Three ways to run it

**In your browser.** Open
[terminal.pairlens.finance](https://terminal.pairlens.finance) and you are on a
live chart in seconds. Nothing to install, no account needed. Your credentials
live in an encrypted vault inside your browser.

**On your desktop.** A free app for macOS, Windows and Linux. It stores your
exchange keys in your operating system's own keychain, keeps bots running in
the background, and reaches eight venues the browser cannot. This is the
strongest place to keep live-trading keys. See
[the desktop app](/docs/desktop-app).

**On your phone.** The same web address on a phone opens a chart-first mobile
terminal with real order entry, not a cut-down dashboard. See
[mobile terminal](/docs/mobile-terminal).

You can use all three with the same account. Sign-in is optional and only
exists to sync your layouts between devices.

## Where to start

**If you are new to trading.** Read the [Quickstart](/docs/quickstart), then the
[terminal tour](/docs/terminal-tour), then
[reading the market](/docs/market-data). Practise with
[paper trading](/docs/paper-trading) before you connect real money. Every term
you do not recognise is in the [glossary](/docs/glossary).

**If you have traded before.** [Connect an exchange](/docs/connect-an-exchange),
set your [risk guardrails](/docs/risk-guardrails), and build the
[workspace](/docs/workspaces) you actually want.

**If you write code.** The [Plugin SDK](/docs/plugin-sdk) adds venues, AI
providers and panels. The [CLI](/docs/cli-reference) gives you the same
connectors headless, and [Fast Financial Charts](/docs/charts) is the chart
engine as a standalone MIT library.

**If you are evaluating this for a firm.** See
[self-hosting](/docs/self-hosting) and the
[security model](/docs/security-model).

Ready? Head to the [Quickstart](/docs/quickstart).
