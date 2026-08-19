---
title: Workspaces
description: Build layouts that suit how you trade, bind panels to variables so one workspace serves every pair, and copy ready-made ones from the store.
group: traders
order: 8
eyebrow: For traders
updated: 19 AUG 2026
readTime: 11 min read
---

A workspace is a saved arrangement of panels. Scalping wants a book, a depth
chart, and a ticket. Swing trading wants a daily chart, news, and a research
panel. Rather than reconfiguring, you keep both and switch.

## Building one

**New Workspace** in the left nav creates an empty grid. Add panels from the
empty-cell placeholder, from omni-search (<kbd>⌘K</kbd>, then **Add to
layout**), or from the pane menu on an existing panel.

Split a cell horizontally or vertically, replace what is in it, or close it.
Panels marked as singletons appear once per workspace, which is why you cannot
end up with two Portfolio panels quietly disagreeing.

Rename a workspace, change its icon, or delete it from its context menu.

## Moving a panel

A column is one surface, and the panels stacked inside it are divided by a
single hairline. That line is also the resize handle: drag it to give one panel
more room, and drag the gap between two columns to change the split.

Every panel carries a grip at the right end of its title row. It is always
there, faint, and comes up to full strength the moment your pointer enters the
panel, so the handle is lit before you reach for it and nothing shifts on the
way in. Drag the grip, or the panel's title, to pick the panel up. Drop it on
the middle of another panel to stack the two as tabs, on an edge to split, or
past the outer edge of a column to start a new one. The grip takes focus from
the keyboard too.

A close button sits beside the grip and appears with it. **Close Pane** in the
panel's right-click menu does the same, alongside **Pop Out to Column** and the
variable bindings below.

## Discovery is one board per asset class

Discovery carries tabs beside its title, one per asset class: **CEX Spot**,
**CEX Futures**, **DEX**, **Equities**, **Predictions**. Each tab is a full
workspace of its own. Rearrange the futures board and the spot board has not
moved, and each one remembers its own arrangement between sessions.

Every class has one fixed colour, and it is the same colour the badge beside
the pair symbol wears on the trade page (see
[terminal tour](/docs/terminal-tour)). Amber is spot, violet is perps, magenta
is on-chain, green is equities, cyan is event contracts. Pick a tab here and
the pair you open from it is badged in the colour you clicked.

Every tab opens on a board built for what that class is actually shopped on,
and only one of the five is a list of pairs.

**CEX Spot** opens on what moved and why: a market pulse strip over the movers
table and the sector tape, the full markets scanner beside them, and news over
your watchlist in the right rail. Clicking a sector chip filters the scanner
next to it rather than navigating away. Every pane on this board works with no
account connected.

**CEX Futures** scans by cost of carry instead of by price. The funding matrix
takes the wide column with the basis monitor under it, and open interest sits
beside them over the funding extremes. A price scanner already exists on the
spot board, and repeating it here would have made the section the same page a
fifth time.

**DEX** is chain first, then pool: a chain rail on the left, pools ranked by
volume against the liquidity backing them in the middle over the flow chart,
and the selected pool's detail on the right.

**Equities** is built around the calendar rather than the tape. The session
state leads, the earnings calendar sits under it and macro releases under
those, with the movers and the news wire beside them. No sentiment gauge and no
heatmap here: both read a crypto index and would be quietly wrong above a list
of tickers.

**Predictions** swaps the pair scanner for the event board, since outcomes are
listed and resolved daily and never sit in a catalog of pairs. A category rail
narrows the board, and a right rail carries the biggest odds moves over what
settles soonest.

The markets scanner is on the spot board and on any board you add it to. It
opens on that tab's asset class and remembers its own filter per tab, so
widening one board to every market is a decision about that board alone.

Drag a tab to reorder it, or right-click one and move it left or right. If you
trade event contracts and nothing else, put Predictions first. The
**Workspaces** menu and **Browse Workspace Store** follow the open tab, so the
suggestions match the markets in front of you. A tab appears only while the
plugin that owns its board is installed, which makes uninstalling Pairlens
Predictions the way to remove predictions from Discovery entirely.

## One pair layout per asset class

The pair page itself is a workspace too, and it is saved per asset class. Spot,
perpetuals, DEX tokens, stocks, and prediction markets each keep their own
arrangement: rearrange the panels while charting a perp and your spot layout
has not moved.

Each class ships a default built for what it trades.

**Spot Execution** is the chart with the tape, positions and market data tabbed
below it, and a rail that leads with the cross-venue ladder above the order
book and the ticket. The ladder goes first because the question right before
clicking is which venue fills this cheapest.

**Perps Terminal** keeps that skeleton and swaps the spot positions pane for
**Futures Positions** with entry, mark and liquidation, beside a leverage-aware
ticket.

**DEX Terminal** drops the order book entirely, because pool-quoted depth is
synthetic. In its place: the chart over **Pool Stats**, the on-chain tape
beside it, and the swap ticket above the aggregator **Route**, so the slippage
on the ticket has a cause you can read.

**Equities Terminal** leads with the session clock, because extended hours
change what the ticket will accept rather than just a label on it. Level 1
quotes sit over the ticket and the symbol wire.

**Prediction Terminal** leads with the event header, since a prediction pair is
a question and the question belongs above the chart. The data strip opens on the
**Outcome Ladder**, so every answer to that question is priced and one click
from the ticket before you have scrolled anywhere; What Moved It, the tape and
your open contracts sit behind it as tabs. The right column carries the event
brief over the event browser.

Beyond the default, each class carries its own named boards in the same menu:

| Class       | Boards beside Default                                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEX Spot    | **Research** for a position held longer than a session: chart over the pair dossier, the pair's own wire beside it, sector peers under the ticket, and no depth stream open              |
| CEX Futures | **Carry**, with the funding belt above the chart; **Risk**, with the liquidation map, margin health and your guardrails editable in place                                                |
| DEX         | **Liquidity** for the LP side of the pool, with the manage panel beside it; **Cross-Chain** for the same token priced per chain, with the bridge quote and in-flight transfers beside it |
| Equities    | **Company**, the ticker read as a business rather than a price, with its insider filings under it                                                                                        |
| Predictions | **Race**, for a field of a hundred rather than a handful: the outcome ladder gets the whole strip and the basket ticket sits beside it                                                   |

The **Workspaces** menu follows the same rule as the defaults: on a prediction
market it suggests layouts built for prediction markets, not a spot execution
desk, and **Browse Workspace Store** opens the store already filtered to that
asset class.

## Layouts ship with the plugin that owns them

Those per-class layouts are not baked into the app. Each asset-class plugin
carries its own: the perps desk and the futures Discovery board come from
Pairlens Futures, the prediction desk and the event-market board from Pairlens
Predictions, the on-chain boards from Pairlens DEX, the stock boards from
Pairlens Equities. Disable or uninstall one from the Plugins page and its
layouts leave the Workspace Store, the Workspaces menu, and Discovery (its
tab included) immediately. Enable it again and they come back.

Spot is the exception, and deliberately: its boards ship in Pairlens Core,
which cannot be uninstalled, so the Spot tab is always there and the terminal
always has a home to open on.

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
