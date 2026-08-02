// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useQuery } from '@tanstack/react-query'
import { useRegistrySettings } from './use-registry-settings'
import type {
  RegistryFeaturedResponse,
  RegistryListResponse,
} from '@pairlens/shared/registry-types'

export function useRegistryPlugins(category?: string) {
  const { effectiveUrl } = useRegistrySettings()

  return useQuery<RegistryListResponse>({
    queryKey: ['registry', 'plugins', category, effectiveUrl],
    queryFn: async () => {
      const params = category ? `?category=${encodeURIComponent(category)}` : ''
      const res = await fetch(`${effectiveUrl}/api/plugins${params}`)
      if (!res.ok) throw new Error(`Registry error: ${res.status}`)
      return res.json() as Promise<RegistryListResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export function useRegistryFeatured() {
  const { effectiveUrl } = useRegistrySettings()

  return useQuery<RegistryFeaturedResponse>({
    queryKey: ['registry', 'featured', effectiveUrl],
    queryFn: async () => {
      const res = await fetch(`${effectiveUrl}/api/plugins/featured`)
      if (!res.ok) throw new Error(`Registry error: ${res.status}`)
      return res.json() as Promise<RegistryFeaturedResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
