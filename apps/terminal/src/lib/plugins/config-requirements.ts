// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { getLedgerEntry } from './plugin-ledger'
import type { PluginManifest } from '@pairlens/plugin-system'
import i18n from '@/lib/i18n'
import { localizedText } from '@/lib/plugin-text'

/**
 * Required config fields (declared in the manifest) that have no value in the
 * device ledger. A plugin with unmet required config cannot activate — e.g.
 * BYOK inference plugins without an API key — and the UI should say so
 * instead of showing a bare "disabled".
 */
export function missingRequiredConfig(manifest: PluginManifest): Array<{
  key: string
  label: string
  secret: boolean
}> {
  const config = getLedgerEntry(manifest.id)?.config ?? {}
  const missing: Array<{ key: string; label: string; secret: boolean }> = []
  for (const [key, field] of Object.entries(manifest.config)) {
    if (!field.required) continue
    const value = config[key]
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push({
        key,
        label: localizedText(field.label) ?? key,
        secret: field.type === 'secret',
      })
    }
  }
  return missing
}

/** Short human hint for the missing config, e.g. "API key required". */
export function missingConfigHint(manifest: PluginManifest): string | null {
  const missing = missingRequiredConfig(manifest)
  if (missing.length === 0) return null
  return missing.some((m) => m.secret)
    ? i18n.t('pluginStore.apiKeyRequiredHint', {
        defaultValue: 'API key required',
      })
    : i18n.t('pluginStore.setupRequiredHint', {
        defaultValue: 'Setup required',
      })
}
