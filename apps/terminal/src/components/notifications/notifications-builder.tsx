// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Notifications page: a list of alerts, and whatever the selected one
 * needs to be edited with.
 *
 * Which editor that is depends on the rule, not on a mode the user picks —
 * a rule matching the simple-alert shape opens as a form, everything else
 * opens on the canvas. ReactFlow is only mounted for the second case, so the
 * common path never pays for the graph editor at all.
 *
 * Which rule is open lives in the URL (`?alert=<id>`), so an alert can be
 * linked to, walked back to, and named by the assistant.
 */
import { useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'

import { NotificationsSidebar } from './notifications-sidebar'
import { NotificationCanvas } from './notification-canvas'
import { NotificationsAssistantSurface } from './notifications-assistant-surface'
import { SimpleAlertEditor } from './simple-alert-editor'
import { useSimpleAlertView } from './use-simple-alert-view'
import { useSearchSelection } from '@/hooks/use-search-selection'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsBuilder({
  ruleId = null,
}: {
  /** The alert rule the URL is naming, already validated by the route. */
  ruleId?: string | null
} = {}) {
  const load = useNotificationStore((s) => s.load)
  const loaded = useNotificationStore((s) => s.loaded)
  const rules = useNotificationStore((s) => s.rules)
  const activeRuleId = useNotificationStore((s) => s.activeRuleId)
  const simpleView = useSimpleAlertView(activeRuleId)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [load])

  // Opening from a link does what clicking the list does: select the rule
  // and open it in its editor. `startEditing` is skipped when the draft is
  // already this rule, because it rebuilds the draft from the saved copy
  // and would discard edits in flight. A rule that has since been deleted
  // selects nothing, and the hook strips the dead id from the address.
  const select = useCallback((id: string) => {
    const store = useNotificationStore.getState()
    if (!store.rules.some((rule) => rule.id === id)) return false
    store.selectRule(id)
    if (store.draft?.ruleId !== id) store.startEditing(id)
    return true
  }, [])

  const write = useCallback(
    (id: string | null, { replace }: { replace: boolean }) => {
      void navigate({
        to: '/notifications',
        search: id ? { alert: id } : {},
        replace,
      })
    },
    [navigate],
  )

  useSearchSelection({
    param: ruleId,
    selected: activeRuleId,
    select,
    write,
    ready: loaded,
  })

  const active = rules.find((rule) => rule.id === activeRuleId) ?? null

  return (
    <div className="flex h-full min-h-0">
      <NotificationsAssistantSurface
        rule={active}
        simple={Boolean(simpleView)}
        count={rules.length}
      />
      <NotificationsSidebar />
      <div className="flex h-full min-w-0 flex-1">
        {simpleView && activeRuleId ? (
          <SimpleAlertEditor key={activeRuleId} ruleId={activeRuleId} />
        ) : (
          <ReactFlowProvider>
            <NotificationCanvas />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  )
}
