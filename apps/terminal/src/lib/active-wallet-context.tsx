// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { useCredentialsStore } from '@/stores/credentials-store'

export type ActiveWalletState = {
  walletId: string
  market: string
  type?: 'credential' | 'wallet'
}

type ActiveWalletValue = {
  activeWallet: ActiveWalletState | null
  setActiveWallet: (wallet: ActiveWalletState | null) => void
}

const ActiveWalletContext = createContext<ActiveWalletValue>({
  activeWallet: null,
  setActiveWallet: () => {},
})

export function ActiveWalletProvider({
  initial,
  children,
}: {
  initial: ActiveWalletState | null
  children: ReactNode
}) {
  const [activeWallet, setActiveWallet] = useState(initial)

  // Synchronous reset during render when route params change (no useEffect lag)
  const prevInitialRef = useRef(initial)
  if (
    initial?.walletId !== prevInitialRef.current?.walletId ||
    initial?.market !== prevInitialRef.current?.market
  ) {
    prevInitialRef.current = initial
    setActiveWallet(initial)
  }

  // Auto-select first credential for market when only one exists
  const credentials = useCredentialsStore((s) => s.credentials)
  const loaded = useCredentialsStore((s) => s.loaded)
  useEffect(() => {
    if (!loaded || activeWallet) return
    // No wallet selected — check if there's exactly one credential for any market
    // We can't auto-select without a market context, so skip if initial is null
  }, [loaded, activeWallet, credentials])

  const value = useMemo(
    () => ({ activeWallet, setActiveWallet }),
    [activeWallet],
  )

  return <ActiveWalletContext value={value}>{children}</ActiveWalletContext>
}

export function useActiveWallet() {
  return useContext(ActiveWalletContext)
}
