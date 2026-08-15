// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import { CopilotChatMessage } from './copilot-chat-message'
import { PersonaMenu } from './persona-menu'
import type { Persona } from './persona-menu'
import type { UIMessage } from 'ai'
import { usePairDisplayLabel } from '@/hooks/use-prediction-pair'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'

type CopilotChatProps = {
  messages: Array<UIMessage>
  status: string
  pairKey?: string
  persona?: Persona
  onPersonaChange?: (persona: Persona) => void
}

export function CopilotChat({
  messages,
  status,
  pairKey,
  persona,
  onPersonaChange,
}: CopilotChatProps) {
  const { t } = useTranslation()
  // The heading says what the user is looking at, not how it is routed.
  const pairLabel = usePairDisplayLabel(pairKey ?? '')
  const isStreaming = status === 'streaming' || status === 'submitted'
  const { contentRef, scrollToBottom } = useStickToBottom({
    enabled: isStreaming,
  })
  const prevLenRef = useRef(0)

  // Jump to the newest message when one is added (the user sends, or a reply
  // begins) and on first mount, so the latest is always in view. Streaming
  // growth in between is followed by the hook — but only while the user stays
  // parked at the bottom, so scrolling up to re-read is never interrupted.
  useEffect(() => {
    if (messages.length !== prevLenRef.current) {
      prevLenRef.current = messages.length
      scrollToBottom('auto')
    }
  }, [messages.length, scrollToBottom])

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AiOrb size="48px" animationDuration={25} />
        <div className="max-w-[200px] space-y-1.5">
          <p className="font-serif text-base font-medium leading-snug">
            {pairKey
              ? t('copilot.analyzePair', { pair: pairLabel })
              : t('copilot.startConversation')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('copilot.emptyStateHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
            style={{
              borderColor:
                'color-mix(in oklch, var(--magic-1) 30%, transparent)',
              background:
                'color-mix(in oklch, var(--magic-1) 10%, transparent)',
            }}
          >
            <Sparkles
              className="size-2.5"
              style={{ color: 'var(--magic-1)' }}
            />
            <span className="magic-text font-medium">
              {t('copilot.contextAware')}
            </span>
          </span>
          {persona && onPersonaChange && (
            <PersonaMenu
              persona={persona}
              onPersonaChange={onPersonaChange}
              align="center"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div ref={contentRef} className="space-y-2 p-2">
        {messages.map((msg) => (
          <CopilotChatMessage key={msg.id} message={msg} />
        ))}

        {/* Typing indicator */}
        {status === 'streaming' && (
          <div className="flex items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="flex gap-0.5">
                <span className="size-1 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                <span className="size-1 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                <span className="size-1 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
