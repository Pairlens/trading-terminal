---
title: Workspaces
description: Build layouts that suit how you trade, bind panels to variables so one workspace serves every pair, and copy ready-made ones from the store.
group: traders
order: 8
eyebrow: For traders
updated: AUG 2026
readTime: 7 min read
---

A workspace is a saved arrangement of panels. Scalping wants a book, a depth
chart, and a ticket. Swing trading wants a daily chart, news, and a research
panel. Rather than reconfiguring, you keep both and switch.

## Building one

**New Workspace** in the left nav creates an empty grid. Add panels from the
empty-cell placeholder, from omni-search (<kbd>⌘K</kbd>, then **Add to
layout**), or from the pane menu on an existing panel.

Drag separators to resize. Split a cell horizontally or vertically, replace
what is in it, or close it. Panels marked as singletons appear once per
workspace, which is why you cannot end up with two Portfolio panels quietly
disagreeing.

Rename a workspace, change its icon, or delete it from its context menu.

## One pair layout per asset class

The pair page itself is a workspace too, and it is saved per asset class. Spot,
perpetuals, DEX tokens, stocks, and prediction markets each keep their own
arrangement: rearrange the panels while charting a perp and your spot layout
has not moved.

Each class ships a default built for what it trades. Perps swap the spot
positions panel for **Futures Positions** with mark and liquidation. Prediction
markets get the **Events** browser and **Prediction Positions** beside the
book. DEX pairs drop the order book entirely, because pool-quoted depth is
synthetic, and pair the swap ticket with recent tickers. Stocks put the ticket
over the symbol news wire.

The **Workspaces** menu follows the same rule: on a prediction market it
suggests layouts built for prediction markets, not a spot execution desk, and
**Browse Workspace Store** opens the store already filtered to that asset
class.

## Layouts ship with the plugin that owns them

Those per-class layouts are not baked into the app. Each asset-class plugin
carries its own: the perps desk comes from Pairlens Futures, the prediction
desk and the event-market home board from Pairlens Predictions, the on-chain
boards from Pairlens DEX, the stock boards from Pairlens Equities. Disable or
uninstall one from the Plugins page and its layouts leave the Workspace Store,
the Workspaces menu, and Discovery immediately. Enable it again and they come
back.

A layout you already saved keeps working either way. Only the ready-made
entries come and go with the plugin.

Third-party plugins ship workspaces the same way, through a `workspaces` block
in the manifest. See the [Plugin SDK](/docs/plugin-sdk) for the
declaration.

## Folders

Workspaces nest in folders, and folders nest in folders. Once you have a dozen
layouts, grouping them by asset class or by strategy is the difference between
a sidebar you scan and a sidebar you search.

Deleting a folder moves its workspaces to the root rather than deleting them.

## Variables

This is the feature that makes a workspace reusable rather than a snapshot.

A variable is a named binding that panels attach to instead of hard-coding a
pair. Four types:

| Type          | Binds                          |
| ------------- | ------------------------------ |
| **Pair**      | An instrument, with its market |
| **Timeframe** | A candle interval              |
| **String**    | Any text value                 |
| **Wallet**    | One of your connected accounts |

Declare `$main` as a pair variable, point three panels at it, and switching
`$main` switches all three at once. Declare `$compare` as a second pair
variable and you have a side-by-side comparison layout that works for any two
instruments you point it at.

The variables editor shows how many panels use each variable, so you know what
you are about to affect before you change one.

Panels declare what they need. A chart needs an active pair; a trade ticket
needs a pair and a wallet. A panel whose requirement is unbound tells you what
to pick rather than rendering empty.

## Multiple windows

On desktop, **Open in new window** pulls a workspace into its own OS window.
Two monitors, two workspaces, one running app. State stays in sync across
windows, and one window is elected leader so notifications fire once.

## The Workspace Store

Rather than building from scratch, copy one. **Workspace Store** in the left
nav browses ready-made layouts, filtered by trader type, asset, and screen
size.

Each template shows what it needs before you take it:

**Ready to use.** Every plugin it uses is already installed.

**Some plugins disabled.** You have them, but turned off. Enable them from the
Plugins page.

**Needs extra plugins.** Some panels rely on plugins you do not have. You can
still add the workspace; those panels stay empty until you install them.

Templates also declare their security posture. Most panels come from bundled
plugins that already run with full access. If a template pulls in a plugin
requiring full access, you are asked to approve it explicitly before it is
activated, and told which plugin and why.

Templates come from three sources: **Pairlens** (bundled with the app or
shipped by one of its plugins), **Community** (shared by other traders), and
**Yours**.

## Sharing your own

Built something good? **Share to store** publishes a workspace as a template
others can browse and copy. Give it a name, a one-line hook, a description,
tags, and an icon. Sharing needs a signed-in account, and you can remove a
template from the store later.

Sharing publishes the layout, not your data. No credentials, no positions, no
chart history.

## What syncs

Workspaces, their layouts, and their variables persist locally by default and
sync across devices when you are signed in. Signing in changes where the layout
is stored. It never changes where your credentials are stored.

## Related

- [Panels](/docs/panels) for the full catalogue
- [Terminal tour](/docs/terminal-tour)
- [Plugins](/docs/plugins-for-traders) for adding new panels
