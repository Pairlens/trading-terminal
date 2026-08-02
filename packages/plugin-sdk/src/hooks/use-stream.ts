// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

import { usePluginHost } from './use-plugin-host'
import type { CapabilityId } from '@pairlens/plugin-system'

type UseCapabilityStreamResult = {
  status: 'connected' | 'disconnected' | 'error'
}

export function useCapabilityStream<T = unknown>(
  capability: CapabilityId,
  params: Record<string, unknown>,
  callback: (data: T) => void,
): UseCapabilityStreamResult {
  const host = usePluginHost()
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>(
    'disconnected',
  )
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    setStatus('connected')
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = host.subscribeCapability(
        capability,
        paramsRef.current,
        (data) => callbackRef.current(data as T),
      )
    } catch {
      setStatus('error')
    }
    return () => {
      unsubscribe?.()
      setStatus('disconnected')
    }
  }, [host, capability])

  return { status }
}
