---
title: Settings
description: Every setting in the terminal, from the terminal lock and credential vault to cloud sync, keyboard shortcuts, themes, languages, regional endpoint routing, data rate, analytics, and account deletion.
group: traders
order: 10
eyebrow: For traders
updated: 19 AUG 2026
readTime: 11 min read
---

Open settings with <kbd>⌘,</kbd>, from the user menu, or by searching for a
section in omni-search.

## Profile

Display name and profile image, when you are signed in. Purely cosmetic.

## Assistant

Where the assistant waits while you work, and how it talks. What powers it is
the next section down.

**Placement.** Three choices. **Sidebar**, the default, docks the orb in the left
nav rail with your other tools, where the suggestion flies out on hover or
keyboard focus and appears on its own while a run is going. **Bottom bar** moves
it to the bottom right in a strip below the workspace, suggestion readable, with
the panes shrinking to make room so nothing is covered. **Floating** puts the
same pill over the bottom right of your panes: the easiest to notice, and the
only one that overlaps your layout. The orb moves as soon as you pick, no reload.
Whichever you pick, the chat window drags anywhere you want it by its header. See
[the AI assistant](/docs/ai-copilot).

**Persona.** Mentor, Balanced, or Technical: how much the assistant explains
when it answers. The dropdown in the chat window's header writes the same
setting, and a change applies to your next message. On a phone this is the only
place it can be set.

The persona rides the **Settings and preferences** sync domain below. The
placement and wherever you dragged the window do not: they describe this screen,
so every device keeps its own.

## Intelligence

Your hosted AI subscription: current plan, credits used against granted, reset
date, checkout, credit packs, and the billing portal. See
[AI providers](/docs/ai-providers).

## Cloud Sync

What this device is willing to put in your account. The section only exists
when the terminal is talking to an App Server, and it only has anything to say
once you are signed in. Signed out, nothing syncs and everything you do stays
here.

The switch at the top pauses everything without touching the switches below it,
which is what you want for a machine you are borrowing. Under it is a live
status line: syncing, up to date, nothing to send, or a failed attempt that will
retry on your next change.

Then one switch per domain:

| Domain                       | What travels                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Settings and preferences** | Language, theme, keyboard shortcuts, country, plugin registry settings, your assistant persona, and the pair you had open |
| **Chart setup**              | Indicators, drawings, chart type, favourite tools, and your default drawing styles                                        |
| **Workspaces and layouts**   | Custom workspaces, folders, panel layouts, and workspace variables                                                        |
| **Workflows and alerts**     | Automation workflows, alert rules, and the pairs they watch                                                               |
| **Plugins**                  | Which plugins are enabled, their settings, and your provider pins                                                         |
| **Assistant conversations**  | Your chat threads with the assistant, and everything in them                                                              |
| **Trade journal**            | Trades you or the assistant log                                                                                           |

Three things about these switches are worth knowing before you flip one.

**Switching something off never deletes anything.** It stays on this device and
the copy already in your account is left alone. It just stops updating and goes
stale. Switch it back on and the two sides merge, newest change winning, which
means something you deleted while it was off can come back if your account still
has it.

**Assistant conversations are the one domain that ships off.** Every other
switch here starts on and turning it off is the opt-out; this one starts off and
you turn it on. The assistant's own rail asks once, and the switch here is where
you change your mind. While it is off, threads are kept on the device that made
them and nothing is uploaded. See
[the assistant](/docs/ai-copilot#where-they-are-stored).

**One of them has no local store.** The trade journal only ever lives in your
account, so off there means not recorded anywhere rather than recorded locally.

**Plugin settings include plugin API keys.** An AI provider key you typed into a
plugin's own settings travels with the Plugins domain. Exchange API keys and
wallet secrets never do, in any domain, with any switch on: they are on the
blocklist alongside the terminal lock, and the App Server has no schema to put
them in. See [Security](#security) and the
[security model](/docs/security-model).

The switches themselves are never synced. They describe what this device sends,
so each device decides for itself.

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

| Trigger                      | What it does                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **When the app starts**      | Prompts on a cold start. A reload or a second window is not a cold start                                                                                                                  |
| **After inactivity**         | 1, 5, 15, 30, or 60 minutes with no mouse or keyboard                                                                                                                                     |
| **On a schedule**            | Every 1, 4, 8, 12, or 24 hours, however busy the session is                                                                                                                               |
| **After the computer wakes** | Prompts when the machine comes back from sleep                                                                                                                                            |
| **Before placing an order**  | Confirms orders you place by hand or through the assistant, auto-approved proposals included. Bots are never asked. A grace window of 0, 1, 5, or 15 minutes decides how often you retype |

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
either. There is no recovery here.

**Changing how the vault opens asks for your password, even when it is already
open.** Adding a method always did, because the data key cannot be re-wrapped
without recovering it first. Removing one and turning the vault off now ask
too. The reason is the second window: open the terminal in another tab and it
receives the key from the first, so it is unlocked without anyone having typed
anything. That is what makes a second window useful, and it is exactly what you
do not want standing behind "remove this passkey" on a machine you walked away
from. Reading your keys still costs nothing there. Changing the locks costs one
password.

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

**What checks your password depends on whether a vault stands behind it.** With
a vault password enrolled, the lock screen answers by actually unwrapping your
vault key: it either decrypts or it does not, so nothing an attacker can edit
in browser storage makes it say yes. Without one, the check is a stored hash of
your password, which is the only artifact there is. On desktop that hash sits
in the system keychain and never leaves the machine. In a browser it is in
browser storage, so clearing site data removes the lock, and someone who can
edit that storage can get past the screen. They reach a terminal with no keys
in it, because there were none to protect in that configuration.

The command-line tool takes API keys as arguments and never reads the vault at
all.

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

## Keyboard

Every shortcut in the terminal is yours to change. The
[shortcut reference](/docs/keyboard-shortcuts) lists what the defaults are; this
section is where you change them.

**Presets** are the starting point, and your own edits sit on top of whichever
one you pick, so switching preset never throws your customizations away.

| Preset                | What it changes                                                         |
| --------------------- | ----------------------------------------------------------------------- |
| **Pairlens**          | The shipped defaults                                                    |
| **TradingView style** | Drawing chords and redo follow TradingView habits                       |
| **Bloomberg style**   | Function keys jump between sections, the way a Bloomberg keyboard works |

Below that is every command, grouped as General, Navigation, Workspace, Chart,
Timeframes, and Drawing tools, with a search box because the list runs past
forty rows. Hover a row to add a chord, remove one, or restore its default. A
command can carry more than one chord, and a command can carry none: a few ship
deliberately unbound, including **Lock terminal** and **Hard lock**, because the
obvious chords are already taken and stealing one is worse than leaving a
command discoverable and assignable here.

Recording is literal. The very next combination you press is the one that gets
assigned, Escape and Enter included, so the recorder takes the keyboard away
from everything else while it is armed. Leave it with the Stop button rather
than a key.

Two warnings show up on their own. A chord bound to more than one command is
listed under **Shortcut conflicts** at the top, and only the first command
listed runs. A chord the browser or the operating system is likely to claim
before Pairlens sees it is marked on its row: it is allowed, but it may never
reach the app.

**Reset all** puts every command back to what the current preset says.

Rows marked for chart panes follow the routing rule in the
[shortcut reference](/docs/keyboard-shortcuts): they go to the chart pane you
last pointed at, and they are suppressed while you are typing.

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

**Support prompts.** After the terminal has earned its keep, it may ask you to
support Pairlens, currently with a star on the GitHub repository. Whether and
when to ask is decided from counters that never leave this device: days
active, pairs explored, orders placed, things built. It appears at most once
every two weeks, "Maybe later" pauses it for three weeks, and "Don't ask
again" is permanent.

**Export your data.** Downloads everything held for your account as one JSON
file: profile, workspaces, chart layouts, trade journal, workflows, alerts,
plugin settings, billing history, and your assistant conversations if you turned
their sync on. Exchange API keys and wallet secrets are never in it, because they
were never on our servers: they stay in the OS keychain on desktop or the
encrypted vault in a browser.

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
in the bot, link the chat) and any alert can then deliver to it. The bot token is stored like an exchange key: OS
keychain on desktop, encrypted vault in the browser, never on a Pairlens
server. Full walkthrough in
[Alerts and notifications](/docs/alerts-notifications).

The rules themselves live under **Notifications** in the left nav.

## Desktop menu

The desktop app carries the same settings in its native menubar, plus
**Check for Updates**, **New Window** (<kbd>⌘N</kbd>), and back and forward
navigation (<kbd>⌘[</kbd> and <kbd>⌘]</kbd>).
