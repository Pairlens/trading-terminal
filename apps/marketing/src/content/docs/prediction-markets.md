---
title: Prediction markets
description: Contracts that pay $1 if something happens, so their price reads as a probability. What that means, how to read the payout, and how to trade Kalshi and Polymarket events from Pairlens.
group: traders
parent: trading
order: 6
eyebrow: For traders
updated: 22 AUG 2026
readTime: 18 min read
---

## What a prediction market is

A prediction market turns a question into a tradeable contract.

"Will the Fed cut rates in September?" becomes a contract that pays **exactly
$1** if the answer turns out to be yes, and **exactly $0** if it turns out to be
no. That contract then trades freely between now and the answer.

Everything interesting follows from that payout.

### The price is the probability

If a contract pays $1 when true, what should it cost?

Suppose you think there is a 70% chance of a cut. Paying 60¢ for a contract
worth $1 seven times out of ten is a good deal. Paying 80¢ is a bad one. The
price where you are indifferent is 70¢.

Everybody trading does this arithmetic, so the market price settles at the
crowd's collective probability. **A contract trading at 53¢ means the market
thinks there is roughly a 53% chance.** That is why prices here are quoted in
cents and read as percentages.

This is the genuinely useful thing about prediction markets: they produce a
live, money-backed forecast. Pundits are free. These people are wagering.

### The payout, with numbers

Buy 100 contracts at 53¢. You spend $53.

- **If it resolves yes**, you receive $100. Profit: $47.
- **If it resolves no**, you receive nothing. Loss: $53.

Your maximum loss is what you paid, always. Your maximum gain is the rest of the
dollar. So a cheap contract is a long shot with a big multiple, and an expensive
one is a likely outcome with a thin one, exactly as odds work everywhere else.

Note what this means for risk: buying at 90¢ risks 90¢ to make 10¢. Being right
nine times out of ten just breaks you even.

### Yes and No are two sides of one dollar

Every question has both. Yes at 53¢ and No at 47¢ add to a dollar, because
exactly one of them will pay.

Selling Yes and buying No are therefore close cousins, but not identical orders:
they have different books and different prices, and one is usually cheaper.
Check both.

### The overround

Add up every possible answer's price and you should get exactly 100%. In
practice you get a bit more, because that gap is the market's margin, the same
way a bookmaker's odds add to more than 100%.

On a race with many runners this matters. If every answer's Yes price sums to
108%, you are paying 8% over fair value spread across the field. Pairlens shows
you that sum on any multi-outcome event, which is a number most prediction sites
never put on screen.

### The risk nobody thinks about

**Resolution risk.** The contract pays on the rules, not on what you thought it
meant. "BTC above $120,000 on August 15" is four different bets depending on
whose price, at what cutoff, decides it. Read the resolution criteria before you
stake anything. Pairlens puts them on the page for exactly this reason.

Two other things to keep in mind. **Your money is tied up until the event
resolves**, which can be months, unless you sell the contract to somebody else
first. And **liquidity is often thin** away from the headline questions, so the
spread can be several cents wide, which is a large cost on an instrument priced
in cents.

## The pair is the question

This is the one Pairlens-specific idea worth reading before anything else.

Everywhere else in the terminal, a pair is a thing you buy: BTC-USDT, AAPL, a
perpetual. A prediction is not shaped like that. "Who wins the 2028 Democratic
nomination?" is one market with thirty answers, and no single answer is the
instrument any more than the bid is the instrument on a spot pair.

So in Pairlens **a prediction pair is the event**. Open one and the whole field
is on screen, priced, with the favourite already loaded in the ticket. Picking
Yes, picking No, or moving between runners is a selection, not a navigation: the
book, the tape and the ticket follow without anything reloading.

What that changes:

- **You never have to pick a side just to look at a market.**
- **Your watchlist holds questions**, not legs. A starred prediction is "Will the
  Fed cut in March?", and the row prices it with whichever answer is currently
  leading, naming which one.
- **A link can still be specific.** Adding `?o=` to the address names one answer,
  so you can share "this runner" with the rest of the field around it.
- **Orders are unchanged.** The venue still trades one answer at a time.

## Two venues

**Kalshi.** A US exchange regulated by the CFTC, connected with an API key. It
needs the [desktop app](/docs/desktop-app), because its API refuses requests from
web pages. Collateral is US dollars, and it issues demo credentials so you can
practise the whole flow.

**Polymarket.** Settled in USDC on the Polygon blockchain, connected with an
Ethereum wallet rather than an API key. It works in a browser and on a phone.
Polymarket does not serve US persons for trading: market data stays open
everywhere, and an order from a US country setting is refused before it is
signed.

|               | Kalshi          | Polymarket       |
| ------------- | --------------- | ---------------- |
| Where it runs | Desktop app     | Anywhere         |
| Connects with | API key and PEM | Ethereum wallet  |
| Collateral    | USD             | USDC on Polygon  |
| Order types   | Limit only      | Market and limit |
| Practice mode | Yes, demo keys  | No, live only    |
| Timeframes    | 1m, 1h, 1d      | 1m, 5m, 1h, 1d   |

### Connecting Kalshi

**Accounts → Connect Account → Kalshi**, in the desktop app. Kalshi signs
differently from most exchanges, so it asks for two things: your **API Key ID**,
and the **RSA private key file** it downloads once when you create the key. Paste
that file whole, `BEGIN` line included.

Pick **Paper** and the credential signs against Kalshi's demo environment, which
is a genuinely separate venue rather than a simulation.

### Connecting Polymarket

**Accounts → Connect Account → Crypto Wallet**, with an Ethereum key, the same
entry the [on-chain chains](/docs/dex-trading) use. That one key does both jobs.

There is no practice mode: the contracts are real, on a real blockchain. Fund a
hot wallet with what you intend to trade and leave the rest elsewhere.

## Finding an event

Start from the **Predictions** Discovery tab: a categories rail on the left, the
event board across the middle, and Odds Movers over Resolving Soon on the right.

**The Event Board** draws every live question as a card that prices both sides.
Click the heading to open the question with its whole field; click a price to
open it with that answer already in the ticket.

A binary question has one number worth reading, so its probability gets the
biggest type on the card. A race has a hundred and none is the headline, so its
card widens, ranks the field, and says how much of the probability the leaders
hold between them.

Probabilities are shown as percentages and tradeable prices in cents, on
purpose: the percentage is the reading, the cents are the price.

**Odds Movers** ranks by how much a probability moved in the last day, stated in
**points** rather than percent. A contract going from 64 to 78 moved fourteen
points. Calling that "+21.9%" is arithmetically true and useless, because
probabilities are compared by subtraction.

**Resolving Soon** sorts by the clock alone, which is the one thing a
volume-ranked board cannot tell you. 60% a month out and 60% an hour out are
completely different bets, and the second one is nearly decided.

**Sixteen categories** cover both venues: Elections, Politics, Geopolitics,
Economics, Financials, Commodities, Companies, Crypto, Sports, Esports, Mentions,
Tech & Science, Climate, Health, Culture and Transport. The two venues do not
agree on what a category is, so Pairlens maps both into one set and sends each
venue its own word for it. An event nobody can categorise stays uncategorised
rather than getting a wrong chip.

Sorting offers Trending (the venue's own ranking), New, Ending soon, Volume and
Biggest move. **New** ranks on the newest market inside an event rather than the
event's own birthday, because a nomination race gains a runner whenever somebody
declares, and that is the news.

Rows a sort cannot rank go to the end, never the top. An event with no volume
figure is not the quietest event on the board, it is an event nobody measured.

## Crypto up/down

Both venues run a permanent conveyor of short-dated crypto contracts asking one
question: will the price be higher at the close than it was at the open? Kalshi
opens a fifteen-minute window on BTC, ETH, SOL, XRP and DOGE every quarter hour.
Polymarket runs hourly and daily ones.

They are the busiest contracts either venue lists, and they are the one
prediction product a crypto terminal can price better than the venue's own site,
because Pairlens is already streaming the spot market they settle against.

**Crypto Up/Down** has two shapes.

**Focus** answers the question you actually open these with: is BTC going to be
above 71,860 in four minutes? It shows the settlement reference and the live
price side by side with the gap between them, a countdown with a bar showing how
much of the window has run, and a chart of the spot tape approaching the
settlement price, tinted green above the target and red below.

Both sides sit beside it as buttons priced in cents with the payout multiple
under each ("59¢, pays 1.69x"). Below that, the spot trades that will decide the
window, arriving one at a time, with a bar showing which side is pushing harder.

**Board** is the scanner: one row per live contract, soonest first, with the
reference price, the live spot price, the distance between them, the market's
odds, a model estimate, and the gap between the two.

### What the model is, and is not

The Model column is a standard options-pricing calculation: the probability that
spot finishes above the reference under a simple random walk at recent realised
volatility. It is there so the venue's probability has something to be compared
against.

**It is not a recommendation and not a fair value.** It assumes no drift,
constant volatility, and a smooth random walk, and a fifteen-minute crypto window
is none of those. It knows nothing about fees, the spread, or how thin the book
is at the size you would actually trade. A four-point edge on a contract quoted
two cents wide is not four points of anything.

The column goes blank rather than approximate when a piece is missing, and the
edge is withheld entirely when the venue's odds have not refreshed recently.
Subtracting a live model from a stale probability produces a number that looks
like a huge mispricing and is really a comparison against a memory.

### Where the reference comes from

Kalshi publishes its settlement price outright, so the Reference column is
exactly what the contract pays on.

Polymarket names a candle instead ("the Binance hourly candle beginning at this
hour"), so Pairlens reads that candle's open from your own Binance connector.
Those rows mark the reference with `≈` and explain why on hover.

If no connector you have carries the settlement pair, the row still runs. You
lose the spot comparison and the model, and you keep the odds and the countdown.

## The Probability Chart

Prediction markets get their own chart, because a candle chart cannot do the
thing an event market most needs: it draws one instrument, and a race is a
question with a field.

The Probability Chart draws **every outcome on one time axis**, in the same
colours the outcome ladder and the basket use for the same runners.

**The legend is the chart.** Every runner gets a chip with its probability and
its move, and clicking one hides or shows its line. The chip for the outcome you
are trading is outlined and its line drawn heavier, and a caret beside any other
chip moves the whole page to that outcome. That is how you go from spotting a
crossover to trading it.

**The crosshair reads the whole field.** Hover anywhere and every runner is
listed at that instant, sorted by probability. The order re-sorts as you move, so
a crossover is something you watch happen rather than infer from two lines that
got close.

**The axis is fixed at 0 to 100%**, never scaled to fit. A race whose leader
sits at 12% would otherwise fill the pane and read as a certainty. The empty top
of the chart is part of the reading: nobody here is close to winning.

**Lines or bands.** When the favourite is at 22%, eight lines share the bottom
fifth of the chart and second against third is a two-pixel gap. So a race can be
drawn as stacked bands instead: each runner's thickness is its probability,
favourite at the top, so second against third becomes two heights rather than two
lines.

Two rules keep the bands honest. **They stack the raw probabilities and never
normalise to 100%**, because dividing by the drawn total would report a 22%
favourite as a 30% favourite. The leftover goes to a grey **Rest of field** band,
which is exactly the probability the chart is not drawing. And bands only appear
where the field is genuinely a set of mutually exclusive answers. A ladder of
"above $60k", "above $70k" strikes is nested rather than exclusive, so stacking
it would draw a quantity that does not exist, and the switch does not appear.

**Five spans**: 1H, 6H, 1D, 1W, 1M. Your choice follows you across contracts and
devices.

Between trades the line carries the last price forward rather than breaking: the
price was 34¢ until it was 41¢. A runner that listed halfway through the window
starts where its data starts, because a flat line reaching to the left edge would
claim the market priced a candidate who did not exist yet.

**If you want candles anyway**, add an ordinary Chart panel. A prediction renders
as a step line on the cents axis with the full drawing toolbar available, and
your choice is remembered for prediction charts alone, so it does not turn your
crypto charts into lines.

## The event page

Opening a question leads with the question rather than with the chart.

**Event Header.** The question as a sentence, with the two facts that change what
the price means: when it resolves, and what the venue says decides it. Under it,
the field as a strip of chips, one per answer, each priced. The one you are
trading is outlined; clicking any other points the chart, book, tape and ticket
at it without leaving the page.

On a binary the right side shows one probability large. On a race it shows the
sum of every Yes price instead, which is the overround: over 100% is the
market's margin, under 100% is a field the book has not finished quoting.

**Event Brief.** The venue's own resolution criteria, verbatim, open on the page
rather than behind a hover, with the settlement date, countdown, volume and
liquidity above it.

This panel exists because it was previously possible to read a probability, size
a stake and submit an order without ever seeing the sentence that decides whether
you win. On a race the criteria are per runner, so a picker at the top chooses
which one you are reading.

**What Moved It.** The question's history as a timeline: each row a date, a
signed move in cents, and the headlines that landed while it moved. It states
this as correlation rather than cause, which is the correct claim.

**Outcome Ladder.** Every answer priced in cents, sortable and searchable, with
Yes and No chips that point the page at that contract. This is where the
ninetieth runner in a big race lives, one filter box away instead of four pages
deep. Prices update on a timer rather than tick by tick, so rows hold still while
you read them.

**Basket Ticket.** Beside the ladder, a way to stake several outcomes in one go.
It prints three numbers in the order you need them:

- **Coverage**, the summed probability of your staked legs, so a basket can say
  it covers 59% of the field.
- **Max payout**, which is the largest single leg's payout and never the sum,
  because the answers are mutually exclusive and at most one can pay.
- **Max loss**, which is the whole stake, since every leg is a buy.

Basket orders go out one leg at a time through the same guarded path as a single
order, and stop at the first refusal, removing every leg that did fill so
retrying cannot place the same order twice. Legs are always limit priced,
because on a thin race a five-leg sweep is exactly the order that walks a book.

## The ticket

Select a prediction and the order ticket switches modes.

**The question, not the ticker**, at the top, with the resolution date beside it.
A 68¢ price a month out and the same price an hour out are different bets.

**An outcome switch** listing every other answer with its price, right above Buy
and Sell. Two answers or a hundred, it is the same control.

**Dollars, not contracts.** You size in money, with $25, $50, $100 and Max
presets, and the ticket converts that into whole contracts. You decide how much
to risk, not how many contracts that buys.

**Prices in cents.** Type 53 for 53¢.

**A payout card** above the submit button: **If Yes wins, $147**, with a bar
splitting what the order costs from what it returns, and the stake, profit and
return underneath. Working that out in your head under a live quote is the one
arithmetic step nobody should be doing.

**Max payout, max loss, average fill** underneath. Max loss is what is committed:
the stake for a buy, and for a sell the rest of the dollar the contract might
have to pay out. Selling is quoted on that whole dollar rather than on the
premium you keep, so a 212% risk is never printed as 68%.

Kalshi has no market orders at all, so the ticket offers Limit only there rather
than letting you find out from a rejection. Neither venue offers bracket orders,
because neither has trigger orders.

## Positions and settlement

**Prediction Positions** lists what you hold across both venues: the market, the
outcome, how many contracts, your average price in cents, what it cost, and how
long until it resolves. Once a market settles, the row reads **Resolved** and
shows the payout.

It is a separate panel from ordinary positions, because a contract that expires
against a real-world event needs different columns than a position with a mark
price.

## Ask the assistant about the field

The [assistant](/docs/ai-copilot) reads prediction markets the same way it reads
a chart. It already knows the question you have open and the price of each
answer, so "which of these is the market actually favouring?" is a complete
question with nothing pasted in.

It can pull a whole event, with every outcome's probability, the resolution
criteria in the venue's own words, and the sum of every Yes price. That last one
is worth asking for out loud, because it tells you whether the field is priced
above or below fair.

It can find an event across both venues by text or category, so "is there a
market on the next Fed cut?" is answered rather than delegated. And it prepares
orders as proposals on a confirm card. It never places one.

## Guardrails still apply

Every prediction order goes down the same guarded path as any other, and your
[risk guardrails](/docs/risk-guardrails) are checked there. The hold-to-confirm
gesture and the paper badge behave exactly as elsewhere.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Mobile terminal](/docs/mobile-terminal), which trades Polymarket fully
- [Panels](/docs/panels) for everything else you can put beside the chart
