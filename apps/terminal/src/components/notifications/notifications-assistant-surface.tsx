// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The alert being edited, published to the assistant ───────────────
//
// The page knows which rule is open, whether it is armed, which pairs it
// is bound to, and which of the two editors it opened in. All of that is
// what "what am I looking at" means here, and none of it was reachable
// before: the assistant saw a path and nothing else.

import type { NotificationRuleDSL } from '@pairlens/notification-engine/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsAssistantSurface({
  rule,
  simple,
  count,
}: {
  /** The rule open in the editor, or null when none is selected. */
  rule: NotificationRuleDSL | null
  /** True when it opened as the simple form rather than the canvas. */
  simple: boolean
  count: number
}) {
  useAssistantSurface({
    id: 'page:notifications',
    getPriority: () => 60,
    revision: rule?.id ?? 'none',
    getContext: () => {
      if (!rule) {
        return {
          summary:
            count > 0
              ? `The user is on the Alerts page with no alert selected. They have ${count}; list_alerts names them.`
              : 'The user is on the Alerts page and has no alerts yet. create_simple_alert makes one.',
        }
      }

      const state = useNotificationStore.getState()
      const draft = state.draft?.ruleId === rule.id ? state.draft : null
      const steps = draft?.currentSteps ?? rule.steps
      const bindings = state.bindings.filter(
        (binding) => binding.ruleId === rule.id,
      )

      return {
        summary: `The user is editing the alert "${rule.name}" (id ${rule.id}) in the ${
          simple ? 'simple alert form' : 'alert flow canvas'
        }. Read it with get_alert, and edit it with ${
          simple ? 'update_simple_alert' : 'update_alert_flow'
        }.`,
        detail: {
          alertId: rule.id,
          name: rule.name,
          armed: rule.enabled !== false,
          editor: simple ? 'simple-form' : 'flow-canvas',
          steps: steps.length,
          stepTypes: [...new Set(steps.map((step) => step.type))],
          watching: bindings.map(
            (binding) => `${binding.pair} on ${binding.market}`,
          ),
          uncommittedChanges: (draft?.pendingChanges.length ?? 0) > 0,
          savedAlerts: count,
        },
      }
    },
    getSuggestion: () =>
      rule
        ? {
            key: 'assistantDock.suggest.alertSelected',
            values: { name: rule.name },
          }
        : { key: 'assistantDock.suggest.notifications' },
  })

  return null
}
