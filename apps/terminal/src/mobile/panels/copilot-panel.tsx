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
 * No context header: the design's `Co-pilot · BTC-USDT on OKX` line would
 * repeat the context bar 44px above it. What the phone does mount is a single
 * 32px strip carrying the two thread controls, because conversations are the
 * one part of the dock's chrome the phone cannot do without: the desktop rail
 * has nowhere to go on a 402px screen, so History opens it as an overlay over
 * this panel rather than a nested sheet, which vaul does not stack. Persona
 * stays a desktop control and stays read from the stored preference.
 */
import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Plus, X } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AssistantConversation } from '@/components/assistant-dock/assistant-conversation'
import {
  AssistantConversationList,
  AssistantDeleteConversationDialog,
  useDeleteConversationPrompt,
} from '@/components/assistant-dock/assistant-conversation-list'
import { useAssistantConversationsStore } from '@/stores/assistant-conversations-store'
import { track } from '@/lib/analytics-events'

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

  const [historyOpen, setHistoryOpen] = useState(false)
  const create = useAssistantConversationsStore((state) => state.create)
  const conversationCount = useAssistantConversationsStore(
    (state) => state.conversations.length,
  )
  const deletePrompt = useDeleteConversationPrompt('mobile')

  return (
    <div
      className="pl-copilot-mobile relative flex h-full min-h-0 flex-col [&_[data-slot=empty-header]]:gap-2 [&_[data-slot=empty]>p]:mt-1 [&_[data-slot=empty]>span>button]:mt-3 [&_[data-slot=empty]]:max-w-[300px] [&_[data-slot=empty]]:gap-3 [&_[data-slot=empty]]:p-0 [&_form_button]:size-10 [&_form_button]:rounded-full [&_textarea]:min-h-10"
      onKeyDownCapture={swallowEnter}
    >
      <ThreadControls
        open={historyOpen}
        onToggle={() => setHistoryOpen((was) => !was)}
        onNew={() => {
          create()
          track('assistant_conversation_action', {
            action: 'created',
            count: conversationCount + 1,
            surface: 'mobile',
          })
          setHistoryOpen(false)
        }}
      />

      <AssistantConversation />

      {/* Over the panel, not beside it. Absolute rather than a second sheet:
          the panel is already inside a vaul sheet and vaul does not stack, so
          a nested one would trap the drag handle and the keyboard with it. */}
      {historyOpen ? (
        <div className="bg-background/95 absolute inset-0 top-8 z-20 flex flex-col supports-backdrop-filter:backdrop-blur-md">
          <AssistantConversationList
            size="md"
            surface="mobile"
            onRequestDelete={deletePrompt.requestDelete}
            onNavigate={() => setHistoryOpen(false)}
          />
        </div>
      ) : null}

      <AssistantDeleteConversationDialog
        open={deletePrompt.pendingId !== null}
        target={deletePrompt.target}
        onCancel={deletePrompt.cancel}
        onConfirm={deletePrompt.confirm}
      />
    </div>
  )
})

/**
 * The 32px strip. Two controls and no title: the tab bar already says
 * Assistant, and a row that repeats it costs a line of the conversation on
 * the screen with the least of it to spare.
 */
function ThreadControls({
  open,
  onToggle,
  onNew,
}: {
  open: boolean
  onToggle: () => void
  onNew: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-8 shrink-0 items-center justify-end gap-1 px-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-7 gap-1.5 rounded-full px-2 text-[11px]"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? <X className="size-3.5" /> : <History className="size-3.5" />}
        {open
          ? t('assistantDock.conversations.close')
          : t('assistantDock.conversations.history')}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground size-7 rounded-full"
        onClick={onNew}
        aria-label={t('assistantDock.conversations.new')}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}
