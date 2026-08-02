// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type ActivePairState = {
  pairKey: string
  market: string
}

type ActivePairValue = {
  activePair: ActivePairState | null
  setActivePair: (pair: ActivePairState | null) => void
}

const ActivePairContext = createContext<ActivePairValue>({
  activePair: null,
  setActivePair: () => {},
})

export function ActivePairProvider({
  initial,
  children,
}: {
  initial: ActivePairState | null
  children: ReactNode
}) {
  const [activePair, setActivePair] = useState(initial)

  // Synchronous reset during render when route params change (no useEffect lag)
  const prevInitialRef = useRef(initial)
  if (
    initial?.pairKey !== prevInitialRef.current?.pairKey ||
    initial?.market !== prevInitialRef.current?.market
  ) {
    prevInitialRef.current = initial
    setActivePair(initial)
  }

  const value = useMemo(() => ({ activePair, setActivePair }), [activePair])

  return <ActivePairContext value={value}>{children}</ActivePairContext>
}

export function useActivePair() {
  return useContext(ActivePairContext)
}
