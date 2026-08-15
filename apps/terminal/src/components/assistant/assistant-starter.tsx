// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The first thing an empty Indicators or Bots page offers: say what you want,
 * and the assistant builds it.
 *
 * It is a composer, not a button, because the gap between "Build with AI" and
 * a useful first message is exactly the gap most people stall in. Typing here
 * costs nothing extra — the request is queued for the surface's assistant and
 * the rail takes it from there, so this box never owns a conversation. It
 * collects one sentence and hands it over.
 *
 * Ranked above the template shelf deliberately: templates teach the shape of a
 * script, but the assistant writes the one the user actually asked for.
 */
import { useCallback, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { Textarea } from '@pairlens/ui/components/ui/textarea'

import type { FormEvent, KeyboardEvent } from 'react'
import type { AssistantSurface } from '@/lib/assistant/assistant-tools'
import { requestAssistant } from '@/lib/assistant/assistant-chat-cache'

export function AssistantStarter({
  surface,
  onStarted,
}: {
  surface: AssistantSurface
  /** Open the rail — the conversation continues there, not here. */
  onStarted: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  const start = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      requestAssistant(surface, { prompt: trimmed })
      setValue('')
      onStarted()
    },
    [surface, onStarted],
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    start(value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return
    event.preventDefault()
    start(value)
  }

  const ideas =
    surface === 'indicators'
      ? [
          t('assistant.starterIdeaIndicator1'),
          t('assistant.starterIdeaIndicator2'),
          t('assistant.starterIdeaIndicator3'),
        ]
      : [
          t('assistant.starterIdeaBot1'),
          t('assistant.starterIdeaBot2'),
          t('assistant.starterIdeaBot3'),
        ]

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-primary/25 bg-card/60 p-4 backdrop-blur-sm">
      <div className="magic-gradient pointer-events-none absolute inset-x-0 top-0 h-[2px]" />

      <div className="flex items-start gap-3">
        <AiOrb size="34px" animationDuration={25} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-[15px] font-semibold leading-tight">
              {t('assistant.starterTitle')}
            </h3>
            <span
              className="rounded-full border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide"
              style={{
                borderColor:
                  'color-mix(in oklch, var(--magic-1) 40%, transparent)',
                color: 'var(--magic-1)',
              }}
            >
              {t('assistant.recommended')}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
            {surface === 'indicators'
              ? t('assistant.starterBodyIndicators')
              : t('assistant.starterBodyBots')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-1.5">
        <Textarea
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            surface === 'indicators'
              ? t('assistant.starterPlaceholderIndicators')
              : t('assistant.starterPlaceholderBots')
          }
          className="min-h-[52px] flex-1 resize-none text-[13px]"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim()}
          aria-label={t('assistant.starterSend')}
          className="hover-lift text-primary-foreground shrink-0 shadow-sm hover:text-primary-foreground disabled:opacity-40 disabled:shadow-none"
          style={{
            background:
              'linear-gradient(120deg, var(--magic-1), var(--magic-3))',
          }}
        >
          <SendHorizontal className="size-4" />
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ideas.map((idea) => (
          <Button
            key={idea}
            variant="outline"
            size="sm"
            className="h-6 rounded-full px-2.5 text-[11px] font-normal"
            onClick={() => start(idea)}
          >
            {idea}
          </Button>
        ))}
      </div>
    </div>
  )
}
