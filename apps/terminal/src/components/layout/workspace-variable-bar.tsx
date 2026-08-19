// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useState } from 'react'
import {
  CandlestickChart,
  ChevronDown,
  Clock,
  Search,
  Settings2,
  Type,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'zustand'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import { Input } from '@pairlens/ui/components/ui/input'
import type { WorkspaceVariableDefinition } from '@/lib/layout/types'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import {
  DEFAULT_TIMEFRAME,
  VARIABLE_TIMEFRAME_OPTIONS,
} from '@/lib/layout/variable-utils'
import { PairSearchResults } from '@/components/pair-picker/pair-search-results'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useWorkspaceVariables } from '@/lib/layout/workspace-variables-context'

/**
 * Horizontal bar rendering one control per workspace variable, plus a
 * manage-variables shortcut. Only visible when the workspace has variables.
 */
export function WorkspaceVariableBar({
  onManageVariables,
}: {
  onManageVariables?: () => void
}) {
  const { t } = useTranslation()
  const { variables, store } = useWorkspaceVariables()

  if (variables.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-b border-(--pane-rule) px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {variables.map((v) => (
          <VariableControl key={v.name} variable={v} store={store} />
        ))}
      </div>
      {onManageVariables && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onManageVariables}
          aria-label={t('workspace.variables.manage')}
          title={t('workspace.variables.manage')}
        >
          <Settings2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

const VariableControl = memo(function VariableControl({
  variable,
  store,
}: {
  variable: WorkspaceVariableDefinition
  store: ReturnType<typeof useWorkspaceVariables>['store']
}) {
  const value = useStore(store, (s) => s.values[variable.name])
  const setValue = useStore(store, (s) => s.setVariableValue)

  switch (variable.type) {
    case 'pair':
      return (
        <PairVariableDropdown
          variable={variable}
          value={value as { pairKey: string; market: string } | undefined}
          onChange={(v) => setValue(variable.name, v)}
        />
      )
    case 'timeframe':
      return (
        <TimeframeVariableDropdown
          variable={variable}
          value={value as string | undefined}
          onChange={(v) => setValue(variable.name, v)}
        />
      )
    case 'wallet':
      return (
        <WalletVariableDropdown
          variable={variable}
          value={value as { walletId: string; market: string } | undefined}
          onChange={(v) => setValue(variable.name, v)}
        />
      )
    case 'string':
      return (
        <StringVariableInput
          variable={variable}
          value={value as string | undefined}
          onChange={(v) => setValue(variable.name, v)}
        />
      )
    default:
      return null
  }
})

function PairVariableDropdown({
  variable,
  value,
  onChange,
}: {
  variable: WorkspaceVariableDefinition
  value: { pairKey: string; market: string } | undefined
  onChange: (value: { pairKey: string; market: string }) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  const { markets, defaultMarket } = useAvailableMarkets()
  const [selectedMarket, setSelectedMarket] = useState(
    value?.market ?? defaultMarket,
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) {
        // Re-sync the market tab with the current value each time it opens
        setSelectedMarket(value?.market ?? defaultMarket)
        setSearchValue('')
      }
    },
    [value?.market, defaultMarket],
  )

  const handleSelect = useCallback(
    (entry: PairEntry) => {
      const symbol = entry.symbol
      if (entry.assetClass) {
        setAssetClassMap((prev) => ({ ...prev, [symbol]: entry.assetClass! }))
      }
      onChange({ pairKey: symbol, market: selectedMarket })
      setOpen(false)
      setSearchValue('')
    },
    [onChange, setAssetClassMap, selectedMarket],
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs font-normal"
          />
        }
      >
        <CandlestickChart className="size-3 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">
          {variable.label}
        </span>
        <span className="font-mono">
          {value?.pairKey ?? t('common.select')}
        </span>
        {value?.market && (
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            {value.market.toUpperCase()}
          </span>
        )}
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('layout.searchPairs')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-7 pl-7 text-xs"
              autoFocus
            />
          </div>
          {markets.length > 1 && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <span className="py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                {t('workspace.variables.market')}
              </span>
              <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto">
                {markets.map((m) => (
                  <button
                    key={m.value}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
                      selectedMarket === m.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                    }`}
                    onClick={() => setSelectedMarket(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <PairSearchResults
            searchValue={searchValue}
            watchedSymbols={watchedSymbols}
            onSelect={handleSelect}
            maxResults={10}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TimeframeVariableDropdown({
  variable,
  value,
  onChange,
}: {
  variable: WorkspaceVariableDefinition
  value: string | undefined
  onChange: (value: string) => void
}) {
  const fallback =
    typeof variable.defaultValue === 'string'
      ? variable.defaultValue
      : DEFAULT_TIMEFRAME

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="size-3 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">
        {variable.label}
      </span>
      <Select
        value={value ?? fallback}
        items={VARIABLE_TIMEFRAME_OPTIONS}
        onValueChange={(v) => {
          if (v) onChange(v)
        }}
      >
        <SelectTrigger className="h-7 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VARIABLE_TIMEFRAME_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function WalletVariableDropdown({
  variable,
  value,
  onChange,
}: {
  variable: WorkspaceVariableDefinition
  value: { walletId: string; market: string } | undefined
  onChange: (value: { walletId: string; market: string }) => void
}) {
  const { t } = useTranslation()
  const credentials = useCredentialsStore((s) => s.credentials)

  if (credentials.length === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <Wallet className="size-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {variable.label}
        </span>
        <span className="text-xs text-muted-foreground/60">
          {t('workspace.variables.noWallets')}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Wallet className="size-3 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">
        {variable.label}
      </span>
      <Select
        value={value?.walletId ?? ''}
        items={Object.fromEntries(credentials.map((c) => [c.id, c.label]))}
        onValueChange={(id) => {
          const cred = credentials.find((c) => c.id === id)
          if (cred) onChange({ walletId: cred.id, market: cred.market })
        }}
      >
        <SelectTrigger className="h-7 w-auto min-w-24 text-xs">
          <SelectValue placeholder={t('workspace.variables.selectWallet')} />
        </SelectTrigger>
        <SelectContent>
          {credentials.map((cred) => (
            <SelectItem key={cred.id} value={cred.id}>
              <span className="flex items-center gap-1.5">
                {cred.label}
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                  {cred.market.toUpperCase()}
                </span>
                <span
                  className={`text-[10px] ${cred.mode === 'live' ? 'text-green-500' : 'text-amber-500'}`}
                >
                  {cred.mode.toUpperCase()}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * String variables edit through a local draft committed on blur/Enter —
 * writing per keystroke would re-render every bound pane on each key.
 */
function StringVariableInput({
  variable,
  value,
  onChange,
}: {
  variable: WorkspaceVariableDefinition
  value: string | undefined
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value ?? '')

  // External updates (another window, reconcile) refresh the draft
  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commit = useCallback(() => {
    if (draft !== (value ?? '')) onChange(draft)
  }, [draft, value, onChange])

  return (
    <div className="flex items-center gap-1.5">
      <Type className="size-3 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">
        {variable.label}
      </span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value ?? '')
            e.currentTarget.blur()
          }
        }}
        className="h-7 w-24 text-xs"
        placeholder={variable.label}
      />
    </div>
  )
}
