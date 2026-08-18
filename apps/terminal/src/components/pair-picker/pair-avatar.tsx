// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { Vote } from 'lucide-react'
import { cn } from '@pairlens/ui'

import type { PredictionOutcomeEntry } from '@/stores/prediction-directory-store'
import { useSymbolLogo } from '@/hooks/use-symbol-logo'
import {
  binarySideOf,
  predictionTicker,
  shortenId,
} from '@/lib/predictions/event-labels'
import {
  isPredictionEventEntry,
  usePredictionPin,
} from '@/stores/prediction-directory-store'

const AVATAR_COLORS = [
  { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
  { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400' },
  { bg: 'bg-violet-500/20', text: 'text-violet-700 dark:text-violet-400' },
  { bg: 'bg-rose-500/20', text: 'text-rose-700 dark:text-rose-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-700 dark:text-cyan-400' },
  { bg: 'bg-orange-500/20', text: 'text-orange-700 dark:text-orange-400' },
  { bg: 'bg-pink-500/20', text: 'text-pink-700 dark:text-pink-400' },
] as const

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const SIZE_CLASSES = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
} as const

const OVERLAY_CLASSES = {
  sm: 'size-3.5 text-[6px]',
  md: 'size-4 text-[7px]',
  lg: 'size-5 text-[8px]',
} as const

type PairAvatarProps = {
  base: string
  logoUrl?: string | null
  assetClass?: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

export function PairAvatar({
  base,
  logoUrl: logoUrlProp,
  assetClass,
  size = 'md',
  className,
}: PairAvatarProps) {
  const resolvedUrl = useSymbolLogo(base, assetClass)
  const logoUrl = logoUrlProp ?? resolvedUrl
  const color = AVATAR_COLORS[hashString(base) % AVATAR_COLORS.length]
  const [imgError, setImgError] = useState(false)

  const showLogo = logoUrl && !imgError

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZE_CLASSES[size],
        showLogo ? 'overflow-hidden' : [color.bg, color.text],
        className,
      )}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={base}
          className="size-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        base.slice(0, 3)
      )}
    </div>
  )
}

type PairSymbolProps = {
  symbol: string
  className?: string
  /**
   * Known asset class, when the caller has one. Only an escape hatch for a
   * prediction row that has not been pinned yet — the directory answers for
   * every row the user has actually seen.
   */
  assetClass?: string
}

/**
 * The one place a market's ticker is rendered.
 *
 * Three shapes behind one component. A CEX pair is `BASE-QUOTE` and gets the
 * split treatment. A prediction EVENT — which is what a prediction pair is —
 * has no ticker at all: its routing key is a venue event id, so it renders as
 * the question and elides rather than overflowing. A prediction OUTCOME, which
 * still turns up on a position row and in a fill, renders as subject + side.
 * Every ticker slot in the terminal goes through here, which is what keeps a
 * prediction from breaking a layout built for six characters.
 *
 * The directory read happens HERE rather than in a branch component, and that
 * is a deliberate change: a Polymarket event id is a bare number and a Kalshi
 * event ticker has two segments, so the old shape test ("three segments or the
 * caller told us") could not recognize a prediction pair at all. One zustand
 * selector per row is the price of that, paid against a store that only writes
 * when something is pinned.
 */
export function PairSymbol({ symbol, className, assetClass }: PairSymbolProps) {
  const pinned = usePredictionPin(symbol)

  if (pinned && isPredictionEventEntry(pinned)) {
    return (
      <span className={cn('min-w-0 truncate', className)} title={pinned.title}>
        {pinned.title || shortenId(symbol)}
      </span>
    )
  }

  if (pinned)
    return (
      <OutcomeSymbol entry={pinned} symbol={symbol} className={className} />
    )

  // Nothing pinned. A three-segment key that nothing pinned is a futures key
  // (`BTC-USDT-USDT`) or a DEX one, so it keeps reading the way it always has;
  // only a caller that KNOWS the class gets the shortened-id treatment.
  if (assetClass === 'prediction') {
    return (
      <span className={cn('truncate', className)} title={symbol}>
        {shortenId(symbol)}
      </span>
    )
  }
  return <PlainSymbol symbol={symbol} className={className} />
}

function PlainSymbol({ symbol, className }: PairSymbolProps) {
  const idx = symbol.indexOf('-')
  if (idx === -1) return <span className={className}>{symbol}</span>
  const base = symbol.slice(0, idx)
  const quote = symbol.slice(idx + 1)
  return (
    <span className={cn('font-mono font-semibold', className)}>
      {base}
      <span className="font-normal text-muted-foreground">-{quote}</span>
    </span>
  )
}

function OutcomeSymbol({
  entry,
  symbol,
  className,
}: {
  entry: PredictionOutcomeEntry
  symbol: string
  className?: string
}) {
  const { subject, outcome, full } = predictionTicker(entry, symbol)
  const side = binarySideOf(outcome)
  return (
    // `min-w-0` on the row is the caller's job; `truncate` here is what turns
    // a long subject into an ellipsis instead of an overflow.
    <span
      className={cn('flex min-w-0 items-baseline gap-1', className)}
      title={full}
    >
      <span className="truncate font-medium">{subject}</span>
      <span
        className={cn(
          'shrink-0 font-mono text-[0.85em] uppercase',
          side === 'yes' && 'text-up',
          side === 'no' && 'text-down',
          side === null && 'text-muted-foreground',
        )}
      >
        {outcome}
      </span>
    </span>
  )
}

type PairLogoProps = {
  base: string
  quote: string
  assetClass?: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
  /** Prediction rows only: the event's own artwork, when the venue has one. */
  imageUrl?: string | null
}

export function PairLogo({
  base,
  quote,
  assetClass,
  size = 'md',
  className,
  imageUrl,
}: PairLogoProps) {
  // A prediction outcome has no base and no quote — callers reach it by
  // splitting the routing key, which on Polymarket yields the first and second
  // words of an event slug. Two avatars lettered "DEM" and "PRE" say nothing;
  // one event thumbnail, or the class icon, says what this is.
  if (assetClass === 'prediction') {
    return (
      <PredictionAvatar
        className={className}
        imageUrl={imageUrl}
        size={size}
        title={base}
      />
    )
  }
  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <PairAvatar base={base} assetClass={assetClass} size={size} />
      <PairAvatar
        base={quote}
        assetClass={assetClass}
        size={size}
        className={cn(
          'absolute -bottom-0.5 -right-0.5 ring-2 ring-background',
          OVERLAY_CLASSES[size],
        )}
      />
    </div>
  )
}

export function PredictionAvatar({
  imageUrl,
  size = 'md',
  className,
  title,
}: {
  imageUrl?: string | null
  size?: keyof typeof SIZE_CLASSES
  className?: string
  title?: string
}) {
  const [imgError, setImgError] = useState(false)
  const showImage = Boolean(imageUrl) && !imgError

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        SIZE_CLASSES[size],
        showImage
          ? 'overflow-hidden'
          : 'bg-primary/10 text-primary [&>svg]:size-[55%]',
        className,
      )}
      title={title}
    >
      {showImage ? (
        <img
          src={imageUrl as string}
          alt=""
          className="size-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Vote />
      )}
    </div>
  )
}
