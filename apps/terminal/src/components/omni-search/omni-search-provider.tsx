// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

import { OmniSearchPalette } from './omni-search-palette'

type OmniSearchContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
}

const OmniSearchContext = createContext<OmniSearchContextValue | null>(null)

export function OmniSearchProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  // Global Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <OmniSearchContext.Provider value={{ isOpen, open, close }}>
      {children}
      <OmniSearchPalette open={isOpen} onOpenChange={setIsOpen} />
    </OmniSearchContext.Provider>
  )
}

export function useOmniSearch() {
  const context = useContext(OmniSearchContext)
  if (!context) {
    throw new Error('useOmniSearch must be used within OmniSearchProvider')
  }
  return context
}
