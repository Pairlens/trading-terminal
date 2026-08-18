---
title: Perpetual futures
description: Trade perpetual swaps on Binance, ByBit, OKX, KuCoin and Kraken futures from the same terminal, with funding and basis scanners, a leverage selector, reduce-only orders, measured liquidation clusters from two collected venues, and margin health.
group: traders
parent: trading
order: 8
eyebrow: For traders
updated: 18 AUG 2026
readTime: 14 min read
---

A perpetual future is a contract that tracks a spot price without ever
expiring. You post margin, take a leveraged position long or short, and pay or
receive funding to keep the contract pinned near spot. In Pairlens it behaves
like any other instrument: it has a chart, an order book, a tape, and the same
guarded ticket. What changes is the unit and the risk. Size is counted in
contracts rather than in the base asset, a position can be liquidated, and a
short is a first-class position rather than the absence of a holding.

Pairlens ships five perpetual venues, all of them linear swaps settled in a
stablecoin or in dollars. Inverse contracts and dated futures are not
supported.

## Five venues

**Binance Futures.** USD-M perpetuals, settled in USDT, connected with your
existing Binance API key. Works in a browser: `fapi.binance.com` sends the
CORS header most futures APIs omit. Paper mode runs against Binance's own
futures testnet, so fills come from a real matching engine with no real money
behind them. Not available to US accounts, because Binance lists no US
derivatives at all.

**ByBit Futures.** USDT perpetuals, connected with your existing ByBit key.
Works in a browser. EU accounts route to `bybit.nl` exactly as they do on
spot, the US is not served, and paper mode runs against ByBit's one global
testnet.

**OKX Futures.** USDT perpetuals on the same regional entities as spot OKX,
connected with your existing OKX key. Works in a browser. The account entity
picked on the credential card governs futures orders too, because an OKX key
only exists on the entity where the account was registered, and paper mode is
OKX demo trading on that same entity's demo hosts. Whether a given account may
trade swaps is the entity's own call, so an account the entity restricts gets
OKX's own answer at order time rather than a guess from us.

**KuCoin Futures.** Perpetuals settled in USDT, connected with your existing
KuCoin API key with futures permission enabled. It needs the
[desktop app](/docs/desktop-app): its futures API sends no CORS headers at all.
KuCoin runs no futures sandbox, so there is no paper mode here. A paper
credential is refused with a clear message rather than being silently routed to
production.

**Kraken Futures.** Perpetuals settled in USD, connected with API keys that are
separate from your spot Kraken keys. It also needs the desktop app. Paper mode
runs against Kraken's demo futures environment.

|               | Binance              | ByBit          | OKX               | KuCoin          | Kraken            |
| ------------- | -------------------- | -------------- | ----------------- | --------------- | ----------------- |
| Where it runs | Anywhere             | Anywhere       | Anywhere          | Desktop app     | Desktop app       |
| Connects with | Your Binance key     | Your ByBit key | Your OKX key      | Your KuCoin key | Its own key pair  |
| Settled in    | USDT                 | USDT           | USDT              | USDT            | USD               |
| Max leverage  | 125x                 | 100x           | 100x              | Per contract    | Per contract      |
| Paper mode    | Yes, futures testnet | Yes, testnet   | Yes, demo trading | No, live only   | Yes, demo futures |
| Margin mode   | Cross                | Cross          | Cross             | Cross           | Cross             |

All five stream candles, tickers, order books and trades, all five report
your open positions back to the terminal, and all five serve funding rates and
open interest, which is what fills the scanners below. A venue you have not
connected contributes no rows: there is no third-party funding aggregator
behind any of this, so the board shows the venues you actually reach.

## Connecting

Four of the five venues do not ask for anything new. The key you already added
for spot Binance, ByBit, OKX or KuCoin lights up the futures venue as well,
because the futures connector declares the spot venue as its credential
source. One entry in Accounts, two venues, two independent connections. Your
Binance key does need Futures permission enabled on Binance's side, and your
KuCoin key does need Futures permission on KuCoin's, or the venue answers with
an authentication error the first time you ask it for positions.

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
lists come from each venue's own market table first, and the
[cloud snapshot](/docs/market-discovery#the-cloud-snapshot) fills in the
contracts of venues you have not loaded yet, marked as the weaker claim it is.
A venue's own table always wins for that venue. On a phone the venue filter
row gains the same Futures chip.

## The funding layer

A perp desk does not shop by price. The same contract exists on five venues at
the same price and costs five different amounts to hold, and that difference
is the trade. So the **CEX Futures** tab on Discovery opens on carry rather
than on a scanner, built from four panels that share one snapshot.

**Funding Matrix.** Every base asset against every connected perp venue, one
cell per contract. Rates are annualised before they are shown, because the
venues settle on different clocks (Kraken hourly, most of the others every
eight hours, with per-contract exceptions the venues themselves publish) and
their printed per-interval numbers are not comparable. Rows are one
base asset rather than one contract, so Binance's USDT-settled BTC and Kraken's
USD-settled BTC sit side by side with something to compare. Each cell carries
the venue's own pair key, so clicking it opens exactly the contract that quoted
the number. Sorting is by asset ranking until you click a venue column, because
sorting on rate puts whichever illiquid contract printed an outlier at the top
of the board on every refresh. In a browser two of the five venues are
missing, KuCoin and Kraken, because their REST APIs carry no CORS headers. The
matrix says so in one line rather than an alarm per venue, and stops
stretching its cells across the empty space. The Spread column only renders
when at least two venues answer, since a spread needs two quotes.

**Basis Monitor.** The perp against the spot it tracks, in basis points. The
pane does not annualise that gap: extrapolating a 4 bps discount to the next
stamp prints -196% a year, which is arithmetically true and reads as broken.
Measured carry is the funding matrix above it. Both legs come out of the same
funding payload the matrix uses: the mark is the price the venue funds against
and the index is its reference spot. One row per asset quoted by one venue,
because a basis is a property of a contract against its own index and averaging
across venues would produce a number no venue publishes.

**Open Interest.** How much money is in each contract and which way it moved
today. Deliberately not a cross-venue sum: Pairlens sees the venues you
connected, so a total would mean one exchange's worth on a fresh install and
five on a full one under the same label. A row names the venue that measured
it whenever the list mixes venues; with one venue answering the suffix would
repeat down the whole list. The list is short because the data is expensive,
Binance answers one symbol per request and the 24h change is a second request
on top, and where a venue publishes no history the change column is blank
rather than zero.

**Funding Extremes.** The dearest and cheapest carry, one entry per contract
per venue, each rate ranked against that contract's own 30-day settled range.
A perp that funds at 40% a year every week is not news; one that has just
tripled its usual rate is, and the subtitle says which end of its month it sits
in. Contracts with under $1M of open interest are skipped so the rail is not a
permanent dust list, and a contract whose open interest nobody publishes is
kept rather than guessed at. TAO on Binance and TAO on KuCoin are two different
trades and the gap between them is the trade, so they are never collapsed into
one row.

On the pair page, the **Carry** board puts a **Funding Belt** above the chart:
the countdown to the next stamp, the current and predicted rate, what the last
8h, 24h and 7d paid or earned, and what holding costs. With a position open it
prices that position. With none it prices a stated 1,000 of the settle
currency, labelled as such, because a cost figure with no size behind it reads
as a real charge against an account holding nothing.

**The board fills in per venue.** Each exchange is asked on its own, so a
column paints the moment that venue answers rather than waiting on the slowest
one in the row. Until an answer arrives the pane still draws itself: the venue
columns are named from the connectors you have installed, the rows carry the
ranked assets with their logos, and only the rates are placeholders. Nothing
jumps when the numbers land, because the layout was already right. A venue
your build cannot reach is left out of the count from the first paint instead
of appearing as a column and then vanishing.

None of these panes open a stream. Funding moves once per settlement, so they
read a shared cached snapshot and only the countdown ticks.

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

**Funding at entry.** One row under the size field: the current rate, which
side pays it, and the countdown to the next stamp. Entering a long into a
+0.09% stamp that settles in four minutes is a different trade from entering
the same long an hour after it settled, and nothing on a chart shows that. It
is public data on the same cached snapshot the scanners read, so it costs
nothing, and it renders nothing at all when the venue publishes no rate for the
contract, because an empty row where a cost should be reads as free.

**Notional and an estimated liquidation price.** Notional is contracts times
contract size times price, which is the number your risk guardrails measure.
The liquidation figure is explicitly an estimate and labelled as one: the real
level depends on your whole margin balance, the venue's maintenance tier for
the position's size, and funding paid since entry, none of which exist before
the position does. Treat it as an order-of-magnitude answer to "how close is
this to the price on the chart", not as a level to plan against.

Margin mode is cross on all five venues. Isolated margin and a per
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

## Reading the risk

The **Risk** board pairs the chart with three panels that answer "how much room
is left", and each of them is careful about what it does not know.

**Liquidation Map.** A heatmap over time and price. The pane hosts its own
candles of the contract and paints the venue's liquidation history behind them: a
column per candle, a row per price bucket, coloured by the side that was
liquidated and darkened by the notional that went with it. The caption says what
each layer is claiming, in the pane rather than in a tooltip.

**Every cell is a print, and the prints are what the venue actually liquidated.** Binance Futures and
Bybit both publish public liquidation streams, the App Server holds them open and
buckets the prints by minute and by price, and the pane draws the result. These
are prints, not a model. That distinction is the whole point: the vendors who sell
a liquidation heatmap are inferring one from open interest and assumed leverage,
and cells that look like measured depth but are not are the most confident kind
of wrong.

**The two streams are not the same kind of feed, and every response says which
one it is.** Binance's own documentation is explicit that it pushes at most one
liquidation per symbol per second, so its figures undercount exactly when it
matters most, during a cascade, when hundreds arrive in seconds and we keep one.
Bybit pushes every liquidation, including the sub-hundred-dollar ones Binance's
sampling drops. So the response carries a completeness flag, `sampled` for
Binance and `complete` for Bybit, and the two must never be added into one
cross-venue total without it. Notional is the axis that survives the comparison;
the print count does not, and runs an order of magnitude higher on Bybit for the
same market activity.

One more difference worth a footnote if you ever compare the price axes: Binance
publishes both an order price and an average fill, and we take the fill, which is
what the position actually closed at. Bybit publishes the bankruptcy price, so
its buckets sit a little further past the liquidation level. The gap is small,
systematic and always in the same direction.

Whether Pairlens can route an order to a venue and whether the server holds
its public prints are separate questions, and Bybit now answers yes to both:
its collected stream predates its connector, so a ByBit perp you chart gets
measured cells from day one.

Retention is 72 hours. Chips pick 1h, 6h, 24h or 72h and the candle interval
follows, 1m through 1h, so any window lands near a hundred columns instead of
4,320 sub-pixel slivers, and the wire's minute buckets fold onto whichever column
contains them. Intensity scales by square root against the heaviest single cell:
liquidated notional is heavy-tailed, and a linear ramp against one cascade minute
renders every other cell invisible.

Where more than one collector answers for the contract, a **source control**
switches between them. It switches, it never blends, and a line beside the totals
names the venue and whether its feed is a census or a sample. A source that comes
from a vendor key you have not added says so and links to the plugin, rather than
drawing a blank map. A window a mature collector genuinely has nothing for renders
the candles with a note: an illiquid contract liquidates nobody for hours, and
that is data.

**OKX, KuCoin and Kraken futures stay estimate-only** out of the box. KuCoin
and Kraken publish no public liquidation print stream we can hold open, and
OKX's channel is not collected yet, so the pane reports those venues as
uncovered, offering the collected venues as an explicit alternate source
rather than substituting one silently. A terminal running
[standalone](/docs/self-hosting#standalone-mode) has no collector at all and says
that instead. A Coinglass key covers those venues; see below.

### Bringing your own Coinglass key

The bundled **Coinglass Liquidations** plugin draws the same measured clusters
for venues Pairlens does not collect, paid for with your own Coinglass API key.
Add the key in the Plugin Store and the map fills in for Binance, ByBit, OKX,
KuCoin and Kraken perpetuals, with seven days of history instead of three.

It reads exactly one endpoint, `/api/futures/liquidation/order`, which is the
venue's real prints: a price, a side and a size on each one. Coinglass also
publishes liquidation heatmaps, and those are a different thing. They are
projected leverage levels, with no counts, no realised notional and no side
label at all, and mapping them into a pane captioned "what the venue actually
liquidated" would be the exact confident wrong the measured layer exists to
avoid. The plugin does not map them.

Three things to know before you buy a key.

**Desktop only.** `open-api-v4.coinglass.com` answers a CORS preflight with 403
and sends no `access-control-allow-origin` header at all, so a browser tab
cannot reach it under any arrangement. The plugin refuses in a browser with the
same typed message the desktop-only venues use, rather than spinning.

**The Standard plan is the real floor.** Liquidation orders are not included
below it, so a Hobbyist or Startup key will not power the pane. The plugin can
tell that apart from a wrong key, because it first calls an endpoint every plan
can reach, and it says which one happened.

**You see the tail above a cutoff.** Coinglass requires a minimum liquidation
size on every request and caps a response at 200 rows. The plugin defaults the
cutoff to $1,000, exposes it as a setting, and splits a window that comes back
at the cap into narrower ones. What survives that is still a lower bound,
especially the print counts, and the response says whether it is a full feed or
a sample so the pane can repeat it.

Where both can answer, the App Server's collector wins. It is measured straight
from the venue's own stream, it costs you nothing, and the paid source is there
for the venues the collector does not hold.

Over the cells sit **your own liquidation prices**, straight from each venue's
position payload, as dashed lines thickened by the notional at risk and labelled
with the venue and the distance from the last price. The 5x, 10x and 25x reference
marks the old price-axis strip carried are gone: they were an estimator standing
in for an axis that had nothing else on it, and the ticket already shows an
estimated liquidation price while you size a position, which is where the question
is actually asked.

**Margin Health.** One section per connected futures account, because a margin
ratio is an account fact: cross margin pools every position against one balance
and a merged gauge across two exchanges would be a number neither of them would
liquidate on. The ratio is computed from maintenance over equity rather than
read off the venue's own field, which two of the three venues scale differently
with nothing in the payload to say which; where the venue's figure is the only
one available it is normalised and the header names the source.

**Risk Controls.** Your daily loss cap, daily trade count, maximum position
size and the kill switch, editable beside the chart instead of behind Settings.
It is not a second risk system: every control writes the same store the risk
strip summarises and the guarded order path reads before every placement, so a
limit set here is live on the next order with no save button. What is not there
is an auto-deleverage guard, a funding stop or a flatten-all button. The first
two would be standing automation that has to keep running with the app closed,
and the third is an order path rather than a setting.

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

Funding and mark price are panels rather than chart overlays, so neither is
plotted on the candles yet, and the liquidation heatmap hosts its own chart rather
than painting onto the main one. Hovering a cell shows no per-cell readout: the
totals row states the window, and the tooltip that would name one cell has not
been built. Also missing: collected liquidation prints from OKX, KuCoin and
Kraken (OKX publishes a stream nobody holds open yet; the other two publish
none, so all three need a vendor key), an ADL
indicator (no venue returns an ADL rank, and a five-bar gauge inferred from
margin health would look exactly like the venue's own and mean nothing), funding
history as a series rather than a snapshot, isolated margin, a per position
margin adjustment, inverse (coin-margined) contracts, dated futures, and
deploying a bot onto a perpetual market. Bots still refuse leverage by
construction, so a strategy cannot be pointed at a futures venue in this
release.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Risk guardrails](/docs/risk-guardrails) for how notional caps are enforced
- [Panels](/docs/panels) for everything else you can put beside the chart
