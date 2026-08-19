// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where a pane puts the one number that belongs beside its name.
 *
 * The board's pane header is a single 20px row: title, then a spacer, then a
 * trailing metric, then the grip. The metric is the pane's — the book's tick
 * size, the tape's print count, the chart's venue and timeframe — so the
 * header offers a slot instead of guessing, and a pane that used to draw its
 * own strip of chrome for that one value now has somewhere to put it.
 *
 * It is a DOM portal, not a piece of state on the wrapper. A pane may put a
 * streaming value in here (spread, last print), and a `setHeaderNode` callback
 * would re-render the whole pane subtree on every tick to move a label. With
 * a portal, the node stays inside the pane's own render tree and the wrapper
 * never hears about it.
 */
import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

const PaneHeaderSlotContext = createContext<HTMLElement | null>(null)

export const PaneHeaderSlotProvider = PaneHeaderSlotContext.Provider

/**
 * Render `children` into this pane's header, right of the spacer.
 *
 * A tabbed cell lends its own row to whichever pane is on top, so stacking a
 * pane as a tab does not lose its metric. A compact pane (the risk strip) has
 * no header at all and this renders nothing: falling back to drawing it inline
 * would give one pane two different layouts depending on where it was dropped.
 */
export function PaneHeaderSlot({ children }: { children: ReactNode }) {
  const el = useContext(PaneHeaderSlotContext)
  if (!el) return null
  return createPortal(children, el)
}

/** The metric's own type style: 10px mono, muted, never competing with the title. */
export function PaneHeaderMetric({ children }: { children: ReactNode }) {
  return (
    <PaneHeaderSlot>
      <span className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
        {children}
      </span>
    </PaneHeaderSlot>
  )
}
