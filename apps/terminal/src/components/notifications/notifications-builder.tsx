// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import { NotificationsSidebar } from './notifications-sidebar'
import { NotificationCanvas } from './notification-canvas'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsBuilder() {
  const load = useNotificationStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full">
      <NotificationsSidebar />
      <ReactFlowProvider>
        <NotificationCanvas />
      </ReactFlowProvider>
    </div>
  )
}
