// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { SendHorizontal, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Textarea } from '@pairlens/ui/components/ui/textarea'
import type { FormEvent, KeyboardEvent } from 'react'

/** Composer growth ceiling — past this it scrolls instead of eating the chat. */
const MAX_COMPOSER_HEIGHT = 128

function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)
  const moved = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    dragging.current = true
    moved.current = false
    startX.current = e.clientX
    scrollLeft.current = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !ref.current) return
    const dx = e.clientX - startX.current
    if (Math.abs(dx) > 3) moved.current = true
    ref.current.scrollLeft = scrollLeft.current - dx
  }, [])

  const onMouseUp = useCallback(() => {
    if (!ref.current) return
    dragging.current = false
    ref.current.style.cursor = ''
    ref.current.style.userSelect = ''
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      e.stopPropagation()
      e.preventDefault()
    }
  }, [])

  return {
    ref,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
    onClickCapture,
  }
}

type CopilotInputProps = {
  onSend: (message: string) => void
  status: string
  onStop: () => void
  quickActions: Array<string>
  /** Composer placeholder — other hosts (the builder assistant) pass their own. */
  placeholder?: string
  /**
   * Bump to put the cursor in the composer. A counter rather than a boolean so
   * the same request twice still focuses twice (the assistant's "Build with
   * AI" entry points, when the rail is already open).
   */
  focusSignal?: number
  /**
   * Text to drop into the composer for the user to edit before sending,
   * applied whenever `seedSignal` changes. This is the half of
   * `askAssistant` that does NOT send: a "Build with AI" button that
   * opens the chat with the request already typed.
   */
  seedText?: string
  seedSignal?: number
}

export function CopilotInput({
  onSend,
  status,
  onStop,
  quickActions,
  placeholder,
  focusSignal = 0,
  seedText,
  seedSignal = 0,
}: CopilotInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const drag = useDragScroll()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const userEngagedRef = useRef(false)
  const isReady = status === 'ready'
  const isStreaming = status === 'streaming'

  useEffect(() => {
    if (isReady && userEngagedRef.current) inputRef.current?.focus()
  }, [isReady])

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  useEffect(() => {
    if (seedSignal <= 0 || !seedText) return
    setValue(seedText)
    const field = inputRef.current
    if (!field) return
    field.focus()
    // Caret at the end, not selecting the seed: the point is to let the
    // user add to it, and a selection would delete it on the next key.
    field.setSelectionRange(seedText.length, seedText.length)
  }, [seedSignal, seedText])

  // Grow the composer with its content so a long message wraps into a block
  // instead of scrolling away on one endless line. Measured rather than left to
  // `field-sizing: content`, which older WebKit (so older desktop builds) lacks.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight is content + padding; borders sit outside it under
    // border-box, and omitting them would leave the box 2px short of its text.
    const borders = el.offsetHeight - el.clientHeight
    el.style.height = `${Math.min(el.scrollHeight + borders, MAX_COMPOSER_HEIGHT)}px`
  }, [value])

  const submit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || !isReady) return
    onSend(trimmed)
    setValue('')
  }, [value, isReady, onSend])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line. `isComposing` lets an IME
    // (ja/ko/zh) accept its candidate with Enter without firing the message.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    submit()
  }

  return (
    <div className="border-border/60 space-y-2 border-t p-3">
      {/* Quick action chips -- horizontal scroll with edge fades */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-background to-transparent" />
        <div
          ref={drag.ref}
          onMouseDown={drag.onMouseDown}
          onMouseMove={drag.onMouseMove}
          onMouseUp={drag.onMouseUp}
          onMouseLeave={drag.onMouseLeave}
          onClickCapture={drag.onClickCapture}
          className="no-scrollbar flex cursor-grab gap-1 overflow-x-auto px-1"
        >
          {quickActions.map((action) => (
            <Button
              key={action}
              variant="outline"
              size="sm"
              className="h-6 shrink-0 rounded-full px-2.5 text-[11px]"
              onClick={() => onSend(action)}
              disabled={!isReady}
            >
              {action}
            </Button>
          ))}
        </div>
      </div>

      {/* Input + send/stop */}
      <form onSubmit={handleSubmit} className="flex items-end gap-1.5">
        <Textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            userEngagedRef.current = true
          }}
          placeholder={placeholder ?? t('copilot.placeholder')}
          disabled={!isReady}
          className="field-sizing-fixed min-h-8 flex-1 resize-none overflow-y-auto px-2.5 py-1 leading-5"
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            variant="ghost"
            disabled={!isReady || !value.trim()}
            className="hover-lift text-primary-foreground shrink-0 shadow-sm hover:text-primary-foreground disabled:opacity-40 disabled:shadow-none"
            style={{
              background:
                'linear-gradient(120deg, var(--magic-1), var(--magic-3))',
            }}
          >
            <SendHorizontal className="size-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
