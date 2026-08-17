---
title: Mobile terminal
description: The Pairlens Mobile Trading Terminal. The same URL below 768px, with five destinations over one chart, real order entry, drawings, and the assistant.
group: get-started
order: 5
eyebrow: Get started
updated: 17 AUG 2026
readTime: 9 min read
---

Open [terminal.pairlens.finance](https://terminal.pairlens.finance) on a phone
and you get a different shell. Not the desktop grid squeezed into a column: a
chart-first surface with five destinations, built from the same codebase, with
the same connectors, the same drawings, the same assistant and the same guarded
order path.

The switch happens at 767px. Anything narrower gets the mobile terminal,
anything from 768px up gets the desktop one. It is decided before the first
paint, so a phone never flashes a desktop frame, and it survives a live resize:
drag a desktop window narrow and the shell swaps without dropping your plugin
connections, your sockets or your watchlist.

## Five destinations, one chart

| Tab           | What it is                                                                             |
| ------------- | -------------------------------------------------------------------------------------- |
| **Watchlist** | Your lists, each row with a live price and a trend line. Tapping one switches the pair |
| **Trade**     | Order entry, with the order book above it                                              |
| **Chart**     | The chart on its own, with the drawing toolbar                                         |
| **Assistant** | The full assistant, same 95 tools and same confirm cards as the desktop                |
| **Discover**  | Featured pairs, prediction markets, news, Fear and Greed, and today's P&L              |

The chart is underneath all five and never unmounts. The other four are bottom
sheets that slide over it, so switching destination is not a page load and the
chart behind never redraws from scratch. Drag a sheet up to expand it, down to
dismiss it, or just tap the chart.

The [assistant](/docs/ai-copilot) gets a tab rather than the desktop's docked
orb, because a phone has no room for a floating window over a chart. It is the same conversation underneath: it draws on the live chart under
the sheet, prepares orders on the same confirm cards, and asks its questions on
the same tappable option cards.

That is also why the tabs are not URLs. The address bar stays on
`/spot/okx/BTC-USDT`, rewritten as you change pair or venue so a refresh or a
shared link lands on exactly what you were looking at, while the browser's back
button walks the shell one step at a time: back closes the sheet, then leaves.

## The bar at the top

Three controls, always visible.

The **pair chip** opens the pair picker, which doubles as search across every
venue. Pick something the current venue does not list and it tells you before
you commit, then brings the right venue with it.

The **venue chip** opens the venue picker and carries a live connection badge:
**LIVE** when market data is streaming, an ellipsis while it connects, and
**OFFLINE** for a venue this device cannot reach. An eye glyph next to it means
the venue is read-only for you.

The **avatar** opens Settings, which is a screen rather than a tab.

## The chart

**Timeframes** live on a chip beside the price. Four are pinned by default
(1m, 1h, 1D, 1W) and the rest are one tap further down. Long-press any of them
to pin it, and the least recently used pin makes room.

**The toolbar** above the tab bar is eight chips: the cursor, two tool slots,
indicators, the full tool sheet, the crosshair mode, undo, and clear. The two
slots are earned rather than fixed. Pick anything from the tool sheet and it
moves into the toolbar, pushing out whatever you have used least, so after a
day the toolbar is the two tools you actually draw with.

**Drawing uses a reticle, not your fingertip.** Arm a tool and a crosshair
parks in the middle of the plot with a price and time readout under it. Drag
anywhere to move it, floated well above your finger so you can see what you are
aiming at, then tap **Set point**. Multi-point tools count the steps for you.
Freehand tools (brush, highlighter, polyline, Elliott wave) still draw straight
under your finger.

**The crosshair chip cycles Magnet, Free, and Hidden.** Magnet is the default,
and on a phone it is also the snap control: in Magnet your points land on the
candle, in Free they land where you put them.

Undo is the chart engine's own history, so it undoes the drawing you just made
rather than approximating it. Clear asks first.

## Trading

The Trade sheet is a real ticket, not a shortcut to one.

Above it sits the order book as a single live row: best bid, best ask, the
spread, and a pressure bar. Tap it for the full book with its own grouping
control.

The ticket has Buy and Sell, an order type of **Limit**, **Market**, or
**Stop**, an amount whose unit chip toggles between base and quote without
opening the keyboard, and 25/50/75/Max shortcuts. Order types the venue cannot
do are visibly disabled rather than hidden, so a DEX without limit support says
so. The limit price is seeded from the live book the first time, which puts the
line where you are already looking.

**On an event contract the ticket takes dollars.** The question and its
resolution date sit at the top, the amount is collateral with **$25**, **$50**,
**$100** and **Max** as presets, and the count it buys is stated under the
field, floored to whole contracts. Above the confirm bar is the payout card:
what the order returns if it is right, split against what it costs, with the
stake, the profit and the return. The limit field takes cents, 53 for 53¢. It is
the desktop ticket's arithmetic, and the presets are the same list, so a stake
edited on the desk is the stake offered here. See
[Prediction markets](/docs/prediction-markets).

**A limit price shows on the chart** as a dashed line with a draggable tag.
Move the line and the field follows, type in the field and the line follows. It
is an order line, not a drawing, so it never turns up on your desktop chart.
If the level is below the part of the chart the sheet leaves visible, the line
pins to the bottom edge with a chevron rather than disappearing.

**Confirming is a press and hold.** The bar at the bottom fills as you hold and
commits at the end: 720ms for live funds, 480ms for paper. If you have set
order confirmation to a single click in
[Risk Management](/docs/risk-guardrails), it is a tap instead. Either way the
order leaves through exactly the same guarded path as the desktop, so your
position caps, loss caps and order locks all apply, and the row above the
confirm bar tells you how much of your cap the order would use before you
commit.

If you have no key for the venue, the ticket blurs behind a card that offers to
connect one, and the order book above it stays live. A venue that is read-only
for you says that instead, with no button, because there is nothing to fix.

## Discover

Discover is the browse sheet: Fear and Greed and today's P&L as two cards,
featured pairs, prediction markets, then the news feed. The two cards and the
two lists each open out into a full screen, so the sheet stays a summary.

**Prediction markets** sit between the featured pairs and the news. A handful
of live events, each with its artwork, its question, how long until it resolves,
and a price button per outcome in cents, Yes in green and No in red. Tap an
outcome and it becomes the chart, with the ticket and the book quoting the same
side. Tap the event heading and the whole event opens as its own screen: every
question it carries, every outcome priced. **All events** opens the full board,
where you can search question text and filter by venue.

Cards are bounded on both surfaces. A race with thirty candidates would
otherwise be sixty buttons deep and push the rest of Discover off the screen, so
a card shows the leading questions and counts the rest into a tap that opens the
event.

The section only exists when a connected plugin serves event contracts. Disable
Kalshi and Polymarket in the Plugin Store, or ship a build without the
predictions family, and the heading goes with them rather than standing over an
empty list. In a browser Kalshi cannot answer at all, so on a phone the board
lists what Polymarket has and names Kalshi once, in a line, instead of failing.

## What the phone does not do

Some screens are desktop-only. Open a link to one on a phone and you get a
single toast, **"That screen is only on the desktop app,"** and land on the
chart rather than something broken. Those are workspaces and the workspace
store, bots, workflows, notification rules, the Python indicator workbench, and
the plugin store.

Eight venues (Coinbase, Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin Futures,
and Kraken Futures) serve no CORS headers, so no browser can reach them, phone
included. They are listed in the venue picker under **Needs the desktop app**
rather than hidden, so you can see what you are missing. The other twelve work,
Polymarket and Binance Futures included, so
[event contracts](/docs/prediction-markets) and
[perpetual futures](/docs/cex-futures) both trade from a phone.

The desktop's Prediction Discovery workspace is a pane layout, so it stays on
the desktop grid. The phone carries the part that matters, the event board
itself, in Discover (above), and pair search finds an outcome by its question
text as well.

Two smaller things are desktop-only on purpose: editing an existing indicator's
parameters, and reordering a watchlist.

## It is the same terminal

The phone is not a separate profile. On the same device it reads and writes the
same state the desktop terminal does, and with
[cloud sync](/docs/settings#cloud-sync) on it follows you between devices:

- Drawings, per pair. A level drawn on the phone is on the laptop.
- Indicators, per pair. An EMA added on the laptop is already in the mobile
  indicators list.
- Timeframe, venue, chart type, and price scale.
- Watchlists, recent pairs, risk settings, display currency, theme, and every
  Settings section.
- Connected accounts, through the same vault.

Two things stay on the phone, because they describe a thumb rather than a
setup: the two earned toolbar slots and your pinned timeframes.

## Your keys on a phone

Same rule as any browser: exchange API keys and wallet secrets are encrypted on
the device and never reach a Pairlens server. Connecting an account mounts the
same wizard the desktop Accounts page uses, and the first credential requires
enrolling a way to unlock the vault, so a phone either holds ciphertext or
holds nothing.

Face ID, Touch ID and Android fingerprint unlock work here too, both for the
vault and for the terminal lock screen. See
[Settings, Security](/docs/settings#security).

If the vault is sealed, the phone says so and offers to unlock. It never
reports your accounts as missing.

## Add it to your home screen

The terminal ships a web app manifest, so **Add to Home Screen** installs it as
a standalone app with its own icon rather than a browser bookmark. There is no
service worker and no offline mode, deliberately: this is live market data, and
a cache that answers on an exchange's behalf is worse than no cache.

Pinch to zoom works. Nothing is capped.

## Related

- [Quickstart](/docs/quickstart)
- [Desktop app](/docs/desktop-app) for what the native shell adds
- [Connect an exchange](/docs/connect-an-exchange)
- [Settings](/docs/settings)
