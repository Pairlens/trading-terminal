// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  DiscoverySection,
  DiscoverySectionId,
} from '@/lib/layout/workspaces/discovery-sections'
import { LayoutToolbar } from '@/components/layout/layout-toolbar'
import { PageHeader } from '@/components/page-header'
import { DiscoverySectionTabs } from '@/components/discovery/discovery-section-tabs'

type DiscoveryTopBarProps = {
  sections: Array<DiscoverySection>
  activeSection: DiscoverySectionId
  onSelectSection: (id: DiscoverySectionId) => void
  onReorderSections: (fromId: string, toId: string) => void
}

export function DiscoveryTopBar({
  sections,
  activeSection,
  onSelectSection,
  onReorderSections,
}: DiscoveryTopBarProps) {
  const { t } = useTranslation()
  const [workspacesOpen, setWorkspacesOpen] = useState(false)

  return (
    <PageHeader
      actions={
        <LayoutToolbar open={workspacesOpen} onOpenChange={setWorkspacesOpen} />
      }
    >
      <h1 className="shrink-0 text-sm font-semibold">{t('discovery.title')}</h1>
      <DiscoverySectionTabs
        sections={sections}
        active={activeSection}
        onSelect={onSelectSection}
        onReorder={onReorderSections}
      />
    </PageHeader>
  )
}
