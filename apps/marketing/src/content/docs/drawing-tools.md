---
title: Drawing tools
description: Why traders draw on charts at all, which five tools carry most of the weight, and the full set of 45 with their shortcuts, snapping, style memory and undo.
group: traders
parent: chart-panel
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

## Why draw on a chart

Markets have memory. A price where buyers stepped in last month tends to matter
again, because the people who missed it the first time are waiting there, and
the people who bought there are watching their entry.

Drawing is how you mark those places so you notice when price returns. A
horizontal line under a price that has bounced three times is not magic, it is a
note to yourself that says "something happened here, pay attention if we come
back".

Two ideas cover most of it:

**Support** is a price level where buying has repeatedly appeared, stopping a
fall. **Resistance** is the same thing above, where selling has repeatedly
appeared. Cross one convincingly and it often becomes the other, because the
crowd that defended it has now given up.

You do not need to believe in complicated chart patterns to get value from this.
Mark where price actually turned, and you will find out fairly quickly whether
the market agrees with you.

## Five tools worth learning first

**Horizontal Line.** Support and resistance. This is the workhorse and it will
be 80% of your drawing.

**Trend Line.** Connects a run of rising lows or falling highs. Same idea as a
horizontal level, tilted.

**Long Position / Short Position.** Drag from your entry to your target and it
shades the zone between, green where the move helps you and red where it hurts,
with the percentage labelled. Drag an edge and the numbers follow. Use this
before every trade, because it forces you to name a target and a stop before you
have any money on the line.

**Measure.** Drag across anything to get the move in price and percent, plus how
much time it took.

**Fibonacci Retracement.** Drag from a swing low to a swing high and it draws
horizontal levels at 38.2%, 50% and 61.8% of the move. Plenty of traders watch
those levels, which is a large part of why they sometimes work.

## The full catalogue

Forty-five tools in nine groups, on the toolbar down the left edge of the chart.

**Lines (9).** Trend Line, Ray, Extended Line, Info Line, Trend Angle,
Horizontal Line, Horizontal Ray, Vertical Line, Cross Line.

**Channels (3).** Parallel Channel, Pitchfork, Polyline.

**Shapes (9).** Rectangle, Rotated Rectangle, Circle, Ellipse, Triangle,
Diamond, Star, Hexagon, Arc.

**Annotations (5).** Text, Arrow, Callout, Brush, Highlighter.

**Fibonacci (5).** Retracement, Extension, Channel, Time Zone, Wedge.

**Gann (2).** Gann Fan, Gann Box.

**Patterns (5).** Triangle Pattern, ABCD, XABCD, Head and Shoulders, Elliott
Wave.

**Projection (4).** Long Position, Short Position, Forecast, Anchored VWAP.

**Measure (3).** Measure, Date Range, Price and Date Range.

## Shortcuts

Fifteen tools have a chord. Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on macOS) and
press:

| Chord            | Tool            | Chord            | Tool       |
| ---------------- | --------------- | ---------------- | ---------- |
| <kbd>Alt</kbd>+T | Trend Line      | <kbd>Alt</kbd>+I | Info Line  |
| <kbd>Alt</kbd>+Y | Ray             | <kbd>Alt</kbd>+A | Arrow      |
| <kbd>Alt</kbd>+E | Extended Line   | <kbd>Alt</kbd>+X | Text       |
| <kbd>Alt</kbd>+H | Horizontal Line | <kbd>Alt</kbd>+R | Rectangle  |
| <kbd>Alt</kbd>+V | Vertical Line   | <kbd>Alt</kbd>+F | Fibonacci  |
| <kbd>Alt</kbd>+C | Cross Line      | <kbd>Alt</kbd>+M | Measure    |
| <kbd>Alt</kbd>+L | Long Position   | <kbd>Alt</kbd>+D | Date Range |
| <kbd>Alt</kbd>+S | Short Position  |                  |            |

Editing:

| Chord                                     | Action                      |
| ----------------------------------------- | --------------------------- |
| <kbd>⌘Z</kbd>                             | Undo                        |
| <kbd>⇧⌘Z</kbd>                            | Redo                        |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Delete the selected drawing |
| <kbd>Esc</kbd>                            | Drop the active tool        |

Shortcuts go to the chart you last pointed at, so they work even when focus is
somewhere else in the app.

## Sticky and single-use tools

By default a tool is **single-use**: draw once and you are back to select and
pan. Hit the pin button for **sticky tools** and the tool stays armed, so you
can lay down six levels without going back to the toolbar between each one.

## Magnet snapping

Switch the crosshair to **magnet** and your anchors snap to the nearest open,
high, low or close. It is the difference between a support line sitting exactly
on three wicks and one sitting nearly on three wicks, which matters when you are
going to place an order against it.

## Styling

Select a drawing and a properties bar appears: colour, line width, line style.
You can also lock a drawing so it stops responding to clicks, which is what you
want once a level is final and you are drawing busily around it.

Style choices carry forward. Make one trend line a thick dashed amber and the
next comes out the same way. Each tool remembers its own defaults, so your
Fibonacci settings do not follow your trend lines.

## Clearing up

The **Clear** menu offers three scopes: drawings, indicators, or both.

Only **clear drawings** is undoable, so a mis-click costs you one
<kbd>⌘Z</kbd>. Clearing indicators is not, and you will have to add them back by
hand. Worth knowing before you reach for the wider option to tidy a busy chart.

## Persistence

Drawings are saved per pair alongside the rest of your chart state. Close the
app, come back next week, and your levels are where you left them. Local by
default, synced across devices when you are signed in, which is why a level you
drew on your phone is on your laptop.

## Custom shapes

Plugins can contribute drawing tools the built-in set does not cover. See
[Fast Financial Charts](/docs/charts).
