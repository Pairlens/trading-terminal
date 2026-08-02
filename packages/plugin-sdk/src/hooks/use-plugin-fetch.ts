// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useRef } from 'react'
import { usePluginHost } from './use-plugin-host'

export function usePluginFetch() {
  const host = usePluginHost()
  const appServerUrl = String(host.config['appServerUrl'] ?? '')

  // Capture authToken in a ref so the callback doesn't depend on host.config
  const authTokenRef = useRef(host.config['authToken'])
  authTokenRef.current = host.config['authToken']

  return useCallback(
    async (path: string, init?: RequestInit) => {
      const headers = {
        ...(init?.headers as Record<string, string>),
      } as Record<string, string>
      const authToken = authTokenRef.current
      if (typeof authToken === 'function') {
        headers['Authorization'] = `Bearer ${await authToken()}`
      }
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] ??= 'application/json'
      }
      return fetch(`${appServerUrl}${path}`, { ...init, headers })
    },
    [appServerUrl],
  )
}
