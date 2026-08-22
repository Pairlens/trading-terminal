---
title: Desktop app
description: The free desktop app for macOS, Windows and Linux. Why it is the safest place for live-trading keys, the venues only it can reach, and how updates work.
group: get-started
order: 4
eyebrow: Get started
updated: 22 AUG 2026
readTime: 3 min read
---

The desktop app is the same terminal you get in a browser, in a native window.
It is free, it updates itself, and it is where you should keep the keys to any
account holding real money.

## Why desktop for live trading

A browser is a shared, hostile place. Your terminal tab sits next to whatever
else you have open, and browser storage is only as safe as the browser.

The desktop app hands your credentials to your operating system instead. On
macOS they go into Keychain, on Windows into Credential Manager, on Linux into
the Secret Service. These are the same vaults your system uses for your Wi-Fi
passwords, protected by your login, and no web page can reach them.

The browser terminal is not unsafe. Your keys are encrypted there too, behind a
password, a passkey or Touch ID, and they never reach a Pairlens server either
way. Desktop is simply the stronger of the two, and the difference matters most
when the account is funded. See [connect an exchange](/docs/connect-an-exchange).

## What else desktop adds

**Eight more venues.** Coinbase, Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin
Futures and Kraken Futures refuse connections from web pages as a security
policy of their own. A browser cannot reach them at all. The desktop app can,
which takes you from 14 venues to all 22. If a venue looks greyed out in the
browser terminal, this is why.

**Bots that keep running.** A browser tab throttles or suspends background work
when you switch away. The desktop app keeps a running bot alive and can stop the
machine going to sleep underneath it. See [bots](/docs/bots).

**Multiple windows.** Press <kbd>⌘N</kbd> to pull the current view into its own
window. Put your chart on one screen and your book and ticket on another. The
windows stay in sync, and alerts fire once rather than once per window.

**Real system notifications.** Alerts arrive in your operating system's
notification centre, so you see them with the terminal minimized.

**Screenshots that go where you expect.** Chart images save to a real folder you
choose.

## Updates

The app checks for new versions and installs them itself. Every build is signed,
and the app verifies that signature before installing anything, so a tampered
update cannot get in. You can also check by hand from the app menu.

## Get it

Download a build for macOS, Windows or Linux from the
[install page](/install). If you would rather build it yourself, the source is
public and `bun run dev:desktop` is the command. See the
[Quickstart](/docs/quickstart).
