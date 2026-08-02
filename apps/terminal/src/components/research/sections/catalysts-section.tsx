// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Newspaper } from 'lucide-react'

import { ResearchMarkdown } from '../research-markdown'
import { ResearchSourceCard } from '../research-source-card'
import { DefaultSection } from './default-section'
import type { ResearchSection } from '../parse-research-sections'

type SourceInfo = { url: string; title: string }

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

function extractLinks(body: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = []
  const seen = new Set<string>()
  for (const m of body.matchAll(LINK_RE)) {
    if (!seen.has(m[2])) {
      seen.add(m[2])
      links.push({ text: m[1], url: m[2] })
    }
  }
  return links
}

export function CatalystsSection({
  section,
  sources,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
}) {
  const links = extractLinks(section.body)

  // Build source lookup for card titles
  const sourceMap = new Map<string, SourceInfo>()
  for (const s of sources) sourceMap.set(s.url, s)

  if (links.length < 3) {
    return <DefaultSection section={section} sources={sources} />
  }

  return (
    <div>
      <h3
        id={section.slug}
        className="mb-3 flex items-center gap-1.5 scroll-mt-4 border-l-2 border-primary pl-2.5 text-[13px] font-bold uppercase tracking-wider text-primary"
      >
        <Newspaper className="size-3.5" />
        {section.heading}
      </h3>

      {/* Horizontally scrollable news row */}
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {links.map((link) => {
          const source = sourceMap.get(link.url)
          return (
            <div key={link.url} className="w-[220px] shrink-0">
              <ResearchSourceCard
                url={link.url}
                title={source?.title ?? link.text}
              />
            </div>
          )
        })}
      </div>

      <ResearchMarkdown text={section.body} sources={sources} />
    </div>
  )
}
