// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LayoutToolbar } from '@/components/layout/layout-toolbar'
import { PageHeader } from '@/components/page-header'

export function DiscoveryTopBar() {
  const { t } = useTranslation()
  const [workspacesOpen, setWorkspacesOpen] = useState(false)

  return (
    <PageHeader
      actions={
        <LayoutToolbar open={workspacesOpen} onOpenChange={setWorkspacesOpen} />
      }
    >
      <h1 className="text-sm font-semibold">{t('discovery.title')}</h1>
    </PageHeader>
  )
}
