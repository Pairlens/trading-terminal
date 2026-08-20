// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useCallback, useContext, useMemo } from 'react'

import { useLayout } from './context'
import {
  useOptionalWorkspaceVariables,
  useWorkspaceVarValue,
} from './workspace-variables-context'
import type { ReactNode } from 'react'
import type { ActiveWalletState } from '@/lib/active-wallet-context'
import { useActivePair } from '@/lib/active-pair-context'
import { useActiveWallet } from '@/lib/active-wallet-context'
import {
  ChartTerminalProvider,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

type ActivePairState = { pairKey: string; market: string }

type PaneContextValue = {
  paneId: string
  resolvedPair: ActivePairState | null
  pairSource: 'override' | 'variable' | 'global' | null
  /** Internal variable name (e.g. '$var1') — use boundVariableLabel for display. */
  boundVariableName: string | undefined
  /** Human-readable label for the bound variable (e.g. 'Coin 1'). */
  boundVariableLabel: string | undefined
  resolvedWallet: ActiveWalletState | null
  walletSource: 'override' | 'variable' | 'global' | null
  boundWalletVariableName: string | undefined
  resolvedTimeframe: string | null
  boundTimeframeVariableName: string | undefined
  setPaneOverride: (slot: string, value: unknown) => void
  clearPaneOverride: (slot: string) => void
  setPaneBinding: (slot: string, variableName: string) => void
  clearPaneBinding: (slot: string) => void
  setVariableValue: (value: unknown) => void
}

export const PaneContext = createContext<PaneContextValue | null>(null)

/** Find a pane instance by ID across the layout tree. */
function findPaneInstance(
  layout: {
    columns: Array<{
      cells: Array<{
        panes: Array<{
          id: string
          bindings?: Record<string, string>
          overrides?: Record<string, unknown>
        }>
      }>
    }>
  },
  paneId: string,
) {
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      const pane = cell.panes.find((p) => p.id === paneId)
      if (pane) return pane
    }
  }
  return null
}

export function PaneContextProvider({
  paneId,
  children,
}: {
  paneId: string
  paneType: string
  children: ReactNode
}) {
  const { layout, dispatch } = useLayout()
  const { activePair } = useActivePair()
  const { activeWallet } = useActiveWallet()
  const varCtx = useOptionalWorkspaceVariables()

  const pane = findPaneInstance(layout, paneId)

  // Read override from layout state
  const override = pane?.overrides?.['active-pair'] as
    | ActivePairState
    | undefined

  // Read variable binding from layout state, then resolve from Zustand store
  const boundVarName = pane?.bindings?.['active-pair']
  const varValue = useWorkspaceVarValue(boundVarName) as
    | ActivePairState
    | undefined

  // Resolve the human-readable label for the bound variable
  const boundVarLabel = useMemo(() => {
    if (!boundVarName || !varCtx) return undefined
    return (
      varCtx.variables.find((v) => v.name === boundVarName)?.label ??
      boundVarName
    )
  }, [boundVarName, varCtx])

  // Resolution chain: override > variable > global
  const { resolvedPair, pairSource } = useMemo(() => {
    if (override?.pairKey && override?.market) {
      return { resolvedPair: override, pairSource: 'override' as const }
    }
    if (varValue?.pairKey && varValue?.market) {
      return { resolvedPair: varValue, pairSource: 'variable' as const }
    }
    if (activePair) {
      return { resolvedPair: activePair, pairSource: 'global' as const }
    }
    return { resolvedPair: null, pairSource: null }
  }, [override, varValue, activePair])

  // ── Wallet resolution (parallels pair) ─────────────────────────────
  const walletOverride = pane?.overrides?.['active-wallet'] as
    | ActiveWalletState
    | undefined
  const boundWalletVarName = pane?.bindings?.['active-wallet']
  const walletVarValue = useWorkspaceVarValue(boundWalletVarName) as
    | ActiveWalletState
    | undefined

  const { resolvedWallet, walletSource } = useMemo(() => {
    if (walletOverride?.walletId && walletOverride?.market) {
      return {
        resolvedWallet: walletOverride,
        walletSource: 'override' as const,
      }
    }
    if (walletVarValue?.walletId && walletVarValue?.market) {
      return {
        resolvedWallet: walletVarValue,
        walletSource: 'variable' as const,
      }
    }
    if (activeWallet) {
      return { resolvedWallet: activeWallet, walletSource: 'global' as const }
    }
    return { resolvedWallet: null, walletSource: null }
  }, [walletOverride, walletVarValue, activeWallet])

  // ── Timeframe resolution ────────────────────────────────────────────
  const timeframeOverride = pane?.overrides?.['active-timeframe'] as
    | string
    | undefined
  const boundTimeframeVarName = pane?.bindings?.['active-timeframe']
  const timeframeVarValue = useWorkspaceVarValue(boundTimeframeVarName) as
    | string
    | undefined

  const resolvedTimeframe = useMemo(() => {
    if (timeframeOverride) return timeframeOverride
    if (timeframeVarValue) return timeframeVarValue
    return null
  }, [timeframeOverride, timeframeVarValue])

  const setPaneOverride = useCallback(
    (slot: string, value: unknown) => {
      dispatch({ type: 'SET_PANE_OVERRIDE', paneId, slot, value })
    },
    [dispatch, paneId],
  )

  const clearPaneOverride = useCallback(
    (slot: string) => {
      dispatch({ type: 'CLEAR_PANE_OVERRIDE', paneId, slot })
    },
    [dispatch, paneId],
  )

  const setPaneBinding = useCallback(
    (slot: string, variableName: string) => {
      dispatch({ type: 'SET_PANE_BINDING', paneId, slot, variableName })
    },
    [dispatch, paneId],
  )

  const clearPaneBinding = useCallback(
    (slot: string) => {
      dispatch({ type: 'CLEAR_PANE_BINDING', paneId, slot })
    },
    [dispatch, paneId],
  )

  const setVariableValue = useCallback(
    (value: unknown) => {
      if (boundVarName && varCtx) {
        varCtx.store.getState().setVariableValue(boundVarName, value)
      }
    },
    [boundVarName, varCtx],
  )

  // A pane holding its own pair holds its own VENUE with it: pair and venue
  // are one instrument, and a pane whose chart kept a separately persisted
  // venue would chart OKX under a `BTC-USDT on Binance` badge. Switching venue
  // from inside such a pane (the venue ladder does it, so does the chart's own
  // no-data state) lands here rather than in the chart's local state.
  const setPaneMarket = useCallback(
    (market: string) => {
      if (!resolvedPair || resolvedPair.market === market) return
      const next = { pairKey: resolvedPair.pairKey, market }
      if (pairSource === 'variable') setVariableValue(next)
      else if (pairSource === 'override') {
        dispatch({
          type: 'SET_PANE_OVERRIDE',
          paneId,
          slot: 'active-pair',
          value: next,
        })
      }
    },
    [resolvedPair, pairSource, setVariableValue, dispatch, paneId],
  )

  const value = useMemo<PaneContextValue>(
    () => ({
      paneId,
      resolvedPair,
      pairSource,
      boundVariableName: boundVarName,
      boundVariableLabel: boundVarLabel,
      resolvedWallet,
      walletSource,
      boundWalletVariableName: boundWalletVarName,
      resolvedTimeframe,
      boundTimeframeVariableName: boundTimeframeVarName,
      setPaneOverride,
      clearPaneOverride,
      setPaneBinding,
      clearPaneBinding,
      setVariableValue,
    }),
    [
      paneId,
      resolvedPair,
      pairSource,
      boundVarName,
      boundVarLabel,
      resolvedWallet,
      walletSource,
      boundWalletVarName,
      resolvedTimeframe,
      boundTimeframeVarName,
      setPaneOverride,
      clearPaneOverride,
      setPaneBinding,
      clearPaneBinding,
      setVariableValue,
    ],
  )

  return (
    <PaneContext value={value}>
      <PaneStreamProvider
        paneId={paneId}
        resolvedPair={resolvedPair}
        pairSource={pairSource}
        resolvedTimeframe={resolvedTimeframe}
        onMarketChange={setPaneMarket}
      >
        {children}
      </PaneStreamProvider>
    </PaneContext>
  )
}

/**
 * Wraps pane children with a ChartTerminalProvider when the pane has a
 * resolved pair but no stream data is available from an ancestor provider.
 *
 * On the Pair page the page-level ChartTerminalAutoProvider already provides
 * stream data for the global pair, so panes resolving to the global pair
 * reuse that provider (no duplicate created).
 */
function PaneStreamProvider({
  paneId,
  resolvedPair,
  pairSource,
  resolvedTimeframe,
  onMarketChange,
  children,
}: {
  paneId: string
  resolvedPair: ActivePairState | null
  pairSource: 'override' | 'variable' | 'global' | null
  resolvedTimeframe: string | null
  onMarketChange: (market: string) => void
  children: ReactNode
}) {
  // Presence check only — chart config changes on user interaction, unlike
  // the stream contexts which change on every WS message and would re-render
  // every pane wrapper per tick.
  const existingProvider = useOptionalChartConfig()
  const { markets, defaultMarket } = useAvailableMarkets()

  // If there's already a ChartTerminalProvider above us for the global pair,
  // and this pane resolves to that same pair with no timeframe override,
  // skip creating a duplicate.
  if (existingProvider && pairSource === 'global' && !resolvedTimeframe) {
    return <>{children}</>
  }

  // No pair resolved yet — nothing to provide
  if (!resolvedPair) {
    return <>{children}</>
  }

  // A pinned pane's venue comes from the pin, not from the pane's own
  // persisted preference: the pin is the instrument, and the two disagreeing
  // is how a pane ends up charting a venue nothing on it names.
  const owned = pairSource === 'override' || pairSource === 'variable'

  return (
    <ChartTerminalProvider
      pairKey={resolvedPair.pairKey}
      markets={markets}
      defaultMarket={resolvedPair.market ?? defaultMarket}
      defaultTimeframe={resolvedTimeframe ?? undefined}
      stateScope={paneId}
      marketOverride={owned ? resolvedPair.market : undefined}
      onMarketChange={owned ? onMarketChange : undefined}
    >
      {children}
    </ChartTerminalProvider>
  )
}

/** Get the resolved pair for this pane — falls back through override → variable → global → null. */
export function usePanePair(): ActivePairState | null {
  const paneCtx = useContext(PaneContext)
  const { activePair } = useActivePair()

  // If not within a PaneContextProvider, fall back to global active pair
  if (!paneCtx) return activePair

  return paneCtx.resolvedPair
}

/** Get the resolved wallet for this pane — falls back through override → variable → global → null. */
export function usePaneWallet(): ActiveWalletState | null {
  const paneCtx = useContext(PaneContext)
  const { activeWallet } = useActiveWallet()

  // If not within a PaneContextProvider, fall back to global active wallet
  if (!paneCtx) return activeWallet

  return paneCtx.resolvedWallet
}

/** Full pane context — only available inside PaneContextProvider. */
export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext)
  if (!ctx)
    throw new Error('usePaneContext must be used within a PaneContextProvider')
  return ctx
}
