---
title: Alerts and notifications
description: Set a price alert in two fields, watch for a percent move inside a window, see what already fired, and build multi-step flows with conditions, Telegram, and webhooks when you need them.
group: traders
parent: automation
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 7 min read
---

An alert watches a market for you and tells you when something happens. It never
places an order, which makes it the safest piece of automation to start with and
the one most traders get the most out of.

The obvious use is a price level: tell me when Bitcoin crosses 100,000. The less
obvious and often more useful one is a percentage move: tell me when anything
moves 5% in an hour, which catches the thing you were not watching.

Both take two fields and no setup. Flows, with conditions and branches on a
canvas, are there for everything else, one click away and never in your way.

## Or just say it

The assistant takes the sentence directly, from the sparkle above the alert
list or from its dock on any page. "Tell me when BTC crosses 100,000 on OKX"
creates the alert, picks a cooldown that suits the kind, and arms it on that
pair, and you can see the result in the list before you reply. It knows which of the two shapes it is building: a
level or a percent move stays a two-field alert, and only a request the simple
form cannot express (a condition, an order filling, a webhook) becomes a flow
on the canvas.

A flow it builds lands as pending changes for you to commit, the same as one
you drew. Delivery stays conservative: in-app and OS notifications by default,
Telegram only when you ask and only when you have already connected a bot
token, and never a webhook URL it made up.

## Set one in two fields

Press the bell above the chart and choose **New alert**, or open
**Notifications** in the left nav. Either way you get the same small dialog:
pick the pair and venue (prefilled with whatever you were looking at), pick
what to watch, pick how to hear about it. It is armed the moment you press
Create, on the pair it names. There is nothing to save afterwards.

**Price level.** Rises above or drops below a number. The level starts near the
market so you are editing a real price rather than typing one from scratch, and
the current price sits under the field as a one-click reset. It fires on the
crossing, not on every tick that happens to sit on the wrong side, so a level
that is already breached does not spam you. One firing per five minutes at
most.

**Price move.** Up, down, or either, by a percentage, inside a window: 5m, 15m,
1h, 4h, or 24h. This is a genuinely rolling measurement, not a candle body, so
"5% in an hour" means the last sixty minutes from right now, checked on every
tick rather than at the close. It fires when the move crosses your threshold
and then holds its tongue for the length of the window, because a 6% hour that
is still a 6% hour forty minutes later is one piece of news, not forty.

There is a third way in that is faster than both: right-click the chart at the
price you care about and choose **Add alert at ...**. Same alert, level already
filled in.

### Choosing how it reaches you

Three chips at the bottom of the dialog: **In-app** (a toast), **Desktop** (a
real OS notification), and **Telegram**. A channel that cannot deliver on this
device says so instead of pretending: Desktop strikes through where the
platform has no notification API at all, and asks for permission the moment you
arm it where it does.

### Editing later

Click an alert in the Notifications list and it opens as the same form that
made it, with a live price next to the pair. Changes save as you type. The
switch at the top is its kill switch, **Send test** fires it on demand so you
can prove the whole delivery path works before you rely on it, and **Open in
the flow builder** is the door to the canvas when two fields stop being enough.

## Seeing what fired

An alert you cannot review is half an alert. The bell holds both halves:

**Armed** lists what is watching the pair on screen, each with a switch. That
switch silences the alert _here_ and leaves it running on every other pair it
watches. Alerts on other pairs are listed underneath, one click to add this one
to the list. A rule you have disabled outright shows as off and stays off.

**Activity** lists the last few firings, newest first, with the channels each
one reached and a red badge on any that failed. A dot on the bell counts what
has arrived since you last looked.

**See all** opens the full history in a side sheet, grouped by day, back to the
last 200 firings. The Notifications page carries the same recent list under its
rule list, so you can watch an alert work while you are editing it.

The log is local to the machine and is deliberately not synced: it is a record
of what this copy of Pairlens told you.

## When you need a flow

A flow is an event, any number of conditions, and one or more channels, wired
on a canvas. Reach for one when the two-field form cannot say what you mean:
you want a condition in the middle, you want a webhook, or the trigger itself
is something other than a price.

Add one from **Build a custom flow** at the bottom of the Notifications list.
Anything you build there stays a flow. Anything that still matches the simple
shape (one trigger, channels wired straight off it) keeps opening as the form,
so the canvas is somewhere you go on purpose rather than somewhere you land.

### Events

**Price Alert.** Price crosses above or below a level. The one everybody uses.

**Price Move.** A percentage move inside a rolling window, the same trigger the
Price move alert is built on.

**Order Executed.** Your own order activity. Filter by side (buy, sell, or any)
and by status (filled, partially filled, or any). Useful for knowing a resting
limit finally got hit while you were away.

**Signal Generated.** The strategy engine produced a signal. Optionally filter
to a specific signal type.

**Indicator Alert.** An indicator condition, including alert conditions
declared by your own [Python indicators](/docs/custom-python-indicators). These
run headless, so an alert fires on a pair you are not currently charting.

**Candle Close.** Each closed candle at a chosen timeframe: 1m, 5m, 15m, 1h,
4h, or 1d. Pair it with conditions to build "tell me at the 4h close if we are
still above the level".

### Conditions

Conditions have pass and fail outputs, so a flow can branch.

**Price Condition.** Price above or below a value.

**Percent Change.** A move of at least N percent, up, down, or either, measured
against whatever the upstream event carries. For "moved 5% in the last hour",
use the Price Move event instead.

**Time Window.** Only pass between a start and end hour in UTC. This is how you
stop an alert waking you at 4am, or restrict one to a session you actually
trade.

### Channels

**Toast.** An in-app notification. Always available, disappears on its own.

**OS Notification.** A real system notification through the OS notification
centre, with an optional sound. It reaches you when Pairlens is not the focused
window, which is the whole point of an alert. The desktop app posts it natively;
the browser uses the Web Notification API, which is the same notification centre
and needs permission first. Grant it under **Settings → Notifications**, where
you can also fire a test one. Clicking a notification brings the terminal
forward. If permission was never granted or was blocked, the alert is recorded
as a failed delivery in the activity log rather than quietly doing nothing.

**Telegram.** A message to a Telegram chat, which is how an alert reaches you
when you are not in front of the terminal. It moves the alert off this machine;
it does not keep the rule running, so Pairlens still has to be up for anything to
fire at all. On desktop that can mean running in the background with the window
closed. Set it up once under **Settings → Notifications**
(see below), then pick the chip in any alert or drop the channel into any flow.
Leave the Chat ID blank to use the chat you linked in settings, or type one to
send that flow somewhere else: a group with your trading partners, a channel you
broadcast to. **Silent** delivers without a sound, for the alerts you want
logged but not announced.

**Webhook.** An HTTP GET or POST to a URL you supply, optionally including the
event payload. This is the escape hatch: pipe alerts into Discord, your own
service, or anything that accepts a hook. Webhooks are flow-only, because a URL
and a host grant are exactly the setup the simple path exists to skip.

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
Lock, so an alert fires once rather than once per window. Alerts sync across
your devices when you are signed in, but evaluation and delivery happen on the
machine that is running: nothing fires while Pairlens is closed.

## Linking to one alert

The rule you have open is in the address, as `/notifications?alert=<id>`. That
makes an alert something you can link to, walk back to, and point the assistant
at without naming it twice.

## Alerts against workflows against bots

Reach for an **alert** when you want to know. Reach for a
[workflow](/docs/build-a-workflow) when you want an entry with its exits
attached. Reach for a [bot](/docs/bots) when you want the decision itself
automated. Alerts never place orders, which is exactly why they are the safe
place to start.
