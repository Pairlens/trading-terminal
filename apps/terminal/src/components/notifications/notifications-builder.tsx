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
 */
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import { NotificationsSidebar } from './notifications-sidebar'
import { NotificationCanvas } from './notification-canvas'
import { SimpleAlertEditor } from './simple-alert-editor'
import { useSimpleAlertView } from './use-simple-alert-view'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsBuilder() {
  const load = useNotificationStore((s) => s.load)
  const activeRuleId = useNotificationStore((s) => s.activeRuleId)
  const simpleView = useSimpleAlertView(activeRuleId)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full min-h-0">
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
