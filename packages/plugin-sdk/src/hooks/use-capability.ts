// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

import { usePluginHost } from './use-plugin-host'
import type { CapabilityId } from '@pairlens/plugin-system'

type UseCapabilityResult<T> = {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useCapability<T = unknown>(
  capability: CapabilityId,
  params: Record<string, unknown>,
): UseCapabilityResult<T> {
  const host = usePluginHost()
  const [data, setData] = useState<T | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const paramsRef = useRef(params)
  paramsRef.current = params

  const execute = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await host.executeCapability(capability, paramsRef.current)
      setData(result as T)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [host, capability])

  useEffect(() => {
    void execute()
  }, [execute])

  return { data, isLoading, error, refetch: execute }
}
