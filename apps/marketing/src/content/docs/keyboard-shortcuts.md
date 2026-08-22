---
title: Keyboard shortcuts
description: Every shortcut in the terminal, on macOS, Windows and Linux, plus the two alternative keymaps and how to rebind anything you do not like.
group: reference
order: 3
eyebrow: Reference
updated: 22 AUG 2026
readTime: 3 min read
---

macOS uses <kbd>⌘</kbd> and <kbd>⌥</kbd>. Windows and Linux use
<kbd>Ctrl</kbd> and <kbd>Alt</kbd>.

**If you learn one, learn <kbd>⌘K</kbd>.** It searches pairs, pages,
workspaces, panels, plugins and actions, which is the fastest route to almost
anything in the app.

Hold <kbd>⌘</kbd> for a beat anywhere in the terminal and every control that has
a shortcut shows it.

## Global

| Chord         | Action               |
| ------------- | -------------------- |
| <kbd>⌘K</kbd> | Open omni-search     |
| <kbd>⌘/</kbd> | Open the assistant   |
| <kbd>⌘J</kbd> | Open the assistant   |
| <kbd>⌘,</kbd> | Open settings        |
| <kbd>⇧F</kbd> | Toggle fullscreen    |
| <kbd>⌘N</kbd> | New window (desktop) |
| <kbd>⌘[</kbd> | Back                 |
| <kbd>⌘]</kbd> | Forward              |

The assistant answers to both chords. Prefer <kbd>⌘/</kbd> on the web terminal:
on Windows and Linux the other one is <kbd>Ctrl</kbd>+<kbd>J</kbd>, which Chrome
and Firefox spend on their own Downloads panel before the page ever sees it.

## Sections

| Chord         | Goes to                 |
| ------------- | ----------------------- |
| <kbd>⌥1</kbd> | Pairs                   |
| <kbd>⌥2</kbd> | Charts                  |
| <kbd>⌥3</kbd> | Notifications           |
| <kbd>⌥4</kbd> | Workflows               |
| <kbd>⌥5</kbd> | Indicators & Strategies |
| <kbd>⌥6</kbd> | Accounts                |
| <kbd>⌥7</kbd> | Plugins                 |
| <kbd>⌥8</kbd> | Your workspaces         |
| <kbd>⌥9</kbd> | Workspace Store         |
| <kbd>⌥B</kbd> | Bots                    |

## Workspace

| Chord          | Action                  |
| -------------- | ----------------------- |
| <kbd>⌘⇧P</kbd> | Add a panel             |
| <kbd>⌘⇧L</kbd> | Open the workspace menu |

## Timeframes

Press a digit and the active chart switches.

| Key | Timeframe | Key | Timeframe |
| --- | --------- | --- | --------- |
| 1   | 1m        | 6   | 2h        |
| 2   | 5m        | 7   | 4h        |
| 3   | 15m       | 8   | 1D        |
| 4   | 30m       | 9   | 1W        |
| 5   | 1h        | 0   | 3D        |

Monthly ships without a chord. Assign one in **Settings → Keyboard** if you want
it.

## Chart

| Chord                                     | Action                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| <kbd>⌘I</kbd>                             | Open the indicator picker                                  |
| <kbd>⌘Z</kbd>                             | Undo                                                       |
| <kbd>⇧⌘Z</kbd>                            | Redo                                                       |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Delete the selected drawing                                |
| <kbd>Esc</kbd>                            | Exit fullscreen, close the picker, or drop the active tool |

## Drawing tools

Hold <kbd>⌥</kbd> (<kbd>Alt</kbd>) and press:

| Chord         | Tool            | Chord         | Tool       |
| ------------- | --------------- | ------------- | ---------- |
| <kbd>⌥T</kbd> | Trend Line      | <kbd>⌥I</kbd> | Info Line  |
| <kbd>⌥Y</kbd> | Ray             | <kbd>⌥A</kbd> | Arrow      |
| <kbd>⌥E</kbd> | Extended Line   | <kbd>⌥X</kbd> | Text       |
| <kbd>⌥H</kbd> | Horizontal Line | <kbd>⌥R</kbd> | Rectangle  |
| <kbd>⌥V</kbd> | Vertical Line   | <kbd>⌥F</kbd> | Fibonacci  |
| <kbd>⌥C</kbd> | Cross Line      | <kbd>⌥M</kbd> | Measure    |
| <kbd>⌥L</kbd> | Long Position   | <kbd>⌥D</kbd> | Date Range |
| <kbd>⌥S</kbd> | Short Position  |               |            |

## Shipped without a chord, on purpose

**Lock terminal** and **hard lock** arrive unbound. The obvious chords belong to
the workspace menu, your browser's address bar and macOS's own screen lock, and
hard lock stops live automation, which is the wrong thing to fire by accident.
Assign either one in **Settings → Keyboard**.

## Two other keymaps

**Settings → Keyboard** offers alternatives if you are coming from somewhere
else.

**TradingView** matches their drawing chords, moves redo to <kbd>⌘Y</kbd>, and
spends the freed <kbd>⌥</kbd> letters the way TradingView does.

**Bloomberg** puts section navigation on the function keys, F2 through F11, with
F1 also opening search.

Either way, every individual shortcut is rebindable, and any command shipped
without one can be given one.

## How routing works

Chart shortcuts do not require the chart to have focus. They go to the chart
panel you last pointed at or focused, so a digit still switches the timeframe
while your cursor is over the order book.

They are suppressed while you are typing in a field, and while a dialog or menu
outside the chart is open, so pressing "1" in a search box types a 1.
