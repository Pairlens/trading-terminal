// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Window-level router for chart-pane keyboard shortcuts.
 *
 * Chart shortcuts (⌘I, ⌘Z, ⌥+tool, timeframe digits…) used to be bound as a
 * container `onKeyDown`, which made them dead whenever DOM focus sat outside
 * the pane (top bar, sidebar, another panel) until the user clicked the chart.
 * This module keeps a registry of mounted chart panes and routes a single
 * window keydown listener to the pane that should own the event:
 *
 *   1. the pane containing the event target (typing "inside" a pane wins)
 *   2. otherwise the active pane (last pointer-down / focus-in)
 *   3. otherwise the most recently mounted pane
 *
 * Events are never routed when they originate from editable elements or from
 * an open overlay (dialog, menu, listbox…) that lives outside every pane —
 * those own their keyboard interaction.
 */

type PaneEntry = {
  container: HTMLElement
  handler: (e: KeyboardEvent) => void
}

const panes: Array<PaneEntry> = []
let activePane: PaneEntry | null = null

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const OVERLAY_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="combobox"]'

function onWindowKeyDown(e: KeyboardEvent) {
  // Something upstream (dialog Escape, omni-search, native menu…) claimed it.
  if (e.defaultPrevented) return

  const target = e.target
  if (!(target instanceof HTMLElement)) return
  if (INPUT_TAGS.has(target.tagName) || target.isContentEditable) return

  let owner = panes.find((p) => p.container.contains(target))
  if (!owner) {
    // Keys aimed at an open overlay must not leak into a background chart
    // (e.g. pressing "1" in the add-pane dialog switching the timeframe).
    if (target.closest(OVERLAY_SELECTOR)) return
    owner = activePane ?? panes[panes.length - 1]
  }
  owner?.handler(e)
}

/**
 * Register a chart pane with the shortcut router. The pane becomes "active"
 * on mount and whenever the user points or focuses into it; global chart
 * chords are delivered to the active pane no matter where DOM focus sits.
 */
export function useChartPaneShortcuts(
  containerRef: RefObject<HTMLElement | null>,
  handler: (e: KeyboardEvent) => void,
) {
  // Keep the entry stable across re-renders so a pane re-rendering doesn't
  // re-register (and thereby steal the "active" slot from another pane).
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const entry: PaneEntry = {
      container,
      handler: (e) => handlerRef.current(e),
    }
    panes.push(entry)
    activePane = entry
    if (panes.length === 1) {
      window.addEventListener('keydown', onWindowKeyDown)
    }

    const markActive = () => {
      activePane = entry
    }
    container.addEventListener('pointerdown', markActive)
    container.addEventListener('focusin', markActive)

    return () => {
      container.removeEventListener('pointerdown', markActive)
      container.removeEventListener('focusin', markActive)
      const index = panes.indexOf(entry)
      if (index !== -1) panes.splice(index, 1)
      if (activePane === entry) {
        activePane = panes[panes.length - 1] ?? null
      }
      if (panes.length === 0) {
        window.removeEventListener('keydown', onWindowKeyDown)
      }
    }
  }, [containerRef])
}
