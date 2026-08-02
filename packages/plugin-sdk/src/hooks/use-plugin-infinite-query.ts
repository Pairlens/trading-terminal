// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useInfiniteQuery } from '@tanstack/react-query'
import { usePluginHost } from './use-plugin-host'
import type {
  QueryKey,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query'

export function usePluginInfiniteQuery<
  TData = unknown,
  TError = Error,
  TPageParam = unknown,
>(
  options: Omit<
    UseInfiniteQueryOptions<TData, TError, TData, QueryKey, TPageParam>,
    'queryKey'
  > & {
    queryKey: ReadonlyArray<unknown>
  },
): UseInfiniteQueryResult<TData, TError> {
  const host = usePluginHost()
  return useInfiniteQuery({
    ...options,
    queryKey: [`plugin:${host.pluginId}`, ...options.queryKey],
  } as UseInfiniteQueryOptions<TData, TError, TData, QueryKey, TPageParam>)
}
