// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import { PageHeader } from '@/components/page-header'

const NotificationsBuilder = lazy(() =>
  import('@/components/notifications/notifications-builder').then((m) => ({
    default: m.NotificationsBuilder,
  })),
)

export const Route = createFileRoute('/_terminal/notifications')({
  component: NotificationsPage,
})

function NotificationsPage() {
  return (
    <SidebarInset className="overflow-hidden">
      <PageHeader>
        <Bell className="size-4" />
        <h1 className="text-sm font-semibold">Notifications</h1>
      </PageHeader>

      {/* Explicit height = viewport minus header. No flex chain needed. */}
      <div className="overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          }
        >
          <NotificationsBuilder />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
