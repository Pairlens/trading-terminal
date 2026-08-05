// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Workflow } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import { PageHeader } from '@/components/page-header'
import { lazyChunk } from '@/lib/lazy-chunk'

const WorkflowBuilder = lazyChunk(() =>
  import('@/components/workflows/workflow-builder').then((m) => ({
    default: m.WorkflowBuilder,
  })),
)

export const Route = createFileRoute('/_terminal/workflows')({
  component: WorkflowsPage,
})

function WorkflowsPage() {
  const { t } = useTranslation()
  return (
    <SidebarInset className="overflow-hidden">
      <PageHeader>
        <Workflow className="size-4" />
        <h1 className="text-sm font-semibold">{t('nav.workflows')}</h1>
      </PageHeader>

      {/* Explicit height = viewport minus header. No flex chain needed. */}
      <div className="overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('routes.workflows.loading')}
            </div>
          }
        >
          <WorkflowBuilder />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
