---
title: Keyboard shortcuts
description: Every keyboard shortcut in the Pairlens trading terminal, from timeframe digits to drawing tools to window management, on macOS, Windows, and Linux.
group: reference
order: 3
eyebrow: Reference
updated: 15 AUG 2026
readTime: 2 min read
---

macOS uses <kbd>⌘</kbd> and <kbd>⌥</kbd>. Windows and Linux use
<kbd>Ctrl</kbd> and <kbd>Alt</kbd>.

## Global

| Chord         | Action               |
| ------------- | -------------------- |
| <kbd>⌘K</kbd> | Open omni-search     |
| <kbd>⌘J</kbd> | Open the assistant   |
| <kbd>⌘,</kbd> | Open settings        |
| <kbd>⌘N</kbd> | New window (desktop) |
| <kbd>⌘[</kbd> | Back                 |
| <kbd>⌘]</kbd> | Forward              |

## Timeframes

Press a digit and the active chart switches.

| Key | Timeframe | Key | Timeframe |
| --- | --------- | --- | --------- |
| 1   | 1m        | 6   | 2h        |
| 2   | 5m        | 7   | 4h        |
| 3   | 15m       | 8   | 1D        |
| 4   | 30m       | 9   | 1W        |
| 5   | 1h        | 0   | 3D        |

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

## How routing works

Chart shortcuts do not require the chart to have focus. They are routed to the
chart pane you last pointed at or focused, so a digit still switches the
timeframe when your cursor is over the order book.

They are suppressed while you are typing in a field, and while a dialog or menu
outside the chart is open, so pressing "1" in a search box types a 1.
