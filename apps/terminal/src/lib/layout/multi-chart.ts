// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Give a multi-chart board a chart per instrument, instead of the same one
 * three times.
 *
 * The Dual/Triple/Quad templates bind each chart pane to its OWN variable
 * (`$chart1`, `$chart2`, …), which is what makes them independent once the
 * board is copied into a workspace: the variable bar holds a pair per chart.
 * Applied in place on a pair page there is no variables provider, so every
 * binding resolved to nothing, every pane fell through to the page's own pair,
 * and a four-chart cockpit opened as four copies of one chart.
 *
 * So on the way in, a binding no other pane shares is turned into what it
 * meant: the first such pane follows the page (open Quad Charts on SOL and the
 * lead chart is SOL, not whatever the template shipped), and the rest are
 * pinned to a pair of their own, which the chart's symbol chip then edits per
 * pane.
 *
 * A variable SEVERAL panes share is the board's own pair — a spot desk binds
 * its chart, book and ticket to one `$pair` — and is left exactly as it is.
 * Pinning that would nail a whole execution board to whatever pair the
 * template was authored with.
 */
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type {
  PaneInstance,
  TerminalLayout,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import { classFromSymbolShape } from '@/lib/market-ref/entry'

const PAIR_SLOT = 'active-pair'

export type PairValue = { pairKey: string; market: string }

function isPairValue(value: unknown): value is PairValue {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<PairValue>
  return typeof v.pairKey === 'string' && typeof v.market === 'string'
}

/** Every pane in board order, so bindings can be counted and then assigned. */
function panesOf(layout: TerminalLayout): Array<PaneInstance> {
  const out: Array<PaneInstance> = []
  for (const col of layout.columns ?? []) {
    for (const cell of col.cells ?? []) {
      for (const pane of cell.panes ?? []) out.push(pane)
    }
  }
  return out
}

/** The pane with its `active-pair` binding spent — dropped, not emptied. */
function withoutPairBinding(pane: PaneInstance): PaneInstance {
  const bindings = { ...pane.bindings }
  delete bindings[PAIR_SLOT]
  const next: PaneInstance = { ...pane }
  if (Object.keys(bindings).length > 0) next.bindings = bindings
  else delete next.bindings
  return next
}

/**
 * Materialize per-pane pair variables as pane overrides.
 *
 * `activePair` is the page's own pair and `cls` its instrument class. Both may
 * be absent, in which case the template's defaults are taken as authored.
 *
 * Pure, and returns the layout untouched whenever it has nothing to say — a
 * board with one per-pane variable is not a multi-chart board.
 */
export function materializePerPaneChartPairs(
  layout: TerminalLayout,
  variables: ReadonlyArray<WorkspaceVariableDefinition> | undefined,
  activePair: PairValue | null,
  cls?: InstrumentClass | null,
): TerminalLayout {
  if (!variables || variables.length === 0) return layout

  const counts = new Map<string, number>()
  for (const pane of panesOf(layout)) {
    const name = pane.bindings?.[PAIR_SLOT]
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const perPane = new Set(
    [...counts.entries()].filter(([, n]) => n === 1).map(([name]) => name),
  )
  if (perPane.size < 2) return layout

  // The class the page is actually on decides whether the authored defaults
  // can be used at all: BTC-USDT charted beside a Kalshi contract is not a
  // second opinion, it is a different terminal.
  const pageClass =
    cls ?? (activePair ? classFromSymbolShape(activePair.pairKey) : null)
  const usable = (value: PairValue) =>
    pageClass === null || classFromSymbolShape(value.pairKey) === pageClass

  const authored = new Map<string, PairValue>()
  const spare: Array<PairValue> = []
  for (const v of variables) {
    if (v.type !== 'pair' || !isPairValue(v.defaultValue)) continue
    if (!usable(v.defaultValue)) continue
    authored.set(v.name, v.defaultValue)
    spare.push(v.defaultValue)
  }

  // Assignment first, tree walk second: picking a pair needs to know what the
  // panes before it already took, which a nested map cannot see.
  const taken = new Set<string>()
  const assigned = new Map<string, PairValue | null>()
  let lead = true
  for (const pane of panesOf(layout)) {
    const name = pane.bindings?.[PAIR_SLOT]
    if (!name || !perPane.has(name) || assigned.has(name)) continue

    if (lead && activePair) {
      lead = false
      assigned.set(name, null)
      taken.add(activePair.pairKey)
      continue
    }
    lead = false

    const own = authored.get(name)
    const pick =
      own && !taken.has(own.pairKey)
        ? own
        : (spare.find((d) => !taken.has(d.pairKey)) ?? null)
    if (!pick) {
      assigned.set(name, activePair)
      continue
    }
    taken.add(pick.pairKey)
    assigned.set(name, {
      pairKey: pick.pairKey,
      // The venue the user is already on, not the one the template was
      // written against: a board opened from Binance should not quietly
      // half-move to OKX.
      market: activePair?.market ?? pick.market,
    })
  }

  return {
    version: 1,
    columns: (layout.columns ?? []).map((col) => ({
      ...col,
      cells: (col.cells ?? []).map((cell) => ({
        ...cell,
        panes: (cell.panes ?? []).map((pane) => {
          const name = pane.bindings?.[PAIR_SLOT]
          if (!name || !assigned.has(name)) return pane
          const pinned = assigned.get(name) ?? null
          const next = withoutPairBinding(pane)
          if (!pinned) return next
          return {
            ...next,
            overrides: { ...pane.overrides, [PAIR_SLOT]: pinned },
          }
        }),
      })),
    })),
  }
}
