// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePersistedState } from '@/hooks/use-persisted-state'

const DEFAULT_REGISTRY_URL = 'https://registry.pairlens.finance'

export type RegistryMode = 'official' | 'custom'

export type RegistrySettings = {
  mode: RegistryMode
  customUrl: string
  customAcknowledged: boolean
}

const DEFAULT_SETTINGS: RegistrySettings = {
  mode: 'official',
  customUrl: '',
  customAcknowledged: false,
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function useRegistrySettings() {
  const [settings, setSettings] = usePersistedState<RegistrySettings>(
    'plugin-registry-settings',
    DEFAULT_SETTINGS,
  )

  const customUrl = settings.customUrl.trim()
  const effectiveUrl =
    settings.mode === 'custom' &&
    customUrl &&
    settings.customAcknowledged &&
    isValidUrl(customUrl)
      ? customUrl
      : DEFAULT_REGISTRY_URL

  return {
    settings,
    setSettings,
    effectiveUrl,
    defaultUrl: DEFAULT_REGISTRY_URL,
  }
}
