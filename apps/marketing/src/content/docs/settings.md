---
title: Settings
description: Every setting in the terminal, from the terminal lock and credential vault to themes, languages, regional endpoint routing, data rate, analytics, and account deletion.
group: traders
order: 9
eyebrow: For traders
updated: AUG 2026
readTime: 10 min read
---

Open settings with <kbd>⌘,</kbd>, from the user menu, or by searching for a
section in omni-search.

## Profile

Display name and profile image, when you are signed in. Purely cosmetic.

## Intelligence

Your hosted AI subscription: current plan, credits used against granted, reset
date, checkout, credit packs, and the billing portal. See
[AI providers](/docs/ai-providers).

## Plugins

A shortcut into plugin management. See
[plugins](/docs/plugins-for-traders).

## Country

Pick your country and connectors route API requests to the correct regional
endpoint. This matters more than it looks: OKX sends US and Australian users to
`us.okx.com` and EU users to `eea.okx.com`, and some venues are unavailable in
some regions entirely. Setting it correctly is the difference between a
connector working and a connector timing out for reasons nobody can see.

## Currency

Display currency for portfolio values and balances: USD, EUR, or GBP. It
changes how values are shown, not what you hold.

## Risk Management

Loss caps, position caps, trade caps, the breach action for each, the reset
window, the gesture that commits an order, and the AI's trade permissions. This
is the most important page in settings and it has its own guide:
[risk guardrails](/docs/risk-guardrails).

**Order confirmation.** Press and hold is the default: you hold the submit
button until it fills, and live orders hold longer than paper. Switch it to a
single click if you place a lot of orders and want the ticket out of your way.
Either way the risk limits above still apply.

## Security

Two different things live here. The **terminal lock** puts a password prompt in
front of the screen and stops the person at your desk. The **credential vault**
encrypts your exchange API keys and wallet keys and stops someone who copies
your disk. Turning one on does not turn on the other.

### Terminal lock

Set a password of at least twelve characters and the terminal asks for it
before it can be used on this device. There is no recovery. Nothing is
encrypted with this password, so there is no key to escrow and no account to
prove ownership against. Save it in your password manager before you close the
dialog.

**Biometric unlock.** In a browser, phone included, you can add Face ID, Touch
ID, a fingerprint reader, or Windows Hello as a way past the lock screen. It
rides your device's own unlock, so there is no new secret anywhere: what
Pairlens stores is a credential id. Your password keeps working, and it stays
the only way back in if the sensor stops recognising you.

It opens the screen and nothing else. If you also have a vault, your keys ask
for their own password after the screen unlocks. What opens both in one gesture
is a vault passkey, added under Ways to unlock below.

The desktop app has no biometric row: it serves the terminal from a `tauri://`
origin, which is not a valid WebAuthn origin. Touch ID on a Mac is offered
through the vault there instead.

**When to lock.** Five independent triggers:

| Trigger                      | What it does                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **When the app starts**      | Prompts on a cold start. A reload or a second window is not a cold start                                                                                                                |
| **After inactivity**         | 1, 5, 15, 30, or 60 minutes with no mouse or keyboard                                                                                                                                   |
| **On a schedule**            | Every 1, 4, 8, 12, or 24 hours, however busy the session is                                                                                                                             |
| **After the computer wakes** | Prompts when the machine comes back from sleep                                                                                                                                          |
| **Before placing an order**  | Confirms orders you place by hand or through the copilot, auto-approved proposals included. Bots are never asked. A grace window of 0, 1, 5, or 15 minutes decides how often you retype |

**Lock now** closes settings and locks immediately. It ships without a keyboard
shortcut on purpose, because the obvious chords belong to the workspace menu,
the browser address bar, and macOS's own screen lock. Assign one under
[Keyboard](/docs/keyboard-shortcuts), or run it from the command palette.

### Credential vault

In a browser the vault is not optional: enrolling a way to unlock it is a
precondition for storing your first key, so it turns itself on the first time
you connect an account. On desktop it is a switch. Your keys are already in the
OS keychain there, and the vault adds a password or a passkey on top of that.

**Ways to unlock** lists everything enrolled, everything you can still add, and
anything visible but out of reach with the reason written on the row. Any of
them also opens the terminal lock screen.

| Method       | What it is                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| **Password** | The same password that unlocks the terminal. One secret, both doors                |
| **Passkey**  | Touch ID, Windows Hello, or a USB security key, through WebAuthn                   |
| **Touch ID** | macOS desktop only, and only ever added to a vault that already has another way in |

Touch ID cannot be your only way in: macOS invalidates the key whenever the
fingerprints on the Mac change, and a vault with nothing else in it would be
one System Settings visit from unopenable. You cannot remove the last method
either, and removing any of them means unlocking the vault first. There is no
recovery here.

**Hard lock** seals the vault rather than just covering the screen. Live bots
and automations stop trading until you unlock again; paper bots keep running.
It is the button for someone standing behind you, and it is unbound for the
same reason.

### What this does and does not protect

Armed bots keep trading while the screen is locked. Locking the screen is not
pausing your strategies; hard lock is.

The vault and the lock screen share one attempt limit. Five wrong passwords arm
a doubling delay capped at five minutes, and it survives a reload and a second
window, so a wrong vault password also delays the lock screen.

On desktop your password check lives in the system keychain and never leaves
the machine. In a browser it is in browser storage, which means clearing site
data removes the lock. The command-line tool takes API keys as arguments and
never reads the vault at all.

For the guarantees behind all of this, and how each one is enforced, see the
[security model](/docs/security-model).

### If you forget the password

The lock screen's **Forgot your password?** leads to the only way past it:
erase this device. It removes every exchange API key, wallet key, workspace,
chart layout, and chat stored here, and you type `RESET` to confirm. Settings
that sync to the cloud come back when you sign in again. Keys never do, because
they were only ever on the device.

## Appearance

**Colour mode.** Light, Dark, or System.

**Theme.** Eighteen bundled themes, plus any you have installed. Themes are
independent of colour mode, and every bundled theme ships a light-mode chart
palette too.

**Recent tickers marquee.** A running strip of live prices for pairs you have
been looking at, above the pair header.

## Data Rate

How often connector plugins deliver updates. Lower rates mean less bandwidth
and less CPU.

| Mode             | Behaviour                                                    |
| ---------------- | ------------------------------------------------------------ |
| **Performance**  | Full exchange rate. For active trading                       |
| **Balanced**     | Ticker and book at 250ms, candles at 500ms                   |
| **Energy Saver** | Ticker and book at 1s, candles at 2s. For laptops on battery |

Energy Saver is worth knowing about before you conclude the app is heavy. On a
laptop monitoring six pairs passively, it makes a visible difference to fan
noise and battery.

## Connection

Live status of your market-data connections. Data streams directly from
exchanges through the installed connector plugins, with no intermediate server,
so this page tells you which sockets are up.

## Language

Seventeen languages: English, Spanish, Chinese (Simplified and Traditional),
Russian, Ukrainian, French, Portuguese, German, Italian, Polish, Japanese,
Korean, Vietnamese, Thai, Turkish, and Indonesian. The terminal picks up your
browser or OS language on first run and you can override it here.

## Privacy

**Usage analytics.** Off unless you turn it on. When enabled, it shares
anonymous usage data and crash reports. Never your trades, API keys, or
balances. The setting applies to this device only, and turning it off stops
collection immediately. Builds without an analytics key configured collect
nothing at all and say so.

**Export your data.** Downloads everything held for your account as one JSON
file: profile, workspaces, chart layouts, AI conversations, trade journal,
workflows, alerts, plugin settings, and billing history. Exchange API keys and
wallet secrets are not in it, because they were never on our servers. They stay
on your device: OS keychain on desktop, encrypted vault in the browser.

**Delete account.** Permanently erases your account and everything synced to
it, and cancels any active Intelligence subscription at the same time. You type
your email address to confirm. There is no undo and no recovery.

Data that never left the device is untouched by deletion. Remove it by signing
out and uninstalling.

If you are signed out, the page says so plainly: there is no account data on
our servers, and everything Pairlens knows about you lives on this device.

## Notifications

Where alerts go once they fire.

**System notifications** shows whether Pairlens is allowed to post to your
notification centre, and grants it from a button rather than from a prompt that
appears mid-alert. Safari only grants from a click, and a dismissed prompt is
hard to undo. If your browser has already blocked them, the card says so and
points you at the padlock in the address bar. Test one from here.

Connect a Telegram bot here (paste the token BotFather gives you, press Start
in the bot, link the chat) and any alert flow can then deliver to it. The bot token is stored like an exchange key: OS
keychain on desktop, encrypted vault in the browser, never on a Pairlens
server. Full walkthrough in
[Alerts and notifications](/docs/alerts-notifications).

The rules themselves live under **Notifications** in the left nav.

## Desktop menu

The desktop app carries the same settings in its native menubar, plus
**Check for Updates**, **New Window** (<kbd>⌘N</kbd>), and back and forward
navigation (<kbd>⌘[</kbd> and <kbd>⌘]</kbd>).
