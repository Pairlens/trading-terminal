// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/page-header'

// Lazy: the create flow pulls in the venue/pair pickers and the params
// editors, none of which the rest of the terminal needs on first paint.
const BotsPage = lazy(() =>
  import('@/components/bots/bots-page').then((m) => ({
    default: m.BotsPage,
  })),
)

export const Route = createFileRoute('/_terminal/bots')({
  component: BotsRoute,
})

function BotsRoute() {
  const { t } = useTranslation()
  return (
    <SidebarInset className="overflow-hidden">
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
          <BotsPage />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
