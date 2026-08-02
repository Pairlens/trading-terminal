// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { ReactNode } from 'react'

/**
 * Wrapper kept for API compatibility. Per-pane stream providers are now
 * handled by PaneContextProvider → PaneStreamProvider, which wraps each
 * pair-dependent pane with its own ChartTerminalProvider instance.
 */
export function PaneStreamRegistry({ children }: { children: ReactNode }) {
  return <>{children}</>
}
