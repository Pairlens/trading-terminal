// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useQuery } from '@tanstack/react-query'

import { usePairlens } from '@/lib/pairlens-provider'
import { resolveUrl } from '@/lib/api'

export function useSymbolLogo(
  symbol: string,
  assetClass?: string,
): string | null {
  const { pluginManager, pluginsReady } = usePairlens()

  const { data } = useQuery({
    queryKey: ['symbol-logo', symbol.toLowerCase(), assetClass ?? 'crypto'],
    queryFn: async () => {
      const params: Record<string, unknown> = { symbol }
      if (assetClass) params['assetClass'] = assetClass
      const result = (await pluginManager.execute(
        'market-data:symbol-logo',
        params,
      )) as { url: string | null }
      return result?.url ? (resolveUrl(result.url) ?? null) : null
    },
    enabled: pluginsReady && symbol.length > 0,
    staleTime: 60 * 60_000, // 1 hour
    gcTime: 24 * 60 * 60_000, // 24 hours
    retry: false,
  })

  return data ?? null
}
