---
title: Perpetual futures
description: Leverage, funding and liquidation explained with real numbers, then how to trade perps in Pairlens across five venues, with the funding scanners, the ticket, and the liquidation map.
group: traders
parent: trading
order: 8
eyebrow: For traders
updated: 22 AUG 2026
readTime: 13 min read
---

## Read this part first

Perpetual futures are where most new crypto traders lose money, and they lose it
quickly. Everything below is here so that if you trade them, you do it knowing
exactly what you signed up for.

### What a perpetual is

A **perpetual future** is a contract whose price tracks an asset without you ever
owning the asset. Buy a Bitcoin perpetual and you do not have any Bitcoin. You
have an agreement whose value moves with Bitcoin's price, settled in dollars or
a stablecoin.

Two things make it different from just buying the coin:

**You can go short.** Sell a perpetual you do not own and you profit if the
price falls. On spot, "selling" just means disposing of something you held; here
a short is a real position that can gain or lose.

**You can use leverage.** Put up $100 of margin at 10x and you control $1,000 of
exposure.

### What leverage really does

Leverage does not multiply your returns. It multiplies your _exposure_, and the
returns and losses follow.

$1,000 of Bitcoin exposure, funded with $100 of margin at 10x:

| Bitcoin moves | Your position is worth | Your $100 margin is now |
| ------------- | ---------------------- | ----------------------- |
| +10%          | $1,100                 | $200                    |
| +1%           | $1,010                 | $110                    |
| -1%           | $990                   | $90                     |
| -10%          | $900                   | $0. Gone.               |

That last row is the one that matters. **At 10x leverage, a 10% move against you
wipes out your entire margin.** At 25x it takes 4%. At 100x it takes 1%, which
Bitcoin does several times a week.

### Liquidation

You do not get to sit through that 10% move and hope. Before your margin reaches
zero, the exchange force-closes your position to protect itself. That is a
**liquidation**, and it is final: the position is gone and the margin with it.
You do not get a second chance if price comes back an hour later.

Your **liquidation price** is the price at which that happens. Know it before you
open the position, not after.

### Funding

A perpetual never expires, so something has to keep its price tethered to the
real asset. That mechanism is **funding**: every few hours, one side pays the
other.

When more traders are long than short, the perpetual trades above spot, and
longs pay shorts. When the crowd is short, shorts pay longs. The rate is usually
tiny per payment and enormous when annualised: 0.01% every eight hours is about
11% a year, and crowded markets go many times higher.

Two consequences. **Holding a position costs or earns money independently of
whether you are right about the price.** And funding is a live readout of crowd
positioning, which is why the scanners below exist.

### The honest summary

Perpetuals are a professional instrument. They are useful for hedging, for
shorting, and for expressing a view with less capital tied up. They are also the
fastest way to lose an account that has ever been invented, and the leverage
sliders on every exchange go far past anything sensible.

If you trade them: use low leverage (2x to 5x is plenty), know your liquidation
price before entering, and set your
[risk guardrails](/docs/risk-guardrails) first. Practise on a testnet, which
four of the five venues below provide free.

## In Pairlens

A perpetual behaves like any other market: chart, order book, tape, and the same
guarded order ticket. What changes is that size is counted in **contracts**, a
position can be liquidated, and a short is a real position.

All five venues here trade linear perpetuals settled in a stablecoin or dollars.
Inverse and dated futures are not supported.

## Five venues

|               | Binance              | ByBit          | OKX               | KuCoin          | Kraken            |
| ------------- | -------------------- | -------------- | ----------------- | --------------- | ----------------- |
| Where it runs | Anywhere             | Anywhere       | Anywhere          | Desktop app     | Desktop app       |
| Connects with | Your Binance key     | Your ByBit key | Your OKX key      | Your KuCoin key | Its own key pair  |
| Settled in    | USDT                 | USDT           | USDT              | USDT            | USD               |
| Max leverage  | 125x                 | 100x           | 100x              | Per contract    | Per contract      |
| Practice mode | Yes, futures testnet | Yes, testnet   | Yes, demo trading | No, live only   | Yes, demo futures |

Regional notes: Binance and ByBit do not serve US accounts, ByBit routes EU
accounts to its Dutch entity, and OKX uses whichever regional entity your account
was registered on. KuCoin and Kraken futures need the
[desktop app](/docs/desktop-app), because their APIs refuse connections from web
pages.

KuCoin runs no futures practice environment, so a paper credential there is
refused with a clear message rather than quietly sent to production.

## Connecting

Four of the five need nothing new. The key you already added for spot Binance,
ByBit, OKX or KuCoin lights up the futures venue too: one entry in Accounts, two
venues. Your Binance and KuCoin keys do need Futures permission enabled on the
exchange's side, or the venue rejects the first request for positions.

Kraken Futures is the exception, because Kraken issues futures keys separately
from spot ones. Connect it under **Accounts → Connect Account → Kraken Futures**.

Either way the secret goes into your keychain and never to a Pairlens server.
See [connect an exchange](/docs/connect-an-exchange).

## Finding a contract

Perpetual keys have three parts rather than two. `BTC-USDT-USDT` is Bitcoin,
quoted in USDT, settled in USDT. `BTC-USD-USD` is Kraken's dollar-settled
version.

That third part is what tells the terminal this is a contract and not the spot
pair sharing its name, everywhere from the chart address to the risk check. A
perpetual can never be mistaken for spot.

The pair picker grows a **Futures** tab. Contract lists come from each exchange's
own table, so the tab fills in as you connect venues.

## The funding scanners

A perpetual desk does not shop by price. The same contract exists on five
exchanges at effectively the same price and costs five different amounts to
hold. That difference is the trade.

So the **CEX Futures** Discovery tab opens on carry rather than on a price
scanner, with four panels:

**Funding Matrix.** Every asset against every connected exchange, one cell per
contract. Rates are shown annualised, because exchanges settle on different
clocks (Kraken hourly, most others every eight hours) and their raw per-interval
numbers are not comparable. Click a cell to open exactly the contract that quoted
it.

Sorting stays on asset ranking until you click an exchange column, deliberately:
sorting by rate just puts whichever illiquid contract printed an outlier at the
top on every refresh.

**Basis Monitor.** The gap between the perpetual and the spot price it tracks, in
basis points. This panel does not annualise, because extrapolating a momentary
4 basis point discount produces a number like -196% a year, which is
arithmetically true and completely useless. Measured carry is the matrix above.

**Open Interest.** How much money is in each contract and which way it moved
today. Rising open interest with rising price means new money is coming in;
rising price on falling open interest means people are closing shorts, which is
a weaker move.

It is deliberately not summed across exchanges. Pairlens only sees the venues you
connected, so a "total" would mean one exchange's worth on a fresh install and
five on a full one, under the same label.

**Funding Extremes.** The dearest and cheapest carry, with each rate ranked
against that contract's own 30-day range. A perpetual that funds at 40% a year
every week is not news; one that has just tripled its usual rate is. Contracts
under $1M of open interest are skipped so the list is not permanent dust.

None of these panels open a live stream. Funding moves once per settlement, so
they read a cached snapshot and only the countdown ticks.

On a pair page, the **Carry** board adds a **Funding Belt** above the chart: the
countdown to the next payment, the current and predicted rate, what the last 8
hours, 24 hours and 7 days paid or cost, and what holding is costing you. With a
position open it prices your actual position.

## The ticket

Select a perpetual and the order ticket changes.

**A leverage row.** Presets from 1x up to the exchange's own ceiling. It applies
per order, and it is never remembered between sessions or carried across a market
switch. 25x inherited from last night is a decision nobody is making now.

**Contracts, not amounts.** Size is a contract count. There is no sell-percentage
slider, because selling here opens a short rather than disposing of a holding.

Where an exchange's contract is a fraction of the asset, a line under the field
tells you what your count is worth. KuCoin's Bitcoin contract is 0.001 BTC, so
ten contracts is 0.01 BTC. Reading that as ten Bitcoin is a
three-orders-of-magnitude mistake worth one line of text to prevent.

**A reduce-only toggle.** With it on, the exchange shrinks your open position and
refuses to open the opposite side. This is what makes closing safe: a size larger
than what is actually open cannot accidentally flip you short.

**Funding at entry.** One row: the current rate, which side pays, and the
countdown. Entering a long four minutes before a +0.09% payment settles is a
different trade from entering the same long an hour after, and nothing on a chart
shows you that.

**Exposure and an estimated liquidation price.** Your exposure is what your
[risk guardrails](/docs/risk-guardrails) measure. The liquidation figure is
explicitly an estimate, because the real level depends on your whole margin
balance, the exchange's maintenance rules at your size, and funding paid since
entry, none of which exist before the position does. Treat it as "roughly how
close is this to the chart", not as a level to plan against.

All five venues use cross margin. Isolated margin is not exposed yet.

## Positions

The **Futures Positions** panel lists what you hold across every connected
futures account: the contract, which way it leans, size, entry price, current
mark, liquidation level, leverage, and unrealised profit or loss.

Every number comes from the exchange's own record. The panel refreshes on a timer
and when the window regains focus, which is the pace positions actually move at.

Each row has a **Close** button. It places a reduce-only market order for the
full size, behind a confirmation, down the same guarded path as any other order.
Reduce-only is what makes a stale row safe to act on.

## Reading the risk

The **Risk** board pairs the chart with three panels.

### Liquidation Map

A heatmap over time and price showing where positions were actually
force-closed. Big clusters of liquidations mark prices where a lot of leverage
was sitting, and those prices often act like magnets: cascades feed on
themselves.

**These are real prints, not a model.** Binance and Bybit publish public
liquidation streams; Pairlens holds those open and buckets what comes out. That
distinction matters, because most liquidation heatmaps sold elsewhere are
_inferred_ from open interest and assumed leverage. A chart that looks like
measured data but is not is the most confident kind of wrong.

Two honest caveats, and the panel states both:

**Binance undercounts during cascades.** Its own documentation says it publishes
at most one liquidation per symbol per second, so exactly when hundreds arrive at
once, it reports one. Bybit publishes everything. The two are labelled
differently and should never be added into one number. Compare by dollar value,
which survives the difference; do not compare counts, which do not.

**Coverage is not universal.** OKX, KuCoin and Kraken are not collected, so the
panel reports them as uncovered and offers the collected venues as an explicit
alternative rather than silently substituting one. History runs 72 hours, with
chips for 1h, 6h, 24h and 72h.

Over the cells sit **your own liquidation prices**, taken straight from each
exchange's position record, drawn as dashed lines thickened by how much is at
risk and labelled with the distance from the current price.

If you want the uncovered exchanges, the bundled **Coinglass Liquidations**
plugin fills them in with your own Coinglass API key, with seven days of history.
Three things to know: it needs the desktop app, it needs Coinglass's Standard
plan or above, and it shows liquidations above a size cutoff you set, so its
counts are a lower bound. Where both can answer, the free collected feed wins.

### Margin Health

One section per connected futures account, because a margin ratio is an account
fact rather than a position fact. Cross margin pools every position against one
balance, so a merged gauge across two exchanges would be a number neither of them
would ever liquidate you on.

### Risk Controls

Your daily loss cap, trade count, maximum position size and kill switch, editable
beside the chart instead of behind Settings. It is not a second risk system:
these write the same settings the order path reads, so a limit set here is live
on the next order with no save button.

## Guardrails still apply

Every futures order goes down the same guarded path as a spot order. One thing
worth being explicit about: **position caps measure exposure, not margin.** A
one-contract Bitcoin position is the same exposure at 1x and at 25x. Leverage
changes how much margin the exchange holds against it, not how big it is.

The hold-to-confirm gesture, the paper badge and the vault behave exactly as they
do on spot.

## What is not here yet

Funding and mark price are panels rather than chart overlays. The liquidation map
hosts its own chart rather than painting onto the main one, and hovering a cell
gives no per-cell readout. Also missing: collected liquidations from OKX, KuCoin
and Kraken without a vendor key, funding history as a series, isolated margin,
per-position margin adjustment, inverse (coin-margined) contracts, dated futures,
and running a bot on a perpetual. Bots refuse leverage by construction, so a
strategy cannot be pointed at a futures venue in this release.

## Next

- [Risk guardrails](/docs/risk-guardrails), which you should set before your
  first perpetual order
- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Paper trading](/docs/paper-trading) to practise on a testnet first
