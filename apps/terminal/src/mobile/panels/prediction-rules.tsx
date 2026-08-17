// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a market resolves, in the venue's own words, behind a disclosure.
 *
 * A probability is only worth reading against the criteria that settle it:
 * "above $120,000 on August 15" is a different bet depending on whose print at
 * whose cutoff decides it, and both venues publish that prose (Kalshi's
 * `rules_primary` + `rules_secondary`, Polymarket's market description). The
 * desktop puts it in a popover off the event header; a phone has no hover and
 * no room for a 96-character-wide panel, so it collapses in place.
 *
 * Collapsed by default and one 26px row tall, because the rules are what you
 * check once before staking, not what you read on every glance. Rendered only
 * when the payload actually carries the text — a chip that opens an empty
 * sheet implies the terminal knows something it does not.
 *
 * Shared by the event screen (once per market section) and the Trade ticket's
 * question card, so the two cannot drift into saying different things about
 * the same contract.
 */
import { memo, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'

export const PredictionRules = memo(function PredictionRules({
  rules,
  venueLabel,
  className,
}: {
  rules: string | undefined
  venueLabel: string
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const text = rules?.trim()
  if (!text) return null

  return (
    <div className={cn('flex flex-col', className)}>
      <button
        aria-expanded={open}
        className="pl-press-soft -mx-1 flex h-[26px] items-center gap-1.5 self-start rounded-md px-1 text-[11px] text-muted-foreground"
        onClick={() => setOpen(!open)}
        type="button"
        {...PRESS}
      >
        <FileText aria-hidden className="size-3 opacity-70" />
        {t('eventHeader.rules')}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        // Its own scroll region, capped: Kalshi's rules run to several hundred
        // words and a disclosure that pushes the confirm bar four screens down
        // is a disclosure nobody opens twice.
        <div className="mt-1 rounded-[10px] bg-[color:var(--pl-wash)] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[.1em] text-muted-foreground/80">
            {t('eventHeader.rulesSource', { venue: venueLabel })}
          </p>
          <p className="mt-1 max-h-[220px] overflow-y-auto overscroll-contain whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
            {text}
          </p>
        </div>
      ) : null}
    </div>
  )
})
