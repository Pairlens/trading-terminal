---
title: Perpetual futures
description: Trade perpetual swaps on Binance Futures, KuCoin Futures and Kraken Futures from the same terminal, with a leverage selector, reduce-only orders, contract sizing and a positions panel.
group: traders
parent: trading
order: 8
eyebrow: For traders
updated: AUG 2026
readTime: 6 min read
---

A perpetual future is a contract that tracks a spot price without ever
expiring. You post margin, take a leveraged position long or short, and pay or
receive funding to keep the contract pinned near spot. In Pairlens it behaves
like any other instrument: it has a chart, an order book, a tape, and the same
guarded ticket. What changes is the unit and the risk. Size is counted in
contracts rather than in the base asset, a position can be liquidated, and a
short is a first-class position rather than the absence of a holding.

Pairlens ships three perpetual venues in v1, all of them linear swaps settled
in a stablecoin or in dollars. Inverse contracts and dated futures are not
supported.

## Three venues

**Binance Futures.** USD-M perpetuals, settled in USDT, connected with your
existing Binance API key. It is the one futures venue that works in a browser,
because its futures API sends the CORS header the others omit. Paper mode runs
against Binance's own futures testnet, so fills come from a real matching
engine with no real money behind them.

**KuCoin Futures.** Perpetuals settled in USDT, connected with your existing
KuCoin API key with futures permission enabled. It needs the
[desktop app](/docs/desktop-app): its futures API sends no CORS headers at all.
KuCoin runs no futures sandbox, so there is no paper mode here. A paper
credential is refused with a clear message rather than being silently routed to
production.

**Kraken Futures.** Perpetuals settled in USD, connected with API keys that are
separate from your spot Kraken keys. It also needs the desktop app. Paper mode
runs against Kraken's demo futures environment.

|               | Binance Futures      | KuCoin Futures  | Kraken Futures    |
| ------------- | -------------------- | --------------- | ----------------- |
| Where it runs | Anywhere             | Desktop app     | Desktop app       |
| Connects with | Your Binance key     | Your KuCoin key | Its own key pair  |
| Settled in    | USDT                 | USDT            | USD               |
| Max leverage  | 125x                 | Per contract    | Per contract      |
| Paper mode    | Yes, futures testnet | No, live only   | Yes, demo futures |
| Margin mode   | Cross                | Cross           | Cross             |

All three stream candles, tickers, order books and trades, and all three report
your open positions back to the terminal.

## Connecting

Binance Futures and KuCoin Futures do not ask for anything new. The key you
already added for spot lights up the futures venue as well, because the futures
connector declares the spot venue as its credential source. One entry in
Accounts, two venues, two independent connections. Your Binance key does need
Futures permission enabled on Binance's side, and your KuCoin key does need
Futures permission on KuCoin's, or the venue answers with an authentication
error the first time you ask it for positions.

Kraken Futures is the exception and gets its own entry:
**Accounts → Connect Account → Kraken Futures**. Kraken issues futures keys
from a different part of the account than spot keys, on a different host, so a
spot key cannot sign here. Either way the secret goes into your OS keychain and
never to a Pairlens server. See
[connect an exchange](/docs/connect-an-exchange).

## Finding a contract

Perpetual keys carry three parts rather than two: `BTC-USDT-USDT` is BTC quoted
in USDT and settled in USDT, `BTC-USD-USD` is Kraken's dollar-settled version
of the same contract. The third part is what tells the terminal this is a
contract rather than a spot pair, everywhere from the chart route to the risk
guard, so a perpetual can never be confused with the spot pair that shares its
name.

The pair picker grows a **Futures** tab beside Crypto and Stocks. Contract
lists come from each venue's own market table rather than from a catalog, so a
venue you have not connected yet contributes nothing and the tab says so. On a
phone the venue filter row gains the same Futures chip.

## The ticket

Select a perpetual and the Trade Entry panel switches modes on its own, on the
desktop and on the phone alike. What you get:

**A leverage row.** Presets from 1x up to whatever the venue allows, with the
venue's own ceiling always as the last entry so the top of the range is visible
rather than implied. The choice is applied per order: the connector sets
leverage on the contract before the order goes in. It is never remembered
between sessions or carried across a market switch, for the same reason the
extended-hours toggle is not: 25x inherited from last night is a decision
nobody is making now.

**Contracts, not amounts.** Size is a contract count. There is no base and
quote toggle and no sell-percentage slider, because a sell here opens a short
rather than disposing of a holding. On a venue whose contract is a fraction of
the base asset, a line under the field shows what the count is worth in the
base asset. KuCoin's BTC contract is 0.001 BTC, so ten contracts is 0.01 BTC,
and reading that as ten BTC is a three-orders-of-magnitude mistake worth
spending a line to prevent.

**A reduce-only toggle.** With it on, the venue shrinks an open position and
refuses to open the opposite side. It is what makes closing safe: a size larger
than what is actually open cannot flip you short by accident.

**Notional and an estimated liquidation price.** Notional is contracts times
contract size times price, which is the number your risk guardrails measure.
The liquidation figure is explicitly an estimate and labelled as one: the real
level depends on your whole margin balance, the venue's maintenance tier for
the position's size, and funding paid since entry, none of which exist before
the position does. Treat it as an order-of-magnitude answer to "how close is
this to the price on the chart", not as a level to plan against.

Margin mode is cross on all three venues in v1. Isolated margin and a per
position margin control are not exposed yet.

## Positions

The **Futures Positions** panel rides the default perps layout's data strip,
in the tab row under the chart; on a custom workspace, add it from the Add
Pane dialog, under Trading. It
lists what you hold across every connected futures account: the contract, which
way it leans, the size, your entry price, the current mark, the liquidation
level, the leverage, and unrealized profit or loss with signed colouring.

Every one of those numbers comes from the venue's own positions payload, so the
panel holds no live subscriptions of its own. It refreshes on a timer and when
the window regains focus, which is the cadence positions actually move at. For
a moving price, the chart is one click away.

Each row has a **Close** action. It places a reduce-only market order on the
opposite side for the full contract count, behind a confirmation dialog, down
the same guarded path as any other order. Reduce-only is what makes a stale row
safe to act on: the venue clamps the order to what is really open.

Futures positions are their own panel rather than a tab in
[Positions](/docs/positions-and-portfolio), because a leveraged contract with a
liquidation price has different columns than a spot balance.

## Guardrails still apply

Every futures order goes down the same guarded path as a spot order or a swap,
and your [risk guardrails](/docs/risk-guardrails) are checked there. One thing
is worth being explicit about: position caps size on **notional**, not on
margin. A one-contract BTC position is the same exposure at 1x and at 25x, and
the cap measures exposure. Leverage changes how much margin the venue holds
against that position, not how big the position is.

The hold-to-confirm submit gesture, the paper badge and the vault seal behave
exactly as they do on a spot venue.

## What is not here yet

Funding-rate and mark-price overlays on the chart, isolated margin, a per
position margin adjustment, inverse (coin-margined) contracts, dated futures,
and deploying a bot onto a perpetual market. Bots still refuse leverage by
construction, so a strategy cannot be pointed at a futures venue in this
release.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Risk guardrails](/docs/risk-guardrails) for how notional caps are enforced
- [Panels](/docs/panels) for everything else you can put beside the chart
