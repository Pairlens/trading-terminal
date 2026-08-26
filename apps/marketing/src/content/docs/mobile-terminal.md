---
title: Mobile terminal
description: The same web address on a phone opens a chart-first trading terminal with five tabs, real order entry, drawings and the assistant. What it does, and the few things it leaves to the desktop.
group: get-started
order: 5
eyebrow: Get started
updated: 26 AUG 2026
readTime: 9 min read
---

Open [terminal.pairlens.finance](https://terminal.pairlens.finance) on a phone
and you get a different app. Not the desktop grid squeezed into a column: a
chart-first surface built for a thumb, with the same exchanges, the same
drawings, the same assistant and the same order checks.

Nothing to install, though **Add to Home Screen** gives it its own icon and
hides the browser chrome.

## Five tabs, one chart

| Tab           | What it is                                                           |
| ------------- | -------------------------------------------------------------------- |
| **Watchlist** | Your lists, each row with a live price and a trend line              |
| **Trade**     | The order ticket, with the order book above it                       |
| **Chart**     | The chart on its own, with the drawing tools                         |
| **Assistant** | The full AI assistant, same abilities as the desktop                 |
| **Discover**  | Featured pairs, prediction markets, news, and today's profit or loss |

The chart sits underneath all five. The other tabs are sheets that slide over
it, so switching tabs never reloads anything and the chart keeps streaming
behind whatever you are doing. Drag a sheet up to expand it, down to dismiss it,
or just tap the chart.

The address bar stays on the market you are looking at, so a refresh or a shared
link lands exactly where you were. The back button closes the open sheet first,
then leaves.

## The bar at the top

**The pair chip** opens search across every venue. Pick something your current
exchange does not list and it tells you before you commit, then switches
exchange for you.

**The venue chip** shows which exchange you are on and how the connection is
doing: **LIVE** when prices are streaming, **OFFLINE** for a venue your phone
cannot reach. An eye icon means you can watch but not trade there.

Tap it and every exchange in the list is asked, right then, whether it carries
the pair you are looking at. A tick means it answered with data, a cross means
it has never heard of the pair, and a crossed row cannot be tapped. Switching
exchange costs a reconnect, so the list tells you which switch is worth making
before you spend one.

**The avatar** opens Settings.

## The chart

**Touch and hold to read any bar.** Phones have no mouse, so there is no
crosshair following your pointer. Hold a finger on the chart for a moment and
one appears underneath it, showing that bar's open, high, low and close, its
percentage move, its volume, and its date. Drag without lifting to scrub bar by
bar. Let go and the readout stays put so you can read it with your hand out of
the way. Tap the ✕ to dismiss it.

**Timeframes** live on a chip beside the price. Four are pinned by default (1m,
1h, 1D, 1W) and the rest are one tap away. Long-press any of them to pin it.

**The toolbar** above the tabs holds eight chips: the cursor, two tool slots,
indicators, the full tool sheet, snapping, undo and clear. The two slots are
earned: pick anything from the tool sheet and it moves into the toolbar,
pushing out whatever you use least. After a day, the toolbar is the two tools
you actually draw with.

**Drawing uses a target, not your fingertip.** Your finger covers the exact spot
you are trying to hit, so instead a crosshair parks in the middle of the chart
with a price and time readout under it. Drag anywhere to move it, floated well
above your finger, then tap **Set point**. Multi-point tools count the steps for
you. Freehand tools (brush, highlighter, polyline) still draw directly under
your finger.

The snap chip cycles **Magnet**, **Free** and **Hidden**. In Magnet your points
land on the candle, which is what you want for a support level. In Free they
land wherever you put them.

**Prediction markets chart as odds, not candles.** Opening an event shows every
possible answer on one time axis, each as a probability. Tap a name in the
legend to hide its line. Drag across the chart and a card reads the whole field
at that moment, sorted by likelihood, so you watch one answer overtake another.
Switch between separate lines and stacked bands, and use the chip in the corner
to go back to ordinary candles for the single answer you are trading. See
[prediction markets](/docs/prediction-markets).

## Trading

The Trade sheet is a real ticket, not a shortcut to one.

Above it, the order book compressed to a single live row: best bid, best ask,
the spread and a pressure bar. Tap it for the full ladder.

The ticket has Buy and Sell, a type of **Limit**, **Market** or **Stop**, an
amount whose unit toggles between the coin and the dollars without opening the
keyboard, and 25/50/75/Max shortcuts. Order types your exchange does not offer
are shown greyed out rather than hidden, so you learn what is missing instead of
wondering. The limit price starts at the live market price, which is usually
where you want it.

**Your limit price shows on the chart** as a dashed line with a draggable tag.
Move the line and the number changes; type a number and the line moves. It is an
order, not a drawing, so it never turns up on your desktop chart.

**Confirming is a press and hold.** The bar at the bottom fills as you hold and
commits at the end: a little longer for real money than for practice. This is
deliberate, because a mis-tap on a phone is easy and an accidental market order
is expensive. If you prefer a single tap, change it in
[Risk Management](/docs/risk-guardrails).

Either way the order goes through exactly the same checks as on the desktop.
Your position caps and daily loss caps apply, and the row above the confirm bar
tells you how much of your cap this order would use before you commit.

If you have no key for the exchange, the ticket blurs behind a card offering to
connect one, and the order book above it stays live so you can still watch.

**On a prediction market the ticket takes dollars.** The question, its
resolution date and the venue's own rules sit above the ticket. Under it, every
possible answer as a chip with its price, favourites first. Tap another answer
and the ticket, chart and book all follow without leaving the screen. Above the
confirm bar is a payout card: what the trade returns if you are right, against
what it costs.

## Discover

The browse sheet: a Fear and Greed reading and today's profit or loss as two
cards, then featured pairs, prediction markets, and the news feed. News
refreshes itself every couple of minutes while the app is in front, and new
stories arrive at the top without a pull.

**Prediction markets** get their own section: live events with their artwork,
the question, time until it resolves, and a price per answer in cents. Tap an
answer to load it in the chart and ticket. Tap the heading to open the whole
event, where each question carries the venue's own resolution rules, collapsed
until you want them.

An event with more than two answers gets **Rank all N outcomes**, which opens
the field as one ranked list with each runner's probability, its 24-hour move,
and the sum of every price so you can see whether the field is collectively
priced above or below a fair 100%. A 128-candidate race read one market at a
time never answers "who is winning". This does.

## What the phone does not do

Some screens are desktop-only. Open a link to one on a phone and you get a
single message and land on the chart rather than something broken:

- Workspaces and the workspace store
- Bots, workflows and notification rules
- The Python workbench
- The plugin store
- [NFT collections](/docs/nft-trading)

NFTs are on that list for an honest reason. Trading a collection means reading a
bid ladder, a listings ladder, trait floors and a sweep ticket at the same time,
and half of that on a phone screen would be worse than sending you to a laptop.

Two smaller things are desktop-only: editing an indicator's settings, and
reordering a watchlist.

**Eight exchanges cannot be reached from any browser**, phone included:
Coinbase, Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin Futures and Kraken
Futures. They block web pages as a policy of their own, and only the
[desktop app](/docs/desktop-app) can reach them. They appear in the venue picker
under **Needs the desktop app** rather than being hidden, so you can see what
you are missing.

The other fifteen work fine, so perpetual futures and Polymarket event contracts
both trade from a phone.

## It is the same terminal

The phone is not a separate profile. On the same device it shares state with the
desktop terminal, and with [cloud sync](/docs/settings#cloud-sync) on it follows
you between devices:

- Drawings, per pair. A level you drew on the phone is on the laptop.
- Indicators, per pair.
- Timeframe, venue, chart type and price scale.
- Watchlists, recent pairs, risk settings, display currency, theme, and every
  Settings section.
- Connected accounts, through the same vault.

Two things stay on the phone, because they describe a thumb rather than a setup:
your two earned toolbar slots and your pinned timeframes.

## Your keys on a phone

Same rule as any browser. Exchange keys and wallet secrets are encrypted on the
device and never reach a Pairlens server. Connecting an account uses the same
wizard as the desktop, and your first credential requires setting up a way to
unlock the vault, so a phone either holds encrypted secrets or holds nothing at
all.

Face ID, Touch ID and Android fingerprint unlock work for both the vault and the
terminal lock screen. See [Settings, Security](/docs/settings#security).

If the vault is locked, the phone says so and offers to unlock it. It never
pretends your accounts are missing.

## Related

- [Quickstart](/docs/quickstart)
- [Desktop app](/docs/desktop-app) for what the native app adds
- [Connect an exchange](/docs/connect-an-exchange)
- [Settings](/docs/settings)
