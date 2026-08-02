// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronDown, Keyboard, List, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { useMarketInstruments } from '@/hooks/use-market-instruments'

// ---------------------------------------------------------------------------
// Preview pair picker — base and quote are chosen separately, so nobody has to
// remember that the separator is a dash. Options come from the selected
// venue's own instrument list; the constants below are the floor for venues
// whose connector ships no discovery.
// ---------------------------------------------------------------------------

const FALLBACK_BASES = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'BNB',
  'DOGE',
  'ADA',
  'AVAX',
  'LINK',
  'TON',
  'TRX',
  'DOT',
  'LTC',
  'SHIB',
]

const FALLBACK_QUOTES = ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH']

/** Cap the menu — a venue can list thousands of instruments. */
const MAX_OPTIONS = 40

export function splitPair(pair: string): { base: string; quote: string } {
  const idx = pair.indexOf('-')
  if (idx === -1) return { base: pair, quote: '' }
  return { base: pair.slice(0, idx), quote: pair.slice(idx + 1) }
}

type PreviewPairPickerProps = {
  market: string
  /** Canonical 'BASE-QUOTE'. */
  pair: string
  onPairChange: (pair: string) => void
  /** Enter in the manual field re-runs, matching the old free-text input. */
  onSubmit?: () => void
}

export function PreviewPairPicker({
  market,
  pair,
  onPairChange,
  onSubmit,
}: PreviewPairPickerProps) {
  const { t } = useTranslation()
  const { base, quote } = splitPair(pair)
  const [manual, setManual] = useState(false)

  if (manual) {
    return (
      <div className="flex items-center gap-0.5">
        <Input
          value={pair}
          onChange={(e) => onPairChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          className="h-7 w-28 font-mono text-xs"
          aria-label={t('indicatorsPage.pair')}
          autoFocus
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={() => setManual(false)}
                aria-label={t('indicatorsPage.pairPickerBack')}
              />
            }
          >
            <List className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{t('indicatorsPage.pairPickerBack')}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <BaseMenu
        market={market}
        base={base}
        onSelect={(next) => onPairChange(`${next}-${quote || 'USDT'}`)}
        onManual={() => setManual(true)}
      />
      <span className="text-xs text-muted-foreground">-</span>
      <QuoteMenu
        market={market}
        base={base}
        quote={quote}
        onSelect={(next) => onPairChange(`${base}-${next}`)}
      />
    </div>
  )
}

/** Shared trigger: asset mark + symbol + chevron. */
function SymbolTrigger({ symbol, label }: { symbol: string; label: string }) {
  return (
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-xs"
          aria-label={label}
        />
      }
    >
      {symbol.length > 0 && (
        <PairAvatar base={symbol} size="sm" className="size-4 text-[7px]" />
      )}
      {symbol || '—'}
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  )
}

/** Filter box shared by both menus; printable keys must not hit typeahead. */
function MenuFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2 pb-1.5 pt-1">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation()
          }
        }}
        placeholder={placeholder}
        className="h-7 w-full bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/60"
        autoFocus
      />
    </div>
  )
}

function BaseMenu({
  market,
  base,
  onSelect,
  onManual,
}: {
  market: string
  base: string
  onSelect: (base: string) => void
  onManual: () => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  // Long-tail symbols need a server-side lookup; short queries filter the
  // venue's top instruments locally.
  const query = useDeferredValue(filter)
  const { items } = useMarketInstruments({
    market,
    q: query.length >= 2 ? query : undefined,
  })

  const bases = useMemo(() => {
    const ranked = new Map<string, number>()
    for (const item of items) {
      const current = ranked.get(item.base)
      if (current === undefined || item.rank < current) {
        ranked.set(item.base, item.rank)
      }
    }
    const list =
      ranked.size > 0
        ? Array.from(ranked.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([symbol]) => symbol)
        : FALLBACK_BASES
    const filtered = filter
      ? list.filter((symbol) => symbol.includes(filter))
      : list
    return filtered.slice(0, MAX_OPTIONS)
  }, [items, filter])

  return (
    <DropdownMenu>
      <SymbolTrigger symbol={base} label={t('indicatorsPage.pairBase')} />
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-56 overflow-y-auto"
      >
        <MenuFilter
          value={filter}
          onChange={setFilter}
          placeholder={t('indicatorsPage.pairBaseSearch')}
        />
        {bases.map((symbol) => (
          <DropdownMenuItem
            key={symbol}
            onClick={() => onSelect(symbol)}
            className={cn(
              'gap-2 font-mono text-xs',
              symbol === base && 'bg-accent',
            )}
          >
            <PairAvatar base={symbol} size="sm" className="size-4 text-[7px]" />
            {symbol}
          </DropdownMenuItem>
        ))}
        {bases.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-xs text-muted-foreground">
              {t('indicatorsPage.pairNoMatches')}
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Escape hatch for symbols discovery doesn't know — deliberately
            the least prominent thing in the menu. */}
        <DropdownMenuItem onClick={onManual}>
          <Keyboard className="size-3 opacity-60" />
          <span className="text-[11px] text-muted-foreground">
            {t('indicatorsPage.pairManual')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function QuoteMenu({
  market,
  base,
  quote,
  onSelect,
}: {
  market: string
  base: string
  quote: string
  onSelect: (quote: string) => void
}) {
  const { t } = useTranslation()
  // Quotes are looked up per base, so the menu only offers pairs the venue
  // actually lists (BTC-USDT yes, BTC-EUR only where it exists).
  const { items } = useMarketInstruments({
    market,
    q: base.length >= 2 ? base : undefined,
  })

  const quotes = useMemo(() => {
    const matches = items
      .filter((item) => item.base === base)
      .map((item) => item.quote)
    const unique = Array.from(new Set(matches))
    return unique.length > 0 ? unique.slice(0, MAX_OPTIONS) : FALLBACK_QUOTES
  }, [items, base])

  return (
    <DropdownMenu>
      <SymbolTrigger symbol={quote} label={t('indicatorsPage.pairQuote')} />
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-40 overflow-y-auto"
      >
        {quotes.map((symbol) => (
          <DropdownMenuItem
            key={symbol}
            onClick={() => onSelect(symbol)}
            className={cn(
              'gap-2 font-mono text-xs',
              symbol === quote && 'bg-accent',
            )}
          >
            <PairAvatar base={symbol} size="sm" className="size-4 text-[7px]" />
            {symbol}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
