---
title: Troubleshooting
description: 'Fixes for the problems people actually hit: a venue that will not connect, frozen market data, gaps in a stock chart, a missing panel, a sealed vault, orders that will not submit, and indicators that will not run.'
group: reference
order: 2
eyebrow: Reference
updated: AUG 2026
readTime: 8 min read
---

Most problems in Pairlens have one of five causes: the wrong country is set,
the venue needs the desktop app, an account is not connected, an App Server is
not configured, or a socket went quiet. This page is ordered by symptom.

## A venue will not connect

**Check your country first.** Connectors route to regional endpoints, and the
wrong country sends requests to a host that will not answer for you. OKX sends
US and Australian traffic to `us.okx.com` and EU traffic to `eea.okx.com`, and
several venues refuse some regions entirely. Set it under
[Settings → Country](/docs/settings#country).

**Some venues refuse some regions outright.** When one does, you get a typed
refusal and a dialog that names the region and offers venues that will serve
you, rather than a timeout with no explanation. ByBit refuses the US. Bitvavo is
EU only. Others vary. This is the venue's rule, not ours, and no setting works
around it.

**Five venues need the desktop app.** Coinbase, Gate, KuCoin, MEXC, and Bitfinex
serve REST without CORS headers, which a browser will not allow. In the hosted
web terminal they refuse with a clear message rather than presenting a dead
chart. [Install the desktop app](/docs/desktop-app) or use one of the other ten.

**Check the connection page.** [Settings → Connection](/docs/settings#connection)
shows which sockets are actually up.

## Market data looks frozen

The connection dot in the pair header is the source of truth. If it reads
**Reconnecting**, a socket went quiet and the terminal is already rebuilding it.

The usual trigger is a laptop waking from sleep, which the terminal detects and
recovers from on its own. Give it a few seconds. If it stays reconnecting, the
venue is likely having an incident.

If the dot is green but nothing moves, check
[Data Rate](/docs/settings#data-rate): Energy Saver caps the book and ticker at
one update per second, which on a quiet pair genuinely looks static.

## A stock chart asks me to unlock or connect

Alpaca has no public price feed. Its candles, quotes, and order book are all
served from your own credentialed session, so unlike every crypto venue it
shows nothing at all until a key reaches the connector. The panes say which of
the two things is missing:

**Connect Alpaca to see prices** means no Alpaca key is stored on this device.
The button opens the wizard on Alpaca directly.

**Unlock to load Alpaca data** means a key is probably there but the credential
vault is sealed, which is what happens in a browser after every reload. One
unlock and the chart, the book, and the watchlist quotes fill in without a
refresh.

In a browser you can make that unlock a single touch by enrolling a passkey in
**Settings → Security**. A passkey answers the lock screen and the vault in one
gesture, where a password answers them one at a time. Pairlens offers this once,
right after you connect Alpaca, because that is the moment a sealed vault starts
costing you a chart rather than just an order ticket.

On desktop none of this applies: keys live in the OS keychain and load at
startup.

## A stock chart has gaps in it

Blank stretches on a US stock chart are almost always the market being shut.
Equities trade 9:30am to 4:00pm Eastern on weekdays, so every intraday chart
has a hole across each night and a wider one across each weekend. Crypto never
closes, so the contrast is jarring the first time.

Shorter gaps inside a session are the feed rather than the clock. The free
Alpaca plan carries the IEX tape, which is a single exchange and a small slice
of total volume, so a quiet pre-market or after-hours bucket can pass with no
trade printing on it at all and no candle to draw. Regular hours are dense; the
edges of the day are patchy.

Neither is affected by whether the account is paper or live. Market data is the
same feed either way.

## A panel says it needs something

Panels declare requirements and say which one is unmet rather than rendering
blank.

| Message                  | Fix                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Needs an active pair     | Pick one, or bind the [workspace variable](/docs/workspaces#variables)    |
| Needs a wallet           | [Connect an account](/docs/connect-an-exchange) and select it             |
| Needs an AI provider     | Add a key or subscribe. See [AI providers](/docs/ai-providers)            |
| Desktop only             | The Web panel takes a native window. See [desktop app](/docs/desktop-app) |
| Not listed on this venue | The pair is real, this venue does not carry it. Switch venue              |

## Panels are missing from the catalogue

News, Top Coins, Heatmap, and Fear and Greed read from the App Server. In
[standalone mode](/docs/self-hosting#standalone-mode), or with
`VITE_APP_SERVER_URL` explicitly empty, they are hidden rather than broken.

Everything else works standalone, including all market data, because that comes
from the venue directly.

## I cannot sign in

Sessions use bearer tokens, not cookies, which is what makes sign-in work from
the desktop app and from any origin. If sign-in fails with a bare network error,
the App Server URL is usually wrong or unreachable. Check it under
[self-hosting](/docs/self-hosting).

OTP codes are emailed. Check spam before assuming the send failed.

## The vault will not open

**A sealed vault is not an empty one.** If the vault is locked, credential reads
throw rather than reporting your keys as absent, which is deliberate: silently
reporting "no keys" would make a locked vault look like a wiped one.

**Five wrong attempts arm a delay** that doubles up to five minutes, shared
between the vault and the lock screen and surviving a reload. Wait it out.

**There is no recovery.** If the password is gone, the only way past is
**Forgot your password?** on the lock screen, which erases this device: every
key, workspace, layout, and chat stored here. Synced settings return when you
sign in again. Keys never do, because they were only ever here. See
[settings](/docs/settings#if-you-forget-the-password).

**Touch ID stopped working on macOS.** macOS invalidates the key whenever the
fingerprints on the Mac change. Your password still works, and Touch ID can be
re-enrolled. This is why Touch ID can never be your only way in.

## An order will not submit

Work down this list.

1. **Risk guardrails.** Check the Risk panel. If it reads Limit hit, Buys
   Locked, or Orders Locked, the cap you configured is doing its job. See
   [risk guardrails](/docs/risk-guardrails)
2. **Press and hold.** The default submit gesture is a hold, and live orders
   hold longer than paper. Switch it to a single click in
   [settings](/docs/settings#risk-management)
3. **The lock.** If you enabled lock-before-order, an order prompts for your
   password first
4. **API key permissions.** A read-only key streams data happily and rejects
   every order. Check the key's trade permission on the venue
5. **The venue rejected it.** Minimum notional, tick size, and lot size are
   venue rules. The rejection message comes straight from the venue

## Paper trading behaves oddly

"Paper" means three different things depending on where you are, and they
simulate different amounts of reality: venue demo environments, bot paper mode,
and co-pilot paper trades. Not every venue offers a demo environment. See
[paper trading](/docs/paper-trading).

## A Python indicator or strategy will not run

Python runs locally in a Pyodide worker, so failures are local too.

- **First run is slow.** The runtime and any wheels download once, then cache
- **A `pip` package will not install.** Only pure-Python wheels from PyPI and
  the compiled wheels bundled for Pyodide are reachable. A package with a C
  extension that Pyodide has not built will not install
- **Nothing renders.** Check that `compute` returns an array per declared
  series, matching the `series=[...]` in your `meta`

See [custom Python indicators](/docs/custom-python-indicators).

## Bots stopped trading

- **Hard lock seals the vault**, and live bots cannot sign without it. Paper
  bots keep running. Locking the _screen_ does not stop bots, only hard lock does
- **Bots run on your machine.** Close the terminal and they stop. This is an
  honest limit of a local-first design, and it is covered in [bots](/docs/bots)

## Something looks broken after an update

The web terminal ships new chunks on deploy. A tab left open across a deploy can
hold a stale reference. Reload the page.

On desktop, check for updates from the app menu. Updates are signed and verified
before they install. See [the desktop app](/docs/desktop-app).

## Still stuck

- [Open an issue](https://github.com/Pairlens/trading-terminal/issues) with what
  you did, what you expected, and what happened
- Every docs page has an **Edit on GitHub** link if the fix belongs here instead
