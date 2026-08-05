// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SquareFunction } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/page-header'
import { lazyChunk } from '@/lib/lazy-chunk'

// Lazy: keeps the code editor and Python runtime out of the main bundle.
const IndicatorWorkbench = lazyChunk(() =>
  import('@/components/indicators/indicator-workbench').then((m) => ({
    default: m.IndicatorWorkbench,
  })),
)

export const Route = createFileRoute('/_terminal/indicators')({
  component: IndicatorsPage,
})

function IndicatorsPage() {
  const { t } = useTranslation()
  return (
    <SidebarInset className="overflow-hidden">
      <PageHeader>
        <SquareFunction className="size-4" />
        <h1 className="text-sm font-semibold">{t('nav.indicators')}</h1>
      </PageHeader>

      {/* Explicit height = viewport minus header. No flex chain needed. */}
      <div className="overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('indicators.loading')}
            </div>
          }
        >
          <IndicatorWorkbench />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
