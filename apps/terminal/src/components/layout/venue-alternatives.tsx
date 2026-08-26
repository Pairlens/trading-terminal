// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The "try one of these instead" row, with the offer checked before it is made.
 *
 * Every empty state that sends the user to another venue used to hand them the
 * whole same-class connector list and hope. Half of those venues have never
 * heard of the pair — a USDT mid-cap is on four of the fourteen — so the
 * recovery frequently landed on the identical wall one click and one reconnect
 * later, which is the bug this row exists to close.
 *
 * So the venues are asked, live, the moment the row renders: each button wears
 * a spinner while its probe is out, then a check or a cross. A crossed venue is
 * disabled rather than hidden, because "Gate doesn't have it either" is the
 * answer the user came for, and a row that quietly shrank would look like a
 * loading state that never finished.
 *
 * Order holds while the probes are out — sorting on every answer would move a
 * button out from under a pointer already travelling towards it. It settles
 * once, when the last verdict lands, and that is also when the row is trimmed:
 * the venues that answered come first, so a pane with room for six can't spend
 * all six on venues that turned out not to have the pair. BGB-USDT is the case
 * that forced it — of the first six connectors by declaration order exactly one
 * carries it, and the two that quote it best were off the end of the row.
 */
import { Check, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'

import type { MarketOption } from '@/hooks/use-available-markets'
import type { VenueListingStatus } from '@/hooks/use-venue-listings'
import { track } from '@/lib/analytics-events'
import { useVenueListings } from '@/hooks/use-venue-listings'

/** Chips a pane has room for. Every candidate is probed either way. */
const DEFAULT_VISIBLE = 6

/** Answered first, unproven next, refused last. */
function offerRank(status: VenueListingStatus | undefined): number {
  switch (status) {
    case 'listed':
      return 0
    case 'unlisted':
    case 'blocked':
      return 2
    default:
      return 1
  }
}

export function VenueAlternatives({
  pairKey,
  venues,
  onSelect,
  className,
  maxVisible = DEFAULT_VISIBLE,
}: {
  pairKey: string
  venues: ReadonlyArray<MarketOption>
  onSelect: (market: string) => void
  className?: string
  /** How many chips the surface has room for. Every venue is still asked. */
  maxVisible?: number
}) {
  const { t } = useTranslation()
  const statuses = useVenueListings(pairKey, venues)

  if (venues.length === 0) return null

  const settled = venues.every(
    (m) => (statuses[m.value] ?? 'checking') !== 'checking',
  )
  const anyOffer = venues.some((m) => {
    const s = statuses[m.value] ?? 'checking'
    return s === 'listed' || s === 'unknown'
  })
  // Array#sort is stable, so venues that answered the same way keep the order
  // the resolver gave them.
  const ordered = settled
    ? [...venues].sort(
        (a, b) => offerRank(statuses[a.value]) - offerRank(statuses[b.value]),
      )
    : venues
  const visible = ordered.slice(0, maxVisible)

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="flex flex-wrap justify-center gap-1.5">
        {visible.map((m) => {
          const status = statuses[m.value] ?? 'checking'
          const refused = status === 'unlisted' || status === 'blocked'
          return (
            <Button
              key={m.value}
              aria-label={venueStatusLabel(t, status, m.label, pairKey)}
              className={cn(
                'h-7 gap-1.5 px-2 text-xs',
                refused && 'opacity-50',
              )}
              disabled={refused}
              onClick={() => {
                // Only the clickable verdicts reach here — a crossed button is
                // disabled — so the event carries what the check had said,
                // which is what makes a wasted switch visible after the fact.
                track('venue_alternative_taken', {
                  status: status === 'listed' ? 'listed' : 'unknown',
                  venue: m.value,
                })
                onSelect(m.value)
              }}
              size="sm"
              title={venueStatusLabel(t, status, m.label, pairKey)}
              variant="outline"
            >
              {m.iconUrl && (
                <img
                  alt=""
                  className={cn(
                    'size-3.5 rounded-full',
                    refused && 'grayscale',
                  )}
                  src={m.iconUrl}
                />
              )}
              {m.label}
              <VenueStatusMark status={status} />
            </Button>
          )
        })}
      </div>

      {/* Only once every probe is in: a note that appears and then disappears
          as answers arrive reads as a glitch. */}
      {settled && !anyOffer && (
        <p className="text-[11px] text-muted-foreground">
          {t('layout.venueCheck.noneListed')}
        </p>
      )}
    </div>
  )
}

/** The mark itself: spinner, check, cross, or nothing where nothing was proven. */
function VenueStatusMark({ status }: { status: VenueListingStatus }) {
  switch (status) {
    case 'checking':
      return (
        <Loader2 className="size-3 animate-spin text-muted-foreground/70" />
      )
    case 'listed':
      return <Check className="size-3 text-up" />
    case 'unlisted':
    case 'blocked':
      return <X className="size-3 text-muted-foreground" />
    // An unasked venue wears no mark rather than a mark that means "maybe":
    // the button is offered exactly as it was before any of this existed.
    default:
      return null
  }
}

function venueStatusLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  status: VenueListingStatus,
  venue: string,
  pair: string,
): string {
  switch (status) {
    case 'checking':
      return t('layout.venueCheck.checking', { pair, venue })
    case 'listed':
      return t('layout.venueCheck.listed', { pair, venue })
    case 'unlisted':
      return t('layout.venueCheck.unlisted', { pair, venue })
    case 'blocked':
      return t('layout.venueCheck.blocked', { venue })
    default:
      return t('layout.venueCheck.unchecked', { venue })
  }
}
