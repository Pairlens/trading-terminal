---
title: The MCP tool surface
description: 52 deterministic tools that let an AI agent drive a Fast Financial Chart the way a user does, with a generated schema and runtime validation.
group: builders
parent: charts
order: 1
eyebrow: For builders
updated: 15 AUG 2026
readTime: 4 min read
---

`@pairlens/fast-financial-charts` ships an MCP-compatible tools layer: a machine-readable
schema plus an executor, so a model can add indicators, draw, navigate, read
data back, and take screenshots without you writing a per-action bridge.

This is the same surface the Pairlens assistant uses, which is why "draw the
levels you would trade this off" produces drawings that persist on the user's
chart rather than a description of drawings.

## Wiring it up

```ts
import { createChartMcpAdapter } from '@pairlens/fast-financial-charts/mcp'

const mcp = createChartMcpAdapter(chartRef.current)

// Hand this to your agent framework as the tool list.
const schema = mcp.getSchema()

await mcp.execute('addIndicator', {
  type: 'RSI',
  seriesId: 'BTC-USD',
  params: { period: 14 },
})
```

`getSchema()` returns JSON Schema tool definitions. `execute(name, args)` runs
one and returns its result. Payloads are validated at runtime, so a malformed
call is rejected rather than half-applied. Determinism is the point: the same
call with the same arguments produces the same chart state.

The React binding `useFastChartMcp` gives you the same adapter from a hook.

## The 52 tools

**Indicators (4).** `addIndicator`, `updateIndicator`, `removeIndicator`,
`removeAllIndicators`

**Drawings (4).** `addDrawing`, `updateDrawing`, `removeDrawing`,
`clearDrawings`

**View (7).** `setViewport`, `scrollToLatest`, `scrollToPosition`,
`fitContent`, `setCompareMode`, `setChartType`, `setPriceScaleMode`

**Data mutation (5).** `applyTick`, `applyTicks`, `appendBar`,
`replaceSeries`, `popBars`

**Data read-back (4).** `getData` (with `limit` and `offset` pagination),
`getDataByIndex`, `getSeriesOrder`, `setSeriesOrder`

**Coordinate conversion (4).** `priceToCoordinate`, `coordinateToPrice`,
`timeToCoordinate`, `coordinateToTime`

**Pane management (5).** `addPane`, `removePane`, `swapPanes`, `updatePane`,
`getPaneLayout`

**Series primitives (3).** `addPrimitive`, `removePrimitive`,
`listPrimitives`

**Custom series (4).** `addCustomSeries`, `removeCustomSeries`,
`updateCustomSeriesData`, `listCustomSeries`

**Theme (1).** `setTheme`, applying a partial theme at runtime

**History (2).** `undo`, `redo`

**Agent operations (9).** `getChartState`, `getVisibleData`,
`getIndicatorValue`, `getDrawingState`, `getCapabilities`, `subscribeEvents`,
`unsubscribeEvents`, `screenshot`, `takeScreenshot` (with `includeCrosshair`
and `includeOverlays`)

## Reading before writing

`getCapabilities` is the tool to call first in an unfamiliar deployment. It
reports what this chart instance actually supports, so an agent can degrade
rather than guess.

`getVisibleData` returns what the user can currently see, which is usually what
you want an agent reasoning about, rather than the full series. `getData`
paginates with `limit` and `offset` precisely so a large history does not get
cloned into a prompt.

## Event subscriptions

For reactive workflows, subscribe rather than poll:

```ts
await mcp.execute('subscribeEvents', {
  events: [
    'indicatorsChange',
    'indicatorComputeComplete',
    'drawingsChange',
    'stateChange',
  ],
})
```

`indicatorComputeComplete` fires after each indicator finishes computing, which
is the signal that values are ready to query. Without it, an agent that adds an
RSI and immediately calls `getIndicatorValue` reads an empty array and
concludes something is broken.

Unsubscribe with `unsubscribeEvents` when the agent's turn ends.

## Screenshots for vision models

`screenshot` and `takeScreenshot` return the rendered chart as an image, with
options to include or exclude the crosshair and overlays. Handing a vision
model the actual pixels alongside the numeric state is often the difference
between a correct read of a pattern and a confident wrong one.

## Notes

- The tool surface is in `@pairlens/fast-financial-charts/mcp`, which has no React dependency.
- Tool names are stable across minor versions. New tools are additive.
- Full argument shapes live in
  [the README](https://github.com/Pairlens/fast-financial-charts#ai--mcp-integration).
- This surface controls a chart. For the ways an agent can reach market data,
  the portfolio, or an order, see [agent interfaces](/docs/agent-interfaces).
