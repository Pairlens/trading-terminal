// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Workflow } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import {
  MasterDetailSkeleton,
  PendingAfter,
} from '@/components/master-detail-skeleton'
import { PageHeader } from '@/components/page-header'
import { lazyPageChunk } from '@/lib/pending-pacing'
import { parseEntityId } from '@/lib/routing/pages'

const WorkflowBuilder = lazyPageChunk(() =>
  import('@/components/workflows/workflow-builder').then((m) => ({
    default: m.WorkflowBuilder,
  })),
)

/**
 * `?workflow=<id>` is which order plan is open on the canvas. The page
 * writes it on every selection, so the address is always the answer to
 * "which workflow am I looking at" — for a shared link, for the back
 * button, and for the assistant.
 */
type WorkflowsSearch = { workflow?: string }

export const Route = createFileRoute('/_terminal/workflows')({
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>): WorkflowsSearch => ({
    workflow: parseEntityId(search.workflow),
  }),
})

function WorkflowsPage() {
  const { t } = useTranslation()
  const { workflow } = Route.useSearch()
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
            <PendingAfter>
              <MasterDetailSkeleton
                body="canvas"
                label={t('routes.workflows.loading')}
              />
            </PendingAfter>
          }
        >
          <WorkflowBuilder workflowId={workflow ?? null} />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
