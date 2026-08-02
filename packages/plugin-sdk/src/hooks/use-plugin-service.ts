// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'
import { usePluginHost } from './use-plugin-host'

export function usePluginService<T = unknown>(name: string): T | null {
  const host = usePluginHost()
  return useSyncExternalStore(
    (cb) => host.onServiceChange(name, cb),
    () => host.getService<T>(name),
  )
}
