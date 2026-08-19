// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  DiscoverySection,
  DiscoverySectionId,
} from '@/lib/layout/workspaces/discovery-sections'
import { HEADER_GROUP } from '@/components/chrome/header-chrome'
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
      {/* 13px/600, the same weight and size the pair chip's symbol wears on
          a trade page: whatever the board is called sits at one type size
          across the whole bar. It is its own group, so the gap after it is
          what says "this names the boards beside it". */}
      <h1 className="shrink-0 text-[13px] font-semibold tracking-[-0.01em]">
        {t('discovery.title')}
      </h1>
      <div className={HEADER_GROUP}>
        <DiscoverySectionTabs
          sections={sections}
          active={activeSection}
          onSelect={onSelectSection}
          onReorder={onReorderSections}
        />
      </div>
    </PageHeader>
  )
}
