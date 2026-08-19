// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { HEADER_TITLE } from '@/components/chrome/header-chrome'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { DesktopSurfaceNudge } from '@/components/feedback/desktop-nudge'
import {
  MasterDetailSkeleton,
  PendingAfter,
} from '@/components/master-detail-skeleton'
import { PageHeader } from '@/components/page-header'
import { lazyPageChunk } from '@/lib/pending-pacing'
import { parseEntityId } from '@/lib/routing/pages'

const NotificationsBuilder = lazyPageChunk(() =>
  import('@/components/notifications/notifications-builder').then((m) => ({
    default: m.NotificationsBuilder,
  })),
)

/**
 * `?alert=<rule id>` is which alert is open in the editor. Written on every
 * selection, so the address names the rule the user is actually tuning.
 */
type NotificationsSearch = { alert?: string }

export const Route = createFileRoute('/_terminal/notifications')({
  component: NotificationsPage,
  validateSearch: (search: Record<string, unknown>): NotificationsSearch => ({
    alert: parseEntityId(search.alert),
  }),
})

function NotificationsPage() {
  const { t } = useTranslation()
  const { alert } = Route.useSearch()
  return (
    <main className={PAGE_FRAME}>
      {/* Browser build only, once per device: alert rules are evaluated in
          this tab, and a browser suspends tabs. */}
      <DesktopSurfaceNudge surface="notifications" />
      <PageHeader>
        <h1 className={HEADER_TITLE}>{t('nav.notifications')}</h1>
      </PageHeader>

      <Suspense
        fallback={
          <PendingAfter>
            <MasterDetailSkeleton
              body="canvas"
              label={t('routes.notifications.loading')}
            />
          </PendingAfter>
        }
      >
        <NotificationsBuilder ruleId={alert ?? null} />
      </Suspense>
    </main>
  )
}
