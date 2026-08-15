// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The line beside the orb ──────────────────────────────────────────
//
// One hook for both placements, because the rule is the same in each:
// while a run is going the orb reports what it is doing, and the rest
// of the time it offers the most relevant thing to ask for here. Only
// where the line is drawn differs, and that is the caller's business.

import { useTranslation } from 'react-i18next'

import { useAssistantSurfaces } from './surface-registry'
import { useAssistantStore } from '@/stores/assistant-store'

export type AssistantOrbLabel = {
  label: string
  busy: boolean
}

export function useAssistantOrbLabel(): AssistantOrbLabel {
  const { t } = useTranslation()
  // Re-renders when a surface mounts, unmounts or bumps its revision,
  // which is exactly when the suggestion can change.
  const registry = useAssistantSurfaces()
  const phase = useAssistantStore((state) => state.runPhase)

  if (phase !== 'idle') {
    return {
      busy: true,
      label:
        phase === 'search'
          ? t('assistantDock.statusSearching')
          : phase === 'tool'
            ? t('assistantDock.statusUsingTools')
            : t('assistantDock.statusThinking'),
    }
  }

  const suggestion = registry.getSuggestion()
  return {
    busy: false,
    label: suggestion
      ? t(suggestion.key, suggestion.values)
      : t('assistantDock.defaultSuggestion'),
  }
}
