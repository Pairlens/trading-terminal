// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which Discovery section a pane is rendering inside, or null when it is not
 * on Discovery at all.
 *
 * A section is an asset class, and a few panes are class-aware: the markets
 * scanner opens on the section's class rather than on whatever the user last
 * picked somewhere else. Panes read this instead of the workspace config so
 * the same pane keeps working unchanged on a pair route or in a custom
 * workspace, where there is no section and the answer is null.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'

const DiscoverySectionContext = createContext<DiscoverySectionId | null>(null)

export function DiscoverySectionProvider({
  section,
  children,
}: {
  section: DiscoverySectionId
  children: ReactNode
}) {
  return (
    <DiscoverySectionContext value={section}>
      {children}
    </DiscoverySectionContext>
  )
}

/** The active section, or null outside Discovery. Never throws: most panes
 * render on both surfaces and "no section" is a real answer, not an error. */
export function useDiscoverySection(): DiscoverySectionId | null {
  return useContext(DiscoverySectionContext)
}
