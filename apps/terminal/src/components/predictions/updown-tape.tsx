// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The money moving the window, arriving one print at a time.
 *
 * The venues animate their own order flow, which looks alive and tells you
 * nothing: a fifteen-minute BTC contract is not settled by who bought the
 * contract, it is settled by the tape on the spot market. So this is that tape.
 *
 * What it shows is a side and an amount, and deliberately NOT a price. Every
 * print inside the last minute is within a few cents of the one before it, so a
 * price column here is five near-identical numbers dressed up as information —
 * the settlement price is already on the card, once, where it belongs. What
 * actually varies, and what actually bears on the contract, is which side is
 * pushing and how much money is behind it: a buy moves the tape toward Up
 * settling, a sell toward Down. The strip at the top is those two sides summed;
 * the rows are the individual pushes, each barred against the largest on screen
 * so relative size reads without being read.
 *
 * The animation is CSS on mount, keyed by trade id, so React animates exactly
 * the prints that are new and nothing re-enters when the list shifts down.
 * Nothing here is on a timer: `useTradesStream` already buffers arrivals and
 * flushes them on a 100ms frame, which is the throttle.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { Trade } from '@/hooks/use-trades-stream'
import { printBarFraction, tapeFlow } from '@/lib/predictions/updown-focus'
import { formatCompactUsd } from '@/lib/format-price'

/**
 * Prints on screen.
 *
 * Short on purpose. This is a pulse, not a time-and-sales pane — the terminal
 * has one of those, and a column of forty rows in a card whose subject is a
 * countdown is forty rows nobody reads.
 */
export const TAPE_ROWS = 6

export function UpDownTape({
  trades,
  venueLabel,
}: {
  trades: ReadonlyArray<Trade>
  /** Which venue's tape this is, since it may not be the settlement venue. */
  venueLabel: string
}) {
  const { t } = useTranslation()
  // Summed over everything the stream is holding, not just the visible rows: a
  // six-row window is a glance at the flow, not a measurement of it.
  const flow = useMemo(() => tapeFlow(trades), [trades])
  const rows = trades.slice(0, TAPE_ROWS)

  return (
    <div className="flex min-h-0 flex-col">
      <p className="shrink-0 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {t('cryptoUpDown.focus.tapeLabel', { venue: venueLabel })}
      </p>

      {flow.buyShare === null ? (
        <p className="font-mono text-[10px] text-muted-foreground/70">
          {t('cryptoUpDown.focus.tapeWaiting')}
        </p>
      ) : (
        <>
          {/* Both sides of the recent tape as one bar. It is the number the
              rows below only hint at, and the one that says which outcome the
              flow is currently paying for. */}
          <div className="shrink-0 pb-1.5">
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="bg-up transition-[width] duration-500"
                style={{ width: `${Math.round(flow.buyShare * 100)}%` }}
              />
              <span className="flex-1 bg-down" />
            </div>
            <div className="mt-0.5 flex justify-between font-mono text-[9px] tabular-nums">
              <span className="text-up">
                {t('cryptoUpDown.focus.flowBought', {
                  value: formatCompactUsd(flow.buyUsd),
                })}
              </span>
              <span className="text-down">
                {t('cryptoUpDown.focus.flowSold', {
                  value: formatCompactUsd(flow.sellUsd),
                })}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-px overflow-hidden">
            {rows.map((trade) => (
              <TapeRow key={trade.id} maxUsd={flow.maxUsd} trade={trade} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TapeRow({ trade, maxUsd }: { trade: Trade; maxUsd: number }) {
  const { t } = useTranslation()
  const buy = trade.side === 'buy'
  const usd = trade.price * trade.size

  return (
    <div
      className={cn(
        'relative flex items-center gap-1.5 overflow-hidden rounded-sm px-1 py-px font-mono text-[10px] tabular-nums',
        'animate-in fade-in slide-in-from-right-2 duration-300',
        buy ? 'text-up' : 'text-down',
      )}
    >
      {/* The size, as width. Drawn from the side the money came from so a
          sell grows leftward against a buy growing rightward, which is what
          lets a burst of one-sided flow read as a shape rather than a list. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 transition-[width] duration-300',
          buy ? 'left-0 bg-up/12' : 'right-0 bg-down/12',
        )}
        style={{ width: `${printBarFraction(usd, maxUsd) * 100}%` }}
      />
      <span className="relative shrink-0 font-semibold">
        {buy
          ? t('cryptoUpDown.focus.printBuy')
          : t('cryptoUpDown.focus.printSell')}
      </span>
      <span className="relative flex-1 text-right">
        {formatCompactUsd(usd)}
      </span>
    </div>
  )
}
