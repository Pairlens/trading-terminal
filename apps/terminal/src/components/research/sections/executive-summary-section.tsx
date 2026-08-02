// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'

import { Badge } from '@pairlens/ui/components/ui/badge'

import { ResearchMarkdown } from '../research-markdown'
import { DefaultSection } from './default-section'
import type { ResearchSection } from '../parse-research-sections'

type SourceInfo = { url: string; title: string }

type Verdict = 'bullish' | 'bearish' | 'neutral'

const VERDICT_RE = /\*\*(Bullish|Bearish|Neutral)\*\*/i

const VERDICT_CONFIG: Record<
  Verdict,
  { icon: typeof TrendingUp; bg: string; border: string }
> = {
  bullish: {
    icon: TrendingUp,
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    border: 'border-emerald-500/30 bg-emerald-500/[0.03]',
  },
  bearish: {
    icon: TrendingDown,
    bg: 'bg-red-500/15 text-red-400 border-red-500/30',
    border: 'border-red-500/30 bg-red-500/[0.03]',
  },
  neutral: {
    icon: Activity,
    bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    border: 'border-amber-500/30 bg-amber-500/[0.03]',
  },
}

function parseVerdict(body: string): Verdict | null {
  const match = body.match(VERDICT_RE)
  if (!match) return null
  return match[1].toLowerCase() as Verdict
}

export function ExecutiveSummarySection({
  section,
  sources,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
}) {
  const verdict = parseVerdict(section.body)

  // Graceful fallback: no verdict detected yet (streaming) → default
  if (!verdict) {
    return <DefaultSection section={section} sources={sources} />
  }

  const config = VERDICT_CONFIG[verdict]
  const Icon = config.icon

  return (
    <div className={`rounded-lg border-t-2 p-3 ${config.border}`}>
      <div className="mb-3 flex items-center gap-2">
        <h3
          id={section.slug}
          className="scroll-mt-4 text-[13px] font-bold uppercase tracking-wider text-primary"
        >
          {section.heading}
        </h3>
        <Badge
          variant="outline"
          className={`gap-1 text-[11px] font-medium ${config.bg}`}
        >
          <Icon className="size-3" />
          {verdict.charAt(0).toUpperCase() + verdict.slice(1)}
        </Badge>
      </div>
      <ResearchMarkdown text={section.body} sources={sources} />
    </div>
  )
}
