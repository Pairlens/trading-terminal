// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the workbench shows before the first script exists.
 *
 * Same three states as Workflows and Notifications: not hydrated yet (blank,
 * so a returning user is never pitched at), scripts exist but none is open
 * (a one-line nudge), otherwise the full panel with the starter shelf.
 *
 * Three ways in, ranked by how likely each is to produce the script the user
 * actually wants: describe it to the assistant, adapt a template, or open an
 * empty file. Two shelves under the assistant, indicator templates above the
 * deployable strategies — so a first visit still teaches that this one
 * workbench writes both kinds of script.
 */
import { useCallback, useMemo, useState } from 'react'
import { SquareFunction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StarterEmptyState } from '../starter-empty-state'
import { AssistantCta } from '../assistant/assistant-cta'
import { botTemplates, ensureBotTemplateScript } from '../bots/bot-templates'
import {
  applyIndicatorTemplate,
  indicatorTemplates,
} from './indicator-templates'
import type { StarterTemplate } from '../starter-empty-state'
import { BLANK_SCRIPT } from '@/lib/python/examples'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

export function IndicatorsEmptyState() {
  const { t } = useTranslation()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const loaded = useIndicatorScriptsStore((s) => s.loaded)
  const createScript = useIndicatorScriptsStore((s) => s.createScript)

  const templates = useMemo(() => indicatorTemplates(t), [t])
  const strategyShelf = useMemo(() => botTemplates(t), [t])
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handlePick = useCallback(
    (picked: StarterTemplate) => {
      const full = templates.find((candidate) => candidate.id === picked.id)
      if (full) applyIndicatorTemplate(full)
    },
    [templates],
  )

  /**
   * A strategy template creates and registers its script — the same call the
   * bots page makes, so the badge, the auto-run preview and the Deploy button
   * are all live the moment the workbench opens it. The registration boots
   * Pyodide, hence the pending spinner.
   */
  const handlePickStrategy = useCallback(
    (picked: StarterTemplate) => {
      const full = strategyShelf.find((candidate) => candidate.id === picked.id)
      if (!full || pendingId) return
      setPendingId(full.id)
      ensureBotTemplateScript(full)
        .catch((err: unknown) => {
          toast.error(t('botsPage.templateFailed'), {
            description: err instanceof Error ? err.message : String(err),
          })
        })
        .finally(() => setPendingId(null))
    },
    [strategyShelf, pendingId, t],
  )

  const handleBlank = useCallback(() => {
    createScript(t('indicatorsPage.blankName'), BLANK_SCRIPT)
  }, [createScript, t])

  if (!loaded) return <div className="flex-1" />

  if (scripts.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t('indicatorsPage.pickScript')}
      </div>
    )
  }

  return (
    <StarterEmptyState
      eyebrow={t('nav.indicators')}
      title={t('indicatorsPage.emptyTitle')}
      description={t('indicatorsPage.emptyDescription')}
      icon={SquareFunction}
      templates={templates}
      onPickTemplate={handlePick}
      pendingId={pendingId}
      shelfLabel={t('indicatorsPage.templatesIndicators')}
      secondaryLabel={t('indicatorsPage.templatesStrategies')}
      secondaryTemplates={strategyShelf}
      onPickSecondary={handlePickStrategy}
      blankLabel={t('indicatorsPage.startFromScratch')}
      onCreateBlank={handleBlank}
      blankTone="quiet"
      footnote={t('indicatorsPage.emptyFootnote')}
      hero={<AssistantCta surface="indicators" />}
    />
  )
}
