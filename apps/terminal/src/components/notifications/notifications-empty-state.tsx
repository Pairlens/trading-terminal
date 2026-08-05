// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the Notifications canvas shows before any rule exists.
 *
 * Same two shades as Workflows: nothing at all (explain, then hand over a
 * template) versus nothing selected (just point at the list).
 */
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'

import { StarterEmptyState } from '../starter-empty-state'
import {
  NOTIFICATION_TEMPLATES,
  TEMPLATE_MARKET,
  TEMPLATE_PAIR,
  applyNotificationTemplate,
} from './notification-templates'
import type { StarterTemplate } from '../starter-empty-state'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsEmptyState() {
  const { t } = useTranslation()
  const rules = useNotificationStore((s) => s.rules)
  const loaded = useNotificationStore((s) => s.loaded)
  const createRule = useNotificationStore((s) => s.createRule)
  const selectRule = useNotificationStore((s) => s.selectRule)
  const startEditing = useNotificationStore((s) => s.startEditing)

  // Same reason as Workflows: don't pitch the feature at a user who already
  // has rules, just because the store hasn't hydrated yet.
  if (!loaded) return <div className="flex-1" />

  if (rules.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t('notifications.builder.emptyState.pickRuleHint')}
      </div>
    )
  }

  const handlePick = (template: StarterTemplate) => {
    const full = NOTIFICATION_TEMPLATES.find((tpl) => tpl.id === template.id)
    if (full) applyNotificationTemplate(full)
  }

  const handleBlank = () => {
    const id = createRule(t('notifications.builder.emptyState.untitledRule'))
    selectRule(id)
    startEditing(id)
  }

  return (
    <StarterEmptyState
      eyebrow={t('notifications.builder.emptyState.eyebrow')}
      title={t('notifications.builder.emptyState.title')}
      description={t('notifications.builder.emptyState.description')}
      icon={Bell}
      templates={NOTIFICATION_TEMPLATES}
      onPickTemplate={handlePick}
      blankLabel={t('notifications.builder.emptyState.startBlank')}
      onCreateBlank={handleBlank}
      shelfLabel={t('notifications.builder.emptyState.startFromTemplate')}
      footnote={t('notifications.builder.emptyState.footnote', {
        pair: TEMPLATE_PAIR,
        market: TEMPLATE_MARKET,
      })}
    />
  )
}
