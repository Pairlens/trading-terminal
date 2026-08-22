---
title: Connect an exchange
description: What an API key is, which permissions to grant and which to refuse, and where your key lives once Pairlens has it. Covers exchanges, brokers, wallets and prediction venues.
group: traders
parent: trading
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

## What you are actually connecting

To trade on an exchange from outside its website, you need an **API key**: a
long string the exchange issues you from its own settings page, which acts as a
password for programs rather than people.

Two things make it safer than handing over your login. You choose what the key
is allowed to do, and you can revoke it at any moment without touching your
account. A key scoped to "read balances and place spot trades" cannot withdraw
your funds, cannot change your email, and cannot be used to log in.

Pairlens uses your key to sign requests to that one exchange, and nothing else.

## Four kinds of account

**Crypto exchange.** A centralized venue like Binance, OKX or Kraken, connected
with an API key. Your funds stay on the exchange. Fourteen ship in the box.

**Crypto wallet.** A private key you import so Pairlens can swap directly
on-chain. Covers Solana and five other chains. This is a different security
posture from an exchange key, because a wallet key can move funds. Only import
a wallet you are comfortable trading from, and keep the bulk of your holdings
elsewhere. See [DEX and wallets](/docs/dex-trading).

**Stock broker.** Alpaca today, for US stocks and ETFs. Alpaca hands out free
practice keys in minutes, which makes it the easiest place to rehearse the whole
flow.

**Prediction market.** Kalshi with an API key, or Polymarket with an Ethereum
wallet. See [prediction markets](/docs/prediction-markets).

## The wizard

Open **Accounts** in the left nav and hit **Connect Account**.

1. **Pick the venue.** Only venues with an installed connector appear. If yours
   is missing, install its plugin first.
2. **Choose a trading mode.** **Paper** points at the exchange's own practice
   environment, where one exists, so no real funds are involved. **Live** is the
   real thing.
3. **Enter credentials.** Usually a key and a secret. Some venues want a
   passphrase or an extra field; the form asks for exactly what that venue
   needs.
4. **Name it.** Useful once you run several accounts on one exchange.

## Which permissions to grant

**Grant:** read (balances, orders, history) and spot trading.

**Never grant:** withdrawals or transfers. Pairlens does not need them and will
never ask. A key without withdrawal rights cannot be used to move your money,
no matter who ends up holding it.

**If offered:** an IP allowlist, pinned to your machine. It means the key is
useless from anywhere else.

Keep your own copy of the key somewhere safe. Once it is in your keychain,
Pairlens cannot show it to you again.

If you do not have an account at the venue yet, the Accounts page links straight
to signup, and some links carry a [referral code](/docs/affiliate-program).

## Where the secret goes

**On the desktop app**, into your operating system's own credential store: macOS
Keychain, Windows Credential Manager, or Linux Secret Service. Same place your
system keeps its own passwords.

**In a browser**, into an encrypted vault on your device, unlocked by something
you set up first: a vault password, a passkey, or Touch ID on macOS. Nothing is
stored until you have a way to unlock it, so a browser profile either holds
encrypted secrets or holds nothing at all.

Either way it is never sent to a Pairlens server, not even while you are signed
in. The **Local Only** badge on the Accounts page explains this and links to the
source code so you can check for yourself.

## Alpaca needs its key just to show prices

Every crypto exchange publishes a free public price feed, so a missing key
costs you the order ticket and nothing else. You can chart Bitcoin all day
without connecting anything.

Alpaca is the exception. US stock data is not free, so there is no public feed,
and a stock chart stays empty until your key reaches the connector.

In a browser that has one consequence worth knowing: the vault locks on every
page reload, and a locked vault means a blank stock chart until you unlock it.
The panels say so and carry the unlock button.

If you use Alpaca in a browser, set up a passkey. It answers the lock screen and
the vault in one touch. Pairlens offers this once, right after you connect
Alpaca, and **Settings → Security** has it any time.

On the desktop app this never comes up, because keys load from the OS keychain
at startup.

## Regional endpoints

Set your country in **Settings → Country**. Exchanges route users to different
servers by region, and some are unavailable in some countries entirely. OKX
sends US and Australian users to one address and EU users to another, for
example.

If a venue is not available where you are, Pairlens tells you plainly instead of
failing in a confusing way.

## Checking it worked

Once a key is saved, your balances load and the order ticket unlocks for that
venue. The credential row shows where the secret is stored. If the exchange
rejects the key, its own error message is shown to you word for word rather than
hidden behind something generic.

## Removing a key

Delete the credential row and it is erased from your keychain or vault. Because
nothing was ever synced anywhere, there is nothing to revoke on our side.

If you think a key may have been exposed, revoke it at the exchange itself. That
is the only action that truly invalidates it.

## Next

- [Place an order](/docs/place-an-order)
- [Risk guardrails](/docs/risk-guardrails)
- [Paper trading](/docs/paper-trading)
