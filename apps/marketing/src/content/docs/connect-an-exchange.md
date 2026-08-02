---
title: Connect an exchange
description: Add exchange, broker, or wallet credentials that live in your OS keychain and only ever sign requests to that one venue.
group: traders
parent: trading
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

Open **Accounts** in the left nav and hit **Connect Account**. Everything you
add is stored on this device and nowhere else.

## Three kinds of account

**Crypto exchange.** A centralized venue such as Binance, OKX, or Kraken,
connected with an API key. Your funds stay on the exchange. Fourteen ship in
the box.

**Crypto wallet.** A private key you import so Pairlens can swap on-chain
through DEXs. Covers Solana via Jupiter and five EVM chains. See
[DEX and wallets](/docs/dex-trading).

**Stock broker.** Alpaca today, for US equities and ETFs. Alpaca hands out free
paper-trading keys in minutes, which makes it the easiest venue to try the
whole flow on.

## The wizard

Connecting an exchange takes four steps:

1. **Pick the exchange.** Only venues with an installed connector appear. If
   yours is missing, install its plugin first.
2. **Choose a trading mode.** **Paper** points at the exchange's demo
   environment where one exists, so no real funds are involved. **Live** is the
   real thing.
3. **Enter credentials.** Usually an API key and secret. Some venues need a
   passphrase or a second field; the form asks for exactly what that venue
   requires.
4. **Name it.** Useful once you run several accounts on the same exchange.

## What to scope

Create a read plus spot-trade key. Pairlens never needs withdrawal permissions,
so do not grant them. If the venue supports IP allowlists, pin the key to your
machine. Keep a backup of the key somewhere safe, because Pairlens cannot show
it to you again once it is in the keychain.

If you do not have an account at the venue yet, the Accounts page links
straight to signup, and some links carry a
[referral code](/docs/affiliate-program).

## Where the secret goes

On desktop, into the OS keychain: macOS Keychain, Windows Credential Manager,
or Linux Secret Service. That is the same encrypted vault your operating system
uses for its own passwords. In browser dev builds it is AES-256-GCM encrypted
before it is written.

Either way it is never sent to a Pairlens server, not even while you are signed
in. The **Local Only** badge on the Accounts page opens a panel explaining
exactly this, with a link to the source so you can check for yourself.

## Regional endpoints

Set your country in **Settings → Country**. Connectors use it to route API
requests to the right regional endpoint, which matters more than it sounds:
OKX sends US and Australian users to `us.okx.com` and EU users to
`eea.okx.com`, and some venues are unavailable in some regions entirely. If a
venue is blocked where you are, Pairlens tells you instead of failing quietly.

## Verifying the connection

Once a key is saved, its balances load and the order ticket unlocks for that
venue. The credential row shows where the secret is stored. If a venue rejects
the key, the error from the exchange is shown verbatim rather than being
swallowed.

## Removing a key

Delete the credential row and Pairlens erases it from the keychain. Because
nothing was ever synced, there is nothing to revoke server-side. If you suspect
exposure, rotate the key at the exchange.

## Next

- [Place an order](/docs/place-an-order)
- [Risk guardrails](/docs/risk-guardrails)
- [Paper trading](/docs/paper-trading)
