// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext } from 'react'
import type { ServiceRegistry } from './service-registry'

export const ServiceRegistryContext = createContext<ServiceRegistry | null>(
  null,
)

export function useServiceRegistry(): ServiceRegistry {
  const registry = useContext(ServiceRegistryContext)
  if (!registry) {
    throw new Error(
      'useServiceRegistry must be used within ServiceRegistryContext.Provider',
    )
  }
  return registry
}
