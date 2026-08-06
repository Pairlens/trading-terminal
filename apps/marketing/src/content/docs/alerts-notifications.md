---
title: Alerts and notifications
description: Build alert flows from events, conditions, and delivery channels, including price crossings, order fills, candle closes, Telegram, and webhooks.
group: traders
parent: automation
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

An alert is a flow: an event that fires, optional conditions that must hold,
and one or more channels that deliver it. Build them under **Notifications** in
the left nav, on the same kind of canvas as workflows.

The fastest way to make one: right-click the chart at the price you care about
and choose **Add alert at ...**. It creates a real flow with the level filled
in, which you can then open and refine.

## Events

**Price Alert.** Fires when price crosses above or below a level you set. The
one everybody uses. It fires on the crossing, not on every tick that happens to
sit on the wrong side, so a level that is already breached does not spam you.

**Order Executed.** Fires on your own order activity. Filter by side (buy,
sell, or any) and by status (filled, partially filled, or any). Useful for
knowing a resting limit finally got hit while you were away.

**Signal Generated.** Fires when the strategy engine produces a signal.
Optionally filter to a specific signal type.

**Indicator Alert.** Fires on an indicator condition, including alert
conditions declared by your own
[Python indicators](/docs/custom-python-indicators).

**Candle Close.** Fires on each closed candle at a chosen timeframe: 1m, 5m,
15m, 1h, 4h, or 1d. Pair it with conditions to build "tell me at the 4h close
if we are still above the level".

## Conditions

Conditions have pass and fail outputs, so a flow can branch.

**Price Condition.** Price above or below a value.

**Percent Change.** A move of at least N percent, up, down, or either.

**Time Window.** Only pass between a start and end hour in UTC. This is how you
stop an alert waking you at 4am, or restrict one to a session you actually
trade.

## Channels

**Toast.** An in-app notification. Always available, disappears on its own.

**OS Notification.** A real system notification through the OS notification
centre, with an optional sound. It reaches you when Pairlens is not the focused
window, which is the whole point of an alert.

**Telegram.** A message to a Telegram chat, which is how an alert reaches you
when you are not in front of the terminal. It moves the alert off this machine;
it does not keep the rule running, so Pairlens still has to be up for anything to
fire at all — on desktop that can mean running in the background with the window
closed. Set it up once under **Settings → Notifications**
(see below), then drop the channel into any flow. Leave the Chat ID blank to use
the chat you linked in settings, or type one to send that flow somewhere else: a
group with your trading partners, a channel you broadcast to. **Silent** delivers
without a sound, for the alerts you want logged but not announced.

**Webhook.** An HTTP GET or POST to a URL you supply, optionally including the
event payload. This is the escape hatch: pipe alerts into Discord, your own
service, or anything that accepts a hook.

Plugins can contribute more channels through the `notification:channel`
capability.

## Connecting Telegram

Telegram bots are per-person, not per-app. You make your own in about a minute,
and it belongs to you.

1. Open [@BotFather](https://t.me/BotFather) in Telegram and send `/newbot`.
2. Give it a name and a username (the username has to end in `bot`).
3. BotFather replies with a token that looks like `123456789:AAE...`. Paste it
   into **Settings → Notifications → Telegram** and press Connect.
4. Open your new bot, press **Start**, then press **Detect chat** in settings.
   That is how the bot learns which chat to send to: it cannot message you first.
5. Press **Send test message** to confirm the whole path works.

For a group, add the bot to the group and send any message there, then detect
the chat. Group IDs are negative numbers, which is normal. For a channel, add
the bot as an admin and use `@yourchannel` as the Chat ID.

The token is a credential and is stored like one: the OS keychain on desktop,
your encrypted vault in the browser. It never reaches a Pairlens server, and it
is deliberately not part of the flow itself, so a rule that syncs across your
devices does not carry the token with it. That also means each device connects
its own bot (or the same token pasted again).

If a bot ever leaks, `/revoke` in BotFather invalidates the token and hands you
a new one.

## Delivery on desktop

With several Pairlens windows open, exactly one is elected leader through a Web
Lock, so an alert fires once rather than once per window. Notification rules
sync across your devices when you are signed in, but delivery happens on the
machine that is running.

## Testing a flow

Every flow can be test-fired without waiting for the market to cooperate. Use
it to confirm your webhook URL is right, your Telegram chat is linked, and your
OS notifications are actually permitted before you rely on them.

## Alerts against workflows against bots

Reach for an **alert** when you want to know. Reach for a
[workflow](/docs/build-a-workflow) when you want an entry with its exits
attached. Reach for a [bot](/docs/bots) when you want the decision itself
automated. Alerts never place orders, which is exactly why they are the safe
place to start.
