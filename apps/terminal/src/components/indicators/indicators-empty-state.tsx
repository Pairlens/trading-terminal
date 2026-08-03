// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the workbench shows before the first script exists.
 *
 * Same three states as Workflows and Notifications: not hydrated yet (blank,
 * so a returning user is never pitched at), scripts exist but none is open
 * (a one-line nudge), otherwise the full panel with the starter shelf.
 */
import { useCallback, useMemo } from 'react'
import { SquareFunction } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StarterEmptyState } from '../starter-empty-state'
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

  const handlePick = useCallback(
    (picked: StarterTemplate) => {
      const full = templates.find((candidate) => candidate.id === picked.id)
      if (full) applyIndicatorTemplate(full)
    },
    [templates],
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
      shelfLabel={t('indicatorsPage.startFromTemplate')}
      blankLabel={t('indicatorsPage.startFromScratch')}
      onCreateBlank={handleBlank}
      footnote={t('indicatorsPage.emptyFootnote')}
    />
  )
}
