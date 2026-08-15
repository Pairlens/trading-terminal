// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The parts an event is drawn from, shared by the browser card and the event
 * dialog.
 *
 * The two surfaces differ in exactly one thing — the card is bounded and the
 * dialog is not — so they are one set of pieces plus a cap, rather than two
 * renderings of the same data that drift on the next change.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Vote } from 'lucide-react'

import { cn } from '@pairlens/ui'
import type {
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'

import { formatPredictionPrice } from '@/lib/format-price'
import { binarySideOf, shortLabelOf } from '@/lib/predictions/event-labels'

/**
 * Artwork for an event or a market.
 *
 * Both venues publish one — Polymarket on the gamma event and per market,
 * Kalshi as `image_url` — and a board of forty text blocks is much harder to
 * scan than a board of forty pictures. A missing or broken image falls back to
 * the class glyph rather than to a hole, so rows stay aligned either way.
 */
export function EventThumbnail({
  imageUrl,
  className,
}: {
  imageUrl?: string
  className?: string
}) {
  if (!imageUrl) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary',
          className,
        )}
      >
        <Vote className="size-1/2" />
      </div>
    )
  }
  return (
    <img
      alt=""
      className={cn('shrink-0 rounded-md object-cover', className)}
      loading="lazy"
      src={imageUrl}
    />
  )
}

/**
 * One tradeable outcome.
 *
 * Yes and No are painted with the terminal's own up/down tokens. That is not
 * decoration: taking Yes on a prediction market IS the long side, it settles
 * at 100¢ or 0¢, and every other surface in the terminal already spells that
 * pair of directions in those two colours. A categorical outcome ('Newsom')
 * takes neither, because it is an answer rather than a side.
 */
export const OutcomeButton = memo(function OutcomeButton({
  outcome,
  onSelect,
  className,
}: {
  outcome: PredictionOutcomeSummary
  onSelect: (outcome: PredictionOutcomeSummary) => void
  className?: string
}) {
  const side = binarySideOf(outcome.label)
  return (
    <button
      className={cn(
        'flex min-w-24 flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1',
        'text-xs transition-colors',
        side === 'yes' &&
          'border-up/30 bg-up/5 text-up hover:border-up/60 hover:bg-up/10',
        side === 'no' &&
          'border-down/30 bg-down/5 text-down hover:border-down/60 hover:bg-down/10',
        side === null && 'hover:border-primary/50 hover:bg-accent/40',
        className,
      )}
      onClick={() => onSelect(outcome)}
      type="button"
    >
      <span className="truncate">{outcome.label}</span>
      <span
        className={cn(
          'shrink-0 font-mono tabular-nums',
          side === null && 'text-muted-foreground',
        )}
      >
        {outcome.price !== undefined
          ? formatPredictionPrice(outcome.price)
          : '—'}
      </span>
    </button>
  )
})

/**
 * One market: its label, then its outcomes.
 *
 * `maxOutcomes` is what keeps a categorical market from eating a card — some
 * Polymarket questions carry twenty answers — and the overflow count is shown
 * rather than swallowed, because a silently truncated list reads as a complete
 * one.
 */
export function MarketRow({
  market,
  eventTitle,
  marketCount,
  maxOutcomes,
  label: labelOverride,
  onSelect,
  onOverflow,
}: {
  market: PredictionMarketSummary
  eventTitle: string
  marketCount: number
  /** Outcomes to render; the rest become a count. Omit for all of them. */
  maxOutcomes?: number
  /** Pass `null` where the caller has already printed the question itself. */
  label?: string | null
  onSelect: (market: PredictionMarketSummary, label: string) => void
  /** Called by the overflow chip. Omit to render the count as plain text. */
  onOverflow?: () => void
}) {
  const { t } = useTranslation()
  // The venue's own short label first: on a categorical event it is the one
  // thing that separates siblings, and it is two words where the question is
  // a sentence.
  const label =
    labelOverride !== undefined
      ? labelOverride
      : shortLabelOf(market, eventTitle, marketCount)
  const shown =
    maxOutcomes === undefined
      ? market.outcomes
      : market.outcomes.slice(0, maxOutcomes)
  const hidden = market.outcomes.length - shown.length

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="truncate text-xs leading-snug text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {shown.map((outcome) => (
          <OutcomeButton
            key={outcome.pairKey}
            onSelect={(picked) => onSelect(market, picked.label)}
            outcome={outcome}
          />
        ))}
        {hidden > 0 &&
          (onOverflow ? (
            <button
              className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              onClick={onOverflow}
              type="button"
            >
              {t('events.moreOutcomes', { count: hidden })}
            </button>
          ) : (
            <span className="px-2 py-1 text-xs text-muted-foreground">
              {t('events.moreOutcomes', { count: hidden })}
            </span>
          ))}
      </div>
    </div>
  )
}
