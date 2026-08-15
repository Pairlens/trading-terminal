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

/** Three things worth asking for, per surface. */
const IDEA_KEYS: Record<AssistantSurface, Array<string>> = {
  indicators: [
    'assistant.starterIdeaIndicator1',
    'assistant.starterIdeaIndicator2',
    'assistant.starterIdeaIndicator3',
  ],
  bots: [
    'assistant.starterIdeaBot1',
    'assistant.starterIdeaBot2',
    'assistant.starterIdeaBot3',
  ],
  workflows: [
    'assistant.starterIdeaWorkflow1',
    'assistant.starterIdeaWorkflow2',
    'assistant.starterIdeaWorkflow3',
  ],
  notifications: [
    'assistant.starterIdeaAlert1',
    'assistant.starterIdeaAlert2',
    'assistant.starterIdeaAlert3',
  ],
}

const BODY_KEY: Record<AssistantSurface, string> = {
  indicators: 'assistant.starterBodyIndicators',
  bots: 'assistant.starterBodyBots',
  workflows: 'assistant.starterBodyWorkflows',
  notifications: 'assistant.starterBodyNotifications',
}

const PLACEHOLDER_KEY: Record<AssistantSurface, string> = {
  indicators: 'assistant.starterPlaceholderIndicators',
  bots: 'assistant.starterPlaceholderBots',
  workflows: 'assistant.starterPlaceholderWorkflows',
  notifications: 'assistant.starterPlaceholderNotifications',
}

export function AssistantStarter({
  surface,
  onStarted,
}: {
  surface: AssistantSurface
  /**
   * Open the rail — the conversation continues there, not here. Optional
   * because queueing the request already wakes it: every page hosting the
   * rail listens for an intent aimed at its surface. Pass it where the host
   * has the state to hand anyway.
   */
  onStarted?: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  const start = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      requestAssistant(surface, { prompt: trimmed })
      setValue('')
      onStarted?.()
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

  const ideas = IDEA_KEYS[surface].map((key) => t(key))

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
            {t(BODY_KEY[surface])}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-1.5">
        <Textarea
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(PLACEHOLDER_KEY[surface])}
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
