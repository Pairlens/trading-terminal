// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

import { OmniSearchPalette } from './omni-search-palette'
import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

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

  // The palette answers from anywhere, including while a field has focus —
  // it's the one shortcut that has to work mid-typing.
  const shortcuts = useMemo<Array<ShortcutDefinition>>(
    () => [
      {
        commandId: 'general.commandPalette',
        action: () => setIsOpen(true),
        allowInInput: true,
      },
    ],
    [],
  )
  useKeyboardShortcuts(shortcuts)

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
