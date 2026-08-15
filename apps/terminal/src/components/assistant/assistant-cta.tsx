// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The way into the assistant from a section that has nothing in it yet.
 *
 * Ranked above the template shelf deliberately: templates teach the shape of
 * a thing, but the assistant builds the one the user actually asked for.
 *
 * It seeds a prompt rather than owning a composer. There is one assistant
 * now and it lives in the dock above the routed content, so this card's whole
 * job is to open it with something useful already typed. The idea chips send
 * outright, because a chip is already a complete request.
 */
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'

import type { AssistantSurface } from '@/lib/assistant/assistant-tools'
import { askAssistant } from '@/stores/assistant-store'

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

/** Dropped into the composer for the user to edit, not sent. */
const SEED_KEY: Record<AssistantSurface, string> = {
  indicators: 'assistantDock.suggest.indicators',
  bots: 'assistantDock.suggest.bots',
  workflows: 'assistantDock.suggest.workflows',
  notifications: 'assistantDock.suggest.notifications',
}

export function AssistantCta({ surface }: { surface: AssistantSurface }) {
  const { t } = useTranslation()
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className="hover-lift text-primary-foreground h-7 gap-1.5 text-[12px] shadow-sm hover:text-primary-foreground"
          style={{
            background:
              'linear-gradient(120deg, var(--magic-1), var(--magic-3))',
          }}
          onClick={() => askAssistant(t(SEED_KEY[surface]), { send: false })}
        >
          <Sparkles className="size-3.5" />
          {t('assistant.buildWithAi')}
        </Button>
        {ideas.map((idea) => (
          <Button
            key={idea}
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2.5 text-[11px] font-normal"
            onClick={() => askAssistant(idea, { send: true })}
          >
            {idea}
          </Button>
        ))}
      </div>
    </div>
  )
}
