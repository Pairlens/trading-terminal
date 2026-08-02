// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { BarChart3, Globe } from 'lucide-react'
import { ResearchMarkdown } from '../research-markdown'
import type { LucideIcon } from 'lucide-react'

import type { ResearchSection } from '../parse-research-sections'

type SourceInfo = { url: string; title: string }

const SLUG_ICONS: Record<string, LucideIcon> = {
  'price-action-structure': BarChart3,
  'market-context': Globe,
}

export function DefaultSection({
  section,
  sources,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
}) {
  const Icon = SLUG_ICONS[section.slug]

  return (
    <div>
      <h3
        id={section.slug}
        className="mb-3 flex items-center gap-1.5 scroll-mt-4 border-l-2 border-primary pl-2.5 text-[13px] font-bold uppercase tracking-wider text-primary"
      >
        {Icon && <Icon className="size-3.5" />}
        {section.heading}
      </h3>
      <ResearchMarkdown text={section.body} sources={sources} />
    </div>
  )
}
