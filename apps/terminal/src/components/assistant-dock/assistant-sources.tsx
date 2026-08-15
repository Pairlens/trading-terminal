// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Where an answer came from ────────────────────────────────────────
//
// `web_search` hands the model up to eight results and then rendered as a
// chip reading "search the web". So the assistant could tell someone that
// a listing is confirmed or that a protocol was exploited, and the sole
// trace of where that came from was a chip with no link in it.
//
// `deep_research` has always shown its sources. This gives the same
// treatment to the cheap search every other answer runs on, which is the
// one people actually see.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Globe } from 'lucide-react'

import type { NormalizedToolPart } from '@/components/copilot/tool-part'
import { ResearchSourceCard } from '@/components/research/research-source-card'

export type AssistantSource = { url: string; title: string }

/**
 * Pull every web result the message's searches returned, in call order,
 * deduplicated by URL. Tolerates a half-streamed tool output, which is the
 * normal state of the world for most of a run.
 */
export function readSearchSources(
  tools: Array<NormalizedToolPart>,
): Array<AssistantSource> {
  const seen = new Set<string>()
  const out: Array<AssistantSource> = []
  for (const tool of tools) {
    if (tool.toolName !== 'web_search') continue
    const results = tool.output?.results
    if (!Array.isArray(results)) continue
    for (const entry of results) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as Record<string, unknown>
      const url = typeof record.url === 'string' ? record.url : ''
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue
      seen.add(url)
      out.push({
        url,
        title:
          typeof record.title === 'string' && record.title ? record.title : url,
      })
    }
  }
  return out
}

export function AssistantSources({
  sources,
}: {
  sources: Array<AssistantSource>
}) {
  const { t } = useTranslation()
  // Collapsed by default. Eight cards under every answer that happened to
  // search would bury the answer; the count alone is the honest signal that
  // the claim is sourced, and one click gets the list.
  const [open, setOpen] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-0.5 text-[11px]"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <Globe className="size-3 shrink-0" />
        {t('copilot.sourcesCount', { count: sources.length })}
      </button>

      {open ? (
        <div className="mt-1.5 flex flex-col gap-1">
          {sources.map((source, index) => (
            <ResearchSourceCard
              key={source.url}
              url={source.url}
              title={source.title}
              index={index + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
