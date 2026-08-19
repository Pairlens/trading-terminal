// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── A research report, rendered in the chat ──────────────────────────
//
// deep_research replaced the research pane, and a pane's worth of
// rendering came with it: numbered citations wired to their sources,
// prices and tickers turned into chart links, source cards with
// favicons. Handing the model's raw markdown to the generic chat
// renderer would have thrown all of that away, so the report keeps its
// own presentation and just lives inside a message now.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, FileSearch } from 'lucide-react'

import type { ResearchSource } from '@/lib/research-brain'
import { ResearchSectionRenderer } from '@/components/research/research-section-renderer'
import { ResearchSourceCard } from '@/components/research/research-source-card'

export type AssistantResearchCardProps = {
  pair: string
  market: string
  report: string
  sources: Array<ResearchSource>
}

/** Reads a deep_research tool output, tolerating a half-streamed one. */
export function readResearchOutput(
  output: Record<string, unknown> | undefined,
): AssistantResearchCardProps | null {
  if (!output || typeof output.report !== 'string' || !output.report.trim()) {
    return null
  }
  const rawSources = Array.isArray(output.sources) ? output.sources : []
  return {
    pair: typeof output.pair === 'string' ? output.pair : '',
    market: typeof output.market === 'string' ? output.market : '',
    report: output.report,
    sources: rawSources.filter(
      (source): source is ResearchSource =>
        !!source &&
        typeof (source as ResearchSource).url === 'string' &&
        typeof (source as ResearchSource).title === 'string',
    ),
  }
}

export function AssistantResearchCard({
  pair,
  market,
  report,
  sources,
}: AssistantResearchCardProps) {
  const { t } = useTranslation()
  // Collapsed by default: a full report is long, and the assistant's own
  // summary sits right underneath it. The user opens the report when the
  // summary is not enough.
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="ai-tile overflow-hidden rounded-[10px]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="hover:bg-[var(--ai-inset-strong)] flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <FileSearch
          className="size-3.5 shrink-0"
          style={{ color: 'var(--magic-1)' }}
        />
        <span className="font-medium">
          {pair
            ? t('assistantDock.researchCardTitle', { pair, market })
            : t('assistantDock.researchCardTitleGeneric')}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0">
          {t('assistantDock.researchCardSources', { count: sources.length })}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-[var(--ai-edge-soft)] px-3 py-2.5">
          {/* The same structured renderers the research pane used: an
              executive summary, price action with sparklines, catalysts,
              trade setup, risk factors. A plain markdown dump would have
              thrown all of that away when the pane went. */}
          <ResearchSectionRenderer
            report={report}
            sources={sources}
            market={market}
            pair={pair}
          />
          {sources.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1">
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
      ) : null}
    </div>
  )
}
