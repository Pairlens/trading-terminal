// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useInfiniteQuery } from '@tanstack/react-query'
import { usePluginHost } from './use-plugin-host'
import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query'

export function usePluginInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TPageParam = unknown,
  TData = InfiniteData<TQueryFnData, TPageParam>,
>(
  options: Omit<
    UseInfiniteQueryOptions<TQueryFnData, TError, TData, QueryKey, TPageParam>,
    'queryKey'
  > & {
    queryKey: ReadonlyArray<unknown>
  },
): UseInfiniteQueryResult<TData, TError> {
  const host = usePluginHost()
  return useInfiniteQuery({
    ...options,
    queryKey: [`plugin:${host.pluginId}`, ...options.queryKey],
  } as UseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    QueryKey,
    TPageParam
  >)
}
