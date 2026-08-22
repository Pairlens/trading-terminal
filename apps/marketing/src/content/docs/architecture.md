---
title: How Pairlens works
description: Where your prices come from, where your keys and data live, and why there is no Pairlens server sitting between you and your exchange.
group: get-started
order: 6
eyebrow: Get started
updated: 22 AUG 2026
readTime: 5 min read
---

You do not need to read this page to trade. It exists because "your machine
talks straight to the exchange" is a claim, and claims should be checkable.

## The shape of it

Most trading front-ends work like this: your browser talks to the company's
servers, and the company's servers talk to the exchanges. Everything you see and
everything you send passes through the middle. That middle can be slow, it can
go down, it can see your positions, and in the worst designs it holds your keys.

Pairlens has no middle. The app running on your machine opens its own
connection to each exchange, receives prices from them directly, and sends your
orders back the same way.

```
   Your machine                          The exchange
   ────────────                          ────────────
   Pairlens  ──── live prices ──────────  Binance, Coinbase,
             ──── your orders ──────────  Alpaca, Kalshi, ...
   Your keys
   (never leave)
```

Three consequences follow, and they are the whole reason for the design:

**Nobody is between you and the market.** No added delay, no rewritten price, no
outage in a service you did not choose.

**Nobody can lose your keys but you.** There is no Pairlens database of exchange
credentials to breach, because none is ever sent.

**It works without us.** Turn off every optional service and the terminal still
charts, still streams, still trades. Nothing about the core loop depends on a
Pairlens account.

## What each piece does

**The terminal.** The app itself, in your browser or on your desktop. It draws
everything, runs the AI assistant's logic, and hosts the plugins below.

**Connectors.** One small module per exchange, and the only code in the whole
system allowed to talk to a venue. Connecting an account means handing your key
to that one connector, which uses it to sign requests to that one exchange and
nothing else. Adding a venue means adding a connector, which is why the venue
list can grow without a new release. See [connectors](/docs/connectors).

**The strategy engine.** The maths behind signals and indicators. Pure
calculation over price history you already have, with no network access at all.

**The Python runtime.** If you write your own indicators or strategies, they run
inside the terminal on your machine, never on a server. See
[Python scripts](/docs/python-scripts).

**The App Server (optional).** A small backend that does four things: email
sign-in, syncing your layouts between devices, relaying AI requests if you use
hosted Intelligence rather than your own key, and serving reference data no
exchange publishes about itself, such as news, earnings and economic calendars,
insider filings and aggregated liquidation data.

It never stores exchange credentials, and it never connects to an exchange on
your behalf. Every price you trade against reaches you from the venue directly.
You can run without it entirely.

## Where your data lives

| What                          | Where it is kept                                             |
| ----------------------------- | ------------------------------------------------------------ |
| Exchange keys and wallets     | Your OS keychain on desktop, an encrypted vault in a browser |
| Price history and order books | In memory on your machine, rebuilt live from the exchange    |
| Workspaces, alerts, journal   | Your device, plus your account if you sign in                |
| Python scripts                | Your device, plus your account if you sign in                |
| Bot activity logs             | The machine running the bot                                  |
| Assistant conversations       | Your device. Syncing them is off until you turn it on        |

The pattern: local by default, synced only when you ask, and credentials never
either way.

## Plugins, briefly

Almost everything in Pairlens arrives as a plugin: venues, AI providers, panels,
indicators, themes. Each one declares what it can do, and the terminal picks a
provider for each job at runtime. That is why installing a plugin can add a
whole exchange or a new panel without waiting for an app update.

Plugins you install yourself run in a sandbox with a network allowlist, and
every package is cryptographically signed. See
[plugins](/docs/plugins-for-traders) for the trader's view and the
[security model](/docs/security-model) for the guarantees.

## For builders

The technical version of this page lives in the repository's `CLAUDE.md` and in
the [Plugin SDK](/docs/plugin-sdk), the
[MarketAdapter API](/docs/marketadapter-api), and the
[security model](/docs/security-model).
