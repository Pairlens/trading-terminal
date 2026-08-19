// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The composer ─────────────────────────────────────────────────────
//
// One capsule: the field and the send control share a rounded box that
// takes the magic ring on focus. The chips that used to sit above it now
// live on the empty screen instead — they were only ever shown on an
// empty thread, and a row of 6px-tall pills stapled to the top of the
// composer read as chrome rather than as an invitation.
//
// It never locks. A turn can run 28 steps and take minutes, and the field
// used to be disabled for every one of them, so a user who thought of a
// correction halfway through could not even write it down. Now the text
// is always typeable and a message sent mid-run is handed to the host to
// queue; only the send BUTTON changes, into a stop control.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Textarea } from '@pairlens/ui/components/ui/textarea'
import type { FormEvent, KeyboardEvent } from 'react'

/** Composer growth ceiling — past this it scrolls instead of eating the chat. */
const MAX_COMPOSER_HEIGHT = 132

type CopilotInputProps = {
  /** The host decides whether this sends now or queues — see `queued`. */
  onSend: (message: string) => void
  status: string
  onStop: () => void
  /** A message already waiting for the current run to finish. */
  queued?: boolean
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
  queued = false,
  placeholder,
  focusSignal = 0,
  seedText,
  seedSignal = 0,
}: CopilotInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
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
    // One queued message, not a backlog: the second one would be answered
    // with context the user wrote three minutes and one answer ago.
    if (!trimmed || queued) return
    onSend(trimmed)
    setValue('')
  }, [value, queued, onSend])

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
    <div className="shrink-0 p-3 pt-1.5">
      <form
        onSubmit={handleSubmit}
        className="ai-field flex items-end gap-1.5 rounded-[10px] p-1.5"
      >
        <Textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            userEngagedRef.current = true
          }}
          placeholder={
            queued
              ? t('copilot.queuedHint')
              : (placeholder ?? t('copilot.placeholder'))
          }
          disabled={queued}
          // The capsule owns the border, the fill and the focus ring, so the
          // field itself is stripped back to type on a transparent ground.
          className="field-sizing-fixed min-h-8 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-[13px] leading-5 shadow-none focus-visible:border-0 focus-visible:ring-0 disabled:bg-transparent md:text-[13px] dark:bg-transparent dark:disabled:bg-transparent"
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onStop}
            aria-label={t('copilot.stop')}
            className="text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-[8px]"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            variant="ghost"
            disabled={queued || !value.trim()}
            aria-label={t('copilot.send')}
            className="hover-lift text-primary-foreground hover:text-primary-foreground size-8 shrink-0 rounded-[8px] shadow-sm disabled:opacity-30 disabled:shadow-none"
            style={{
              background:
                'linear-gradient(120deg, var(--magic-1), var(--magic-3))',
            }}
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
