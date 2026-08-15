// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discovery's section tabs, live: which ones this install has, in the order
 * the trader dragged them into.
 *
 * The rules are pure and live in `discovery-sections.ts`. This is the wiring —
 * the template registry for availability, persisted state for order — so a
 * family plugin toggled in the Plugin Store adds or removes its tab without a
 * reload.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { DiscoverySection } from '@/lib/layout/workspaces/discovery-sections'
import {
  availableSections,
  orderSections,
} from '@/lib/layout/workspaces/discovery-sections'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { workspaceTemplateRegistry } from '@/lib/workspace-store/workspace-template-registry'

/** Persisted tab order. Advisory — see `orderSections`. */
export const SECTION_ORDER_KEY = 'discovery.sectionOrder'

export function useDiscoverySections(): {
  sections: Array<DiscoverySection>
  reorder: (fromId: string, toId: string) => void
} {
  const registryVersion = useSyncExternalStore(
    workspaceTemplateRegistry.subscribe,
    workspaceTemplateRegistry.getSnapshot,
    workspaceTemplateRegistry.getSnapshot,
  )
  const [order, setOrder] = usePersistedState<Array<string>>(
    SECTION_ORDER_KEY,
    [],
  )

  const sections = useMemo(() => {
    void registryVersion
    const registered = new Set(
      workspaceTemplateRegistry.getTemplates().map((t) => t.id),
    )
    return orderSections(availableSections(registered), order)
  }, [registryVersion, order])

  /**
   * Move `fromId` into `toId`'s slot. Persists the FULL resolved order, not
   * the moved pair: a partial order would let a section that happens to be
   * unavailable today lose its place for good once its plugin comes back.
   */
  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      const ids = sections.map((s) => s.id as string)
      const from = ids.indexOf(fromId)
      const to = ids.indexOf(toId)
      if (from < 0 || to < 0) return
      ids.splice(to, 0, ...ids.splice(from, 1))
      setOrder(ids)
    },
    [sections, setOrder],
  )

  return { sections, reorder }
}
