// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the Notifications page shows before any rule exists.
 *
 * Ranked, not listed: the two alerts most people came for sit on the top
 * shelf and open a two-field dialog, and the flow templates — the ones that
 * need conditions, or an event with no simple form — sit under them. A user
 * who only ever wants "tell me when BTC hits 100k" never has to learn what
 * a step is; a user who wants more finds the canvas one shelf down.
 *
 * Same two shades as Workflows: nothing at all (explain, then hand over
 * something to click) versus nothing selected (just point at the list).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Percent } from 'lucide-react'

import { StarterEmptyState } from '../starter-empty-state'
import { NewAlertDialog } from './new-alert-dialog'
import {
  NOTIFICATION_TEMPLATES,
  TEMPLATE_MARKET,
  TEMPLATE_PAIR,
  applyNotificationTemplate,
  notificationTemplateChips,
} from './notification-templates'
import type { SimpleAlertKind } from '@pairlens/notification-engine/simple-alerts'
import type { StarterTemplate } from '../starter-empty-state'
import { useNotificationStore } from '@/stores/notification-store'

/** The two cards on the top shelf, keyed by the spec they open the dialog on. */
const ALERT_CARD_ICONS: Record<SimpleAlertKind, typeof Bell> = {
  'price-level': Bell,
  'percent-move': Percent,
}

export function NotificationsEmptyState() {
  const { t } = useTranslation()
  const rules = useNotificationStore((s) => s.rules)
  const loaded = useNotificationStore((s) => s.loaded)
  const createRule = useNotificationStore((s) => s.createRule)
  const selectRule = useNotificationStore((s) => s.selectRule)
  const startEditing = useNotificationStore((s) => s.startEditing)
  const [alertKind, setAlertKind] = useState<SimpleAlertKind | null>(null)

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

  const alertCards: Array<StarterTemplate> = (
    ['price-level', 'percent-move'] as const
  ).map((kind) => ({
    id: kind,
    title: t(`notifications.simple.card.${kind}.title`),
    description: t(`notifications.simple.card.${kind}.description`),
    icon: ALERT_CARD_ICONS[kind],
    chips: [
      t(`notifications.simple.card.${kind}.chips.0`),
      t(`notifications.simple.card.${kind}.chips.1`),
    ],
  }))

  const flowTemplates = NOTIFICATION_TEMPLATES.map((template) => ({
    ...template,
    title: t(`notifications.templates.${template.id}.title`, {
      defaultValue: template.title,
    }),
    description: t(`notifications.templates.${template.id}.description`, {
      defaultValue: template.description,
    }),
    chips: notificationTemplateChips(t, template),
  }))

  const handlePickFlow = (template: StarterTemplate) => {
    const full = NOTIFICATION_TEMPLATES.find((tpl) => tpl.id === template.id)
    if (full) applyNotificationTemplate(full)
  }

  const handleBlank = () => {
    const id = createRule(t('notifications.builder.emptyState.untitledRule'))
    selectRule(id)
    startEditing(id)
  }

  return (
    <>
      <StarterEmptyState
        eyebrow={t('notifications.builder.emptyState.eyebrow')}
        title={t('notifications.builder.emptyState.title')}
        description={t('notifications.builder.emptyState.description')}
        icon={Bell}
        templates={alertCards}
        // Both cards open the same dialog, on the kind that was clicked —
        // and a wrong click is one segmented control away from right.
        onPickTemplate={(template) =>
          setAlertKind(template.id as SimpleAlertKind)
        }
        shelfLabel={t('notifications.simple.shelfLabel')}
        secondaryLabel={t('notifications.simple.flowShelfLabel')}
        secondaryTemplates={flowTemplates}
        onPickSecondary={handlePickFlow}
        blankLabel={t('notifications.builder.emptyState.startBlank')}
        onCreateBlank={handleBlank}
        footnote={t('notifications.builder.emptyState.footnote', {
          pair: TEMPLATE_PAIR,
          market: TEMPLATE_MARKET,
        })}
      />
      <NewAlertDialog
        open={alertKind !== null}
        onOpenChange={(next) => !next && setAlertKind(null)}
        defaultKind={alertKind ?? 'price-level'}
        onCreated={(id) => {
          selectRule(id)
          startEditing(id)
        }}
      />
    </>
  )
}
