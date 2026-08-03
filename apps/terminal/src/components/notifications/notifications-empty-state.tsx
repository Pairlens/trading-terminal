// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the Notifications canvas shows before any rule exists.
 *
 * Same two shades as Workflows: nothing at all (explain, then hand over a
 * template) versus nothing selected (just point at the list).
 */
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
        Pick a rule on the left to open it on the canvas.
      </div>
    )
  }

  const handlePick = (template: StarterTemplate) => {
    const full = NOTIFICATION_TEMPLATES.find((t) => t.id === template.id)
    if (full) applyNotificationTemplate(full)
  }

  const handleBlank = () => {
    const id = createRule('Untitled rule')
    selectRule(id)
    startEditing(id)
  }

  return (
    <StarterEmptyState
      eyebrow="Notifications"
      title="Watch the market so you don't have to"
      description="A rule is a small flow: something happens — a level is crossed, a candle closes, an order fills, an indicator alert trips — it passes whatever conditions you attach, and then it reaches you as a toast, an OS notification, or a webhook."
      icon={Bell}
      templates={NOTIFICATION_TEMPLATES}
      onPickTemplate={handlePick}
      blankLabel="Start from a blank canvas"
      onCreateBlank={handleBlank}
      footnote={`Templates open as a draft bound to ${TEMPLATE_PAIR} on ${TEMPLATE_MARKET} — edit the steps, retarget the pair under the rule list, then Commit to save. Rules only fire while Pairlens is running.`}
    />
  )
}
