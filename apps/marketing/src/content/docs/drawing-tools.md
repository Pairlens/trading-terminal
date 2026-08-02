---
title: Drawing tools
description: 45 drawing tools across nine categories, with single-key shortcuts, magnet snapping, per-tool style memory, and undo that survives a reload.
group: traders
parent: chart-panel
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

The drawing toolbar runs down the left edge of the chart. Forty-five tools,
grouped into nine categories, each with a flyout so the rail stays narrow.

## The catalogue

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

Long Position and Short Position are the ones to learn first. Drag one from your
entry to your target and it shades the zone between them, green when the move is
in your favour and red when it is against, with the percentage move labelled.
Drag either edge and the number follows.

## Shortcuts

Fifteen tools have a single chord. Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on
macOS) and press:

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

And the editing chords:

| Chord                                     | Action                      |
| ----------------------------------------- | --------------------------- |
| <kbd>⌘Z</kbd>                             | Undo                        |
| <kbd>⇧⌘Z</kbd>                            | Redo                        |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Delete the selected drawing |
| <kbd>Esc</kbd>                            | Drop the active tool        |

Shortcuts are routed to the chart you last pointed at, so they work even when
focus is somewhere else in the app.

## Sticky and single-use tools

By default a tool is **single-use**: draw once and the toolbar returns to
select-and-pan. Toggle **sticky tools** with the pin button and the tool stays
armed, so you can lay down six horizontal levels without reaching for the rail
between each one.

## Magnet snapping

Switch the crosshair to **magnet** mode from the chart toolbar and drawing
anchors snap to the nearest OHLC value. It is the difference between a support
line that sits exactly on three wicks and one that sits nearly on three wicks.

## Styling

Select a drawing and the properties bar appears: colour swatches, line width,
and line style (solid, dashed, dotted). You can also lock a drawing so it stops
responding to clicks, which is what you want once a level is final and you are
drawing busily around it.

Style edits carry forward. Change a trend line to a 2px dashed amber and the
next trend line you draw comes out the same way. Each tool remembers its own
defaults.

## Clearing up

The **Clear** menu offers three scopes: clear drawings, clear indicators, or
clear both.

Only **clear drawings** is undoable. It pushes onto the same undo stack as
everything else you draw, so a mis-click costs you one <kbd>⌘Z</kbd>. Clearing
indicators, and clearing both, are not undoable: you will have to add the
indicators back. That is worth knowing before you reach for the wider option to
tidy up a busy chart.

## Persistence

Drawings are saved per pair alongside the rest of the chart state. Close the
app, reopen it next week, and your levels are still there. Locally by default,
synced across devices when you are signed in.

## Custom shapes

The chart engine takes custom drawing definitions through
`DrawingShapeDefinition`, so a plugin can contribute a tool the built-in set
does not cover. See [Fast Financial Charts](/docs/charts) for the API.
