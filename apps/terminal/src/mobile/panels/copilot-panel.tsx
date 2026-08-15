// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Assistant, design screen 5. The biggest reuse win in the mobile build.
 *
 * This file mounts `AssistantConversation`, the exact chat the desktop dock
 * mounts: one agentic loop, one history, one persona, the order confirm cards
 * and the `ask_user` question cards all come along. The phone gets no dock,
 * because there is no room for a floating window over a chart, so this tab IS
 * the mount. `_terminal.tsx` renders the dock only on desktop, so the two can
 * never both be live and answer the same user twice.
 *
 * It takes no props. The chart the assistant draws on is resolved through the
 * ServiceRegistry (`lib/assistant-core/chart-service.ts`), published on the
 * phone by `chart/mobile-chart-service.tsx`, because the desktop's `ChartPane`
 * is never mounted here. That indirection is what lets `addDrawing` land on the
 * live chart under the sheet rather than on a detached instance, and it is
 * still the whole reason the chart never unmounts.
 *
 * Five things are mobile's own, all of them local to this file and its CSS:
 *
 *  1. **Enter must not send.** On a phone keyboard, Return is how you write a
 *     second line; the send button is how you send. The shared composer
 *     (`CopilotInput`, which `AssistantConversation` renders) binds Enter to
 *     submit, so a capture-phase listener swallows the plain-Enter keydown
 *     before the textarea's own handler sees it. The shared component is not
 *     edited and not forked.
 *  2. **16px text in every field, pinned.** iOS Safari zooms the viewport when
 *     a focused field is under 16px, which would break the sheet's geometry on
 *     the one screen where the keyboard is guaranteed to open. The shared
 *     `Textarea` happens to be 16px below `md` today; `.pl-copilot-mobile` in
 *     mobile.css pins it there rather than depending on that, and pins it for
 *     `input` and `contenteditable` too, so the composer is free to change
 *     shape without the rule having to be rediscovered.
 *  3. **The composer rides above the keyboard.** It is the last child of the
 *     panel's own flex column, so pinning it needs no sticky positioning.
 *     `interactive-widget=resizes-content` (the viewport meta) shrinks the
 *     layout viewport, the sheet's `bottom: 0` follows the keyboard up, and the
 *     composer comes with it.
 *  4. **The signed-out gate is compact.** `AuthRequiredPrompt` is drawn for a
 *     desktop pane; in a phone's panel slice its nested `p-6`s and gaps add up
 *     to more than the visible height on a Safari viewport, and the privacy
 *     note ended up under the tab bar. Padding and gaps are collapsed from
 *     here rather than in the shared component, which desktop also renders.
 *     Widening the card also costs it a line of description.
 *  5. **One magic hairline.** The sheet paints a gradient seam along its own
 *     rounded top edge. Any seam the mounted chat paints across the top of its
 *     column lands 21px lower, the grab strip's height, and the phone shows
 *     two. `.pl-copilot-mobile` suppresses the inner one and keeps the sheet's.
 *
 * No mobile header row: the design's `Co-pilot · BTC-USDT on OKX` line would
 * repeat the context bar 44px above it, and `AssistantConversation` is a bare
 * column by design. The desktop's orb, persona and clear-history controls live
 * in the dock's window chrome, which the phone does not mount. Named as a
 * deliberate deviation rather than shipped as duplication.
 */
import { memo, useCallback } from 'react'

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AssistantConversation } from '@/components/assistant-dock/assistant-conversation'

export default memo(function MobileAssistantPanel() {
  /**
   * Capture phase, so this runs before the composer's own bubble-phase
   * handler and `stopPropagation` keeps that handler from ever firing. No
   * `preventDefault`: the newline is exactly what we want the key to do.
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
      <AssistantConversation />
    </div>
  )
})
