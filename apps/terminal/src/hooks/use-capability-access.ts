// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import type {
  CapabilityAccessResult,
  CapabilityId,
} from '@pairlens/plugin-system'
import { usePairlens } from '@/lib/pairlens-provider'

export function useCapabilityAccess(
  capability: CapabilityId,
  market?: string,
): CapabilityAccessResult {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () => pluginManager.getCapabilityAccess(capability, market),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion, capability, market],
  )
}
