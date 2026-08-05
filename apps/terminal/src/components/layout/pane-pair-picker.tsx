// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Trans, useTranslation } from 'react-i18next'
import { useCallback, useState } from 'react'
import { CandlestickChart, Search, Unlink, Variable } from 'lucide-react'

import { Input } from '@pairlens/ui/components/ui/input'

import { PairSearchResults } from '@/components/pair-picker/pair-search-results'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePaneContext } from '@/lib/layout/pane-context'
import { useOptionalWorkspaceVariables } from '@/lib/layout/workspace-variables-context'

/**
 * Inline pair picker shown inside panes that need a pair but don't have one.
 * Two-stage rendering (P6): collapsed button → expanded search.
 *
 * When the pane is bound to a workspace variable, selecting a pair sets the
 * variable value (affecting all panes bound to the same variable). Otherwise,
 * it sets a pane-level override.
 *
 * When workspace variables are available, shows all pair variables as
 * selectable binding options so the user can switch which variable this
 * pane tracks.
 */
export function PanePairPicker() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  const {
    setPaneOverride,
    setVariableValue,
    setPaneBinding,
    clearPaneBinding,
    boundVariableName,
    boundVariableLabel,
  } = usePaneContext()

  const { markets, defaultMarket } = useAvailableMarkets()
  const [selectedMarket, setSelectedMarket] = useState(defaultMarket)

  const varCtx = useOptionalWorkspaceVariables()
  const pairVars = varCtx?.variables.filter((v) => v.type === 'pair') ?? []

  const isBoundToVariable = !!boundVariableName
  const displayLabel = boundVariableLabel ?? boundVariableName

  const handleSelect = useCallback(
    (symbol: string, assetClass?: string) => {
      if (assetClass) {
        setAssetClassMap((prev) => ({ ...prev, [symbol]: assetClass }))
      }
      const pairValue = { pairKey: symbol, market: selectedMarket }
      if (isBoundToVariable) {
        setVariableValue(pairValue)
      } else {
        setPaneOverride('active-pair', pairValue)
      }
      setExpanded(false)
      setSearchValue('')
    },
    [
      isBoundToVariable,
      setVariableValue,
      setPaneOverride,
      setAssetClassMap,
      selectedMarket,
    ],
  )

  const handleUnbind = useCallback(() => {
    clearPaneBinding('active-pair')
  }, [clearPaneBinding])

  const handleBindToVariable = useCallback(
    (varName: string) => {
      setPaneBinding('active-pair', varName)
    },
    [setPaneBinding],
  )

  if (!expanded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <CandlestickChart className="size-8 text-muted-foreground/20" />

        {/* Variable binding selector — show all pair variables */}
        {pairVars.length > 0 && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
              {t('layout.panePicker.bindToVariable')}
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {pairVars.map((v) => {
                const isActive = boundVariableName === v.name
                return (
                  <button
                    key={v.name}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                    }`}
                    onClick={() => handleBindToVariable(v.name)}
                  >
                    <Variable className="size-3" />
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isBoundToVariable && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Variable className="size-3" />
            {/* <Trans> rather than a plain t(): the variable name is bolded
                inside the sentence, and its position moves per language. The
                alternative — splitting the string at the placeholder — is the
                concatenation trap. */}
            <span>
              <Trans
                i18nKey="layout.panePicker.boundTo"
                values={{ variable: displayLabel }}
                components={{ b: <b className="font-medium" /> }}
              />
            </span>
          </div>
        )}
        {/* Market selector — shown in collapsed state when multiple markets available */}
        {markets.length > 1 && (
          <div className="flex w-full max-w-md flex-col items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
              {t('layout.panePicker.market')}
            </span>
            <div className="flex max-h-20 flex-wrap justify-center gap-1 overflow-y-auto">
              {markets.map((m) => (
                <button
                  key={m.value}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors ${
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
        <button
          className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          <Search className="size-3.5" />
          {isBoundToVariable
            ? t('layout.panePicker.setPair', { variable: displayLabel })
            : t('layout.panePicker.selectPair')}
        </button>
        {isBoundToVariable && (
          <div className="flex flex-col items-center gap-2">
            <p className="max-w-[220px] text-center text-[10px] leading-tight text-muted-foreground/40">
              {t('layout.panePicker.bindingHint', { variable: displayLabel })}
            </p>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              onClick={handleUnbind}
            >
              <Unlink className="size-3" />
              {t('layout.panePicker.unbindFromVariable')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2">
        {isBoundToVariable && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Variable className="size-3" />
            <Trans
              i18nKey="layout.panePicker.settingForAllPanes"
              values={{ variable: displayLabel }}
              components={{ b: <b className="font-medium" /> }}
            />
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('layout.searchPairs')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-8 pl-7 text-sm"
            autoFocus
          />
        </div>
        {markets.length > 1 && (
          <div className="mt-2 flex items-start gap-1.5">
            <span className="py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
              {t('layout.panePicker.market')}
            </span>
            <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto">
              {markets.map((m) => (
                <button
                  key={m.value}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors ${
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
      <div className="flex-1 overflow-y-auto py-1">
        <PairSearchResults
          searchValue={searchValue}
          watchedSymbols={watchedSymbols}
          onSelect={handleSelect}
          maxResults={12}
        />
      </div>
      <div className="border-t px-3 py-1.5">
        <button
          className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setExpanded(false)
            setSearchValue('')
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
