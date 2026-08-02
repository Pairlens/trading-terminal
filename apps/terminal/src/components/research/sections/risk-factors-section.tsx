// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AlertTriangle } from 'lucide-react'

import { ResearchMarkdown } from '../research-markdown'
import type { ResearchSection } from '../parse-research-sections'

type SourceInfo = { url: string; title: string }

export function RiskFactorsSection({
  section,
  sources,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
}) {
  return (
    <div className="rounded-r-lg border-l-2 border-amber-500/60 bg-amber-500/5 py-3 pr-3 pl-3">
      <h3
        id={section.slug}
        className="mb-3 flex items-center gap-1.5 scroll-mt-4 text-[13px] font-bold uppercase tracking-wider text-amber-400"
      >
        <AlertTriangle className="size-3.5" />
        {section.heading}
      </h3>
      <ResearchMarkdown text={section.body} sources={sources} />
    </div>
  )
}
