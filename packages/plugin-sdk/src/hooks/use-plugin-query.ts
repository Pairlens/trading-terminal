// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useQuery } from '@tanstack/react-query'
import { usePluginHost } from './use-plugin-host'
import type { UseQueryOptions, UseQueryResult } from '@tanstack/react-query'

export function usePluginQuery<TData = unknown, TError = Error>(
  options: Omit<UseQueryOptions<TData, TError>, 'queryKey'> & {
    queryKey: ReadonlyArray<unknown>
  },
): UseQueryResult<TData, TError> {
  const host = usePluginHost()
  return useQuery<TData, TError>({
    ...options,
    queryKey: [`plugin:${host.pluginId}`, ...options.queryKey],
  })
}
