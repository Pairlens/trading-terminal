// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { HEADER_TITLE } from '@/components/chrome/header-chrome'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import {
  MasterDetailSkeleton,
  PendingAfter,
} from '@/components/master-detail-skeleton'
import { PageHeader } from '@/components/page-header'
import { lazyPageChunk } from '@/lib/pending-pacing'

// Lazy: keeps the code editor and Python runtime out of the main bundle.
const IndicatorWorkbench = lazyPageChunk(() =>
  import('@/components/indicators/indicator-workbench').then((m) => ({
    default: m.IndicatorWorkbench,
  })),
)

/** `script` deep-links straight to one script — a bot's Strategy stat sends
 *  the user here to edit the exact code their bot is running. */
type IndicatorsSearch = {
  script?: string
}

export const Route = createFileRoute('/_terminal/indicators')({
  component: IndicatorsPage,
  validateSearch: (search: Record<string, unknown>): IndicatorsSearch => ({
    script: typeof search.script === 'string' ? search.script : undefined,
  }),
})

function IndicatorsPage() {
  const { t } = useTranslation()
  const { script } = Route.useSearch()
  return (
    <main className={PAGE_FRAME}>
      <PageHeader>
        <h1 className={HEADER_TITLE}>{t('nav.indicators')}</h1>
      </PageHeader>

      <Suspense
        fallback={
          <PendingAfter>
            <MasterDetailSkeleton
              body="editor"
              label={t('indicators.loading')}
            />
          </PendingAfter>
        }
      >
        <IndicatorWorkbench focusScriptId={script ?? null} />
      </Suspense>
    </main>
  )
}
