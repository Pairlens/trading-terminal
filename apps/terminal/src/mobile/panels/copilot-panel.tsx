// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Co-pilot — design screen 5. The biggest reuse win in the mobile build.
 *
 * This file mounts the desktop `CopilotPanel` unchanged: the agentic loop, the
 * ~60 tools, order confirm cards, billing gates and history all come along, and
 * the `chartRef` it receives is the live chart under the sheet — which is what
 * makes the copilot's `addDrawing` commands land on the chart the user is
 * looking at rather than on a detached instance. That is the whole reason the
 * chart never unmounts.
 *
 * Three things are mobile's own, all of them local to this file:
 *
 *  1. **Enter must not send.** On a phone keyboard, Return is how you write a
 *     second line; the send button is how you send. The desktop composer binds
 *     Enter to submit, so a capture-phase listener swallows the plain-Enter
 *     keydown before the textarea's own handler sees it. The desktop component
 *     is not edited and not forked.
 *  2. **16px text in every field, pinned.** iOS Safari zooms the viewport when
 *     a focused field is under 16px, which would break the sheet's geometry on
 *     the one screen where the keyboard is guaranteed to open. The shared
 *     `Textarea` happens to be 16px below `md` today; `.pl-copilot-mobile` in
 *     mobile.css pins it there rather than depending on that, and pins it for
 *     `input` and `contenteditable` too — the composer is free to change shape
 *     without the rule having to be rediscovered.
 *  3. **The composer rides above the keyboard.** It is the last child of the
 *     panel's own flex column, so pinning it needs no sticky positioning —
 *     `interactive-widget=resizes-content` (the viewport meta) shrinks the
 *     layout viewport, the sheet's `bottom: 0` follows the keyboard up, and the
 *     composer comes with it.
 *  4. **The signed-out gate is compact.** `AuthRequiredPrompt` is drawn for a
 *     desktop pane; in a phone's panel slice its nested `p-6`s and gaps add up
 *     to more than the visible height on a Safari viewport, and the privacy
 *     note ended up under the tab bar. Padding and gaps are collapsed from
 *     here rather than in the shared component, which desktop also renders.
 *     Widening the card also costs it a line of description.
 *  5. **One magic hairline.** The desktop panel paints its own gradient seam
 *     across the top of its column; inside the sheet that lands 21px under the
 *     sheet's own, and the phone showed two. `.pl-copilot-mobile` suppresses
 *     the inner one — see the rule in mobile.css for why the sheet's is the
 *     one that survives.
 *
 * No mobile header row: the design's `Co-pilot · BTC-USDT on OKX` line would
 * repeat the context bar 44px above it AND stack a second orb over the panel's
 * own header (orb, persona, clear history), which is the design's header in
 * function. Named as a deliberate deviation rather than shipped as duplication.
 */
import { memo, useCallback, useMemo } from 'react'

import { useMobileFocus } from '../mobile-focus-context'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { FastFinancialChartRef } from '@pairlens/fast-financial-charts/types'
import { CopilotPanel } from '@/components/copilot/copilot-panel'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

/** The panel's props require a ref object; the chart may not be ready yet. */
const NULL_CHART_REF: React.RefObject<FastFinancialChartRef | null> = {
  current: null,
}

export default memo(function MobileCopilotPanel() {
  const { focusedPair } = useMobileFocus()
  const chartConfig = useChartConfig()
  const chartActions = useChartActions()
  const { market, timeframe, chartRef } = chartConfig

  const indicatorActions = useMemo(
    () => ({
      add: chartActions.addIndicator,
      remove: chartActions.removeIndicator,
      removeAll: chartActions.removeAllIndicators,
    }),
    [
      chartActions.addIndicator,
      chartActions.removeIndicator,
      chartActions.removeAllIndicators,
    ],
  )

  /**
   * Capture phase, so this runs before the composer's own bubble-phase
   * handler and `stopPropagation` keeps that handler from ever firing. No
   * `preventDefault` — the newline is exactly what we want the key to do.
   * Shift+Enter and an IME's composition Enter are left alone, matching the
   * desktop semantics for everything except the plain key.
   */
  const swallowEnter = useCallback((event: ReactKeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    const target = event.target as HTMLElement | null
    if (target?.tagName !== 'TEXTAREA') return
    event.stopPropagation()
  }, [])

  return (
    <div
      className="pl-copilot-mobile flex h-full min-h-0 flex-col [&_[data-slot=empty-header]]:gap-2 [&_[data-slot=empty]>p]:mt-1 [&_[data-slot=empty]>span>button]:mt-3 [&_[data-slot=empty]]:max-w-[300px] [&_[data-slot=empty]]:gap-3 [&_[data-slot=empty]]:p-0 [&_form_button]:size-10 [&_form_button]:rounded-full [&_textarea]:min-h-10"
      onKeyDownCapture={swallowEnter}
    >
      <CopilotPanel
        chartActions={chartActions}
        chartRef={chartRef ?? NULL_CHART_REF}
        indicatorActions={indicatorActions}
        market={market}
        pairKey={focusedPair}
        timeframe={timeframe}
      />
    </div>
  )
})
