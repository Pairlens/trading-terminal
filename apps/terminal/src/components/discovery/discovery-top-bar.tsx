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
import { PairlensLogo } from '@/components/pairlens-logo'
import { DiscoverySectionTabs } from '@/components/discovery/discovery-section-tabs'
import { DiscoveryVenuePicker } from '@/components/discovery/discovery-venue-picker'

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
        <>
          <DiscoveryVenuePicker section={activeSection} />
          <LayoutToolbar
            open={workspacesOpen}
            onOpenChange={setWorkspacesOpen}
          />
        </>
      }
    >
      {/* Discovery is the front door, so the bar names it with the wordmark
          rather than the word. Sized to the 13px/600 title it replaces: 17px
          of image puts the letters on the same optical line as the chips to
          its right, and the black outline it carries is what lets one asset
          serve all 18 themes. The mark is 5.18:1, so height is the only
          dimension worth naming and the intrinsic pair below it has to stay
          honest: those attributes are the ratio the browser reserves space
          with before the bytes land, and a stale pair shifts the whole bar
          on every cold load.

          The mark is drawn as drawn, spectrum included. A greyscale-until-
          hover treatment was tried here first and it read as nothing: the
          only colour in the mark is the underline, which is a few pixels of
          a 17px image, so desaturating it changed almost nothing you could
          see and asked for a hover to undo a change nobody noticed.

          The heading keeps its text for screen readers: the mark is the page
          title visually, "Discovery" is the page title out loud. */}
      <h1 aria-label={t('discovery.title')} className="shrink-0 leading-none">
        <PairlensLogo
          alt=""
          width={3264}
          height={630}
          className="block h-[17px] w-auto select-none"
        />
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
