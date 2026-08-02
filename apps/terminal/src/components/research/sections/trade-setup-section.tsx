// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Activity,
  Crosshair,
  Scale,
  ShieldX,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { Badge } from '@pairlens/ui/components/ui/badge'

import { ResearchMarkdown } from '../research-markdown'
import {
  TRADE_SETUP_KEYS,
  parseTradeSetup,
  stripKeyLines,
} from '../parse-research-details'
import type { LucideIcon } from 'lucide-react'
import type { ResearchSection } from '../parse-research-sections'

type SourceInfo = { url: string; title: string }

type Bias = 'long' | 'short' | 'flat'

const BIAS_CONFIG: Record<
  Bias,
  { icon: typeof TrendingUp; className: string }
> = {
  long: {
    icon: TrendingUp,
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  short: {
    icon: TrendingDown,
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  flat: {
    icon: Activity,
    className:
      'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30',
  },
}

function LevelRow({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span
        className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${accent}`}
      >
        <Icon className="size-3 translate-y-0.5" />
        {label}
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  )
}

export function TradeSetupSection({
  section,
  sources,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
}) {
  const setup = parseTradeSetup(section.body)
  const config = setup.bias ? BIAS_CONFIG[setup.bias] : null
  const BiasIcon = config?.icon

  // Card only when the structured lines actually parsed — otherwise the
  // whole body renders as prose (model drifted from the format).
  const levelCount = [setup.entry, setup.invalidation, setup.targets].filter(
    Boolean,
  ).length
  const hasCard = levelCount >= 2
  const prose = hasCard
    ? stripKeyLines(section.body, TRADE_SETUP_KEYS)
    : section.body

  return (
    <div>
      <h3
        id={section.slug}
        className="mb-3 flex items-center gap-1.5 scroll-mt-4 border-l-2 border-primary pl-2.5 text-[13px] font-bold uppercase tracking-wider text-primary"
      >
        <Target className="size-3.5" />
        {section.heading}
        {setup.bias && config && BiasIcon && (
          <Badge
            variant="outline"
            className={`ml-1 gap-1 text-[11px] font-medium ${config.className}`}
          >
            <BiasIcon className="size-3" />
            {setup.bias.charAt(0).toUpperCase() + setup.bias.slice(1)}
          </Badge>
        )}
      </h3>

      {hasCard && (
        <div className="border-border/60 bg-muted/30 divide-border/40 mb-3 divide-y rounded-lg border">
          {setup.entry && (
            <LevelRow
              icon={Crosshair}
              label="Entry"
              value={setup.entry}
              accent="text-primary"
            />
          )}
          {setup.invalidation && (
            <LevelRow
              icon={ShieldX}
              label="Invalidation"
              value={setup.invalidation}
              accent="text-down"
            />
          )}
          {setup.targets && (
            <LevelRow
              icon={Target}
              label="Targets"
              value={setup.targets}
              accent="text-up"
            />
          )}
          {setup.riskReward && (
            <LevelRow
              icon={Scale}
              label="R:R"
              value={setup.riskReward}
              accent="text-muted-foreground"
            />
          )}
        </div>
      )}

      {prose.length > 0 && <ResearchMarkdown text={prose} sources={sources} />}
    </div>
  )
}
