// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { cn } from '@pairlens/ui'

import { useSymbolLogo } from '@/hooks/use-symbol-logo'

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
}

export function PairSymbol({ symbol, className }: PairSymbolProps) {
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

type PairLogoProps = {
  base: string
  quote: string
  assetClass?: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

export function PairLogo({
  base,
  quote,
  assetClass,
  size = 'md',
  className,
}: PairLogoProps) {
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
