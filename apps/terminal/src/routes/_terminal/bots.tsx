// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'
import { useTranslation } from 'react-i18next'

import { DesktopSurfaceNudge } from '@/components/feedback/desktop-nudge'
import { PageHeader } from '@/components/page-header'
import { lazyChunk } from '@/lib/lazy-chunk'

// Lazy: the create flow pulls in the venue/pair pickers and the params
// editors, none of which the rest of the terminal needs on first paint.
const BotsPage = lazyChunk(() =>
  import('@/components/bots/bots-page').then((m) => ({
    default: m.BotsPage,
  })),
)

/** `create` deep-links into the create flow with a strategy preselected —
 *  the workbench's "Deploy as bot" button sends the user here. */
type BotsSearch = {
  create?: string
}

export const Route = createFileRoute('/_terminal/bots')({
  component: BotsRoute,
  validateSearch: (search: Record<string, unknown>): BotsSearch => ({
    create: typeof search.create === 'string' ? search.create : undefined,
  }),
})

function BotsRoute() {
  const { t } = useTranslation()
  const { create } = Route.useSearch()
  return (
    <SidebarInset className="overflow-hidden">
      {/* Browser build only, once per device: a bot runs in this tab, and a
          browser throttles then suspends the tab you are not looking at. */}
      <DesktopSurfaceNudge surface="bots" />
      <PageHeader>
        <Bot className="size-4" />
        <h1 className="text-sm font-semibold">{t('nav.bots')}</h1>
      </PageHeader>

      {/* Explicit height = viewport minus header. No flex chain needed. */}
      <div className="overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('botsPage.loading')}
            </div>
          }
        >
          <BotsPage deployScriptId={create ?? null} />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
