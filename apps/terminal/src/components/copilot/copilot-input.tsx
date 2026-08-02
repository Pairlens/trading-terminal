// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { SendHorizontal, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import type { FormEvent } from 'react'

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
}

export function CopilotInput({
  onSend,
  status,
  onStop,
  quickActions,
}: CopilotInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const drag = useDragScroll()
  const inputRef = useRef<HTMLInputElement>(null)
  const userEngagedRef = useRef(false)
  const isReady = status === 'ready'
  const isStreaming = status === 'streaming'

  useEffect(() => {
    if (isReady && userEngagedRef.current) inputRef.current?.focus()
  }, [isReady])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || !isReady) return
    onSend(trimmed)
    setValue('')
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
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            userEngagedRef.current = true
          }}
          placeholder={t('copilot.placeholder')}
          disabled={!isReady}
          className="flex-1"
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
