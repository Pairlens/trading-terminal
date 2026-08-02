// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

import { PersonaMenu } from './persona-menu'
import type { Persona } from './persona-menu'

type CopilotHeaderProps = {
  persona: Persona
  onPersonaChange: (persona: Persona) => void
  onClearHistory?: () => void
  status?: string
  /** Optional "Watching …" subtitle context (pair · timeframe). */
  watching?: string
  /** Optional re-run action — renders the magic-gradient action button. */
  onRerun?: () => void
}

export function CopilotHeader({
  persona,
  onPersonaChange,
  onClearHistory,
  status,
  watching,
  onRerun,
}: CopilotHeaderProps) {
  const { t } = useTranslation()
  const isThinking = status === 'streaming'

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AiOrb
          size="28px"
          animationDuration={15}
          state={isThinking ? 'thinking' : 'idle'}
        />
        <div>
          <p className="text-sm font-medium leading-none">
            {t('copilot.aiLens')}
          </p>
          {watching && (
            <p className="text-muted-foreground mt-1 font-mono text-[10px] leading-none tracking-tight">
              {watching}
            </p>
          )}
          <div className="relative mt-0.5 h-3.5 text-[10px]">
            <AnimatePresence mode="wait">
              {isThinking ? (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0"
                >
                  <ShimmeringText
                    text={t('copilot.thinking')}
                    duration={1.5}
                    repeatDelay={0.3}
                    spread={3}
                    startOnView={false}
                    className="text-[10px]"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0"
                >
                  <span className="text-muted-foreground">
                    {t('copilot.idle')}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {onRerun && (
          <button
            type="button"
            onClick={onRerun}
            disabled={isThinking}
            title="Re-run analysis"
            className="hover-lift text-primary-foreground inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium shadow-sm disabled:pointer-events-none disabled:opacity-50"
            style={{
              background:
                'linear-gradient(120deg, var(--magic-1), var(--magic-2))',
            }}
          >
            <RefreshCw className="size-3" />
            Re-run
          </button>
        )}
        <PersonaMenu persona={persona} onPersonaChange={onPersonaChange} />
        {onClearHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
            onClick={onClearHistory}
            title={t('copilot.clearHistory')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
