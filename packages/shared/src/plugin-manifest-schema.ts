// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SUPPORTED_LOCALES } from './localized-text'
import {
  WORKSPACE_LAYOUT_CAPS,
  checkWorkspaceLayoutShape,
} from './workspace-layout-caps'
import type { CapabilityId, PluginManifest } from './plugin-types'

/**
 * Runtime validation for plugin manifests loaded from untrusted sources
 * (registry / URL / local folder). Bootstrap plugins are TypeScript-typed at
 * build time and do not need this, but every externally-loaded plugin manifest
 * must pass `validateManifest` before it is installed.
 *
 * Kept dependency-free (no ajv) so it can run anywhere — terminal, CLI, registry.
 */

export const VALID_CAPABILITY_IDS: ReadonlyArray<CapabilityId> = [
  'market-data:discovery',
  'market-data:discovery:search',
  'market-data:candles',
  'market-data:ticker',
  'market-data:ticker-snapshot',
  'market-data:orderbook',
  'market-data:trades',
  'market-data:history',
  'market-data:events',
  'market-data:pool-stats',
  'market-data:session',
  'market-data:funding',
  'market-data:liquidations',
  'market-data:bridge',
  'market-data:symbol-logo',
  'ai:inference',
  'ai:web-search',
  'rpc:solana',
  'trading:orders',
  'trading:balances',
  'trading:positions',
  'trading:bridge',
  'workflow:step-types',
  'notification:channel',
  'theme:override',
  'workspace-store:catalog',
  'chart:indicator',
]

const CONFIG_FIELD_TYPES = ['string', 'secret', 'number', 'boolean', 'select']

/**
 * Longest a single display string may be. Generous — the point is to stop a
 * manifest carrying a README, not to police wording.
 */
const MAX_TEXT_LEN = 500

/**
 * A `LocalizedText`: a bare string, or a map of locale to string.
 *
 * Locale keys must be ones the terminal actually ships a catalog for. That is
 * stricter than the resolver needs, and deliberately so: `pt` mistyped as `pr`
 * is a well-formed tag that would simply never match anything, and silently
 * never rendering is the failure mode this whole mechanism exists to avoid.
 */
function checkLocalizedText(
  value: unknown,
  path: string,
  errors: Array<string>,
  { required }: { required: boolean },
): void {
  if (value === undefined) {
    if (required) errors.push(`"${path}" is required`)
    return
  }

  if (typeof value === 'string') {
    if (value.length === 0) errors.push(`"${path}" must not be empty`)
    if (value.length > MAX_TEXT_LEN) {
      errors.push(`"${path}" must be at most ${MAX_TEXT_LEN} characters`)
    }
    return
  }

  if (!isPlainObject(value)) {
    errors.push(`"${path}" must be a string or a locale-to-string object`)
    return
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    errors.push(`"${path}" must carry at least one locale`)
    return
  }
  for (const [locale, text] of entries) {
    if (!(SUPPORTED_LOCALES as ReadonlyArray<string>).includes(locale)) {
      errors.push(
        `"${path}" has locale "${locale}", which the terminal has no catalog for ` +
          `(expected one of: ${SUPPORTED_LOCALES.join(', ')})`,
      )
    }
    if (typeof text !== 'string' || text.length === 0) {
      errors.push(`"${path}.${locale}" must be a non-empty string`)
    } else if (text.length > MAX_TEXT_LEN) {
      errors.push(
        `"${path}.${locale}" must be at most ${MAX_TEXT_LEN} characters`,
      )
    }
  }
}

/**
 * `errors` fail the manifest. `warnings` do not: they name something the host
 * will ignore at runtime (a malformed `contributes.workspaces` entry, say)
 * without taking the whole plugin down with it.
 */
export type ManifestValidationResult =
  | {
      valid: true
      manifest: PluginManifest
      errors: []
      warnings: Array<string>
    }
  | { valid: false; manifest: null; errors: Array<string>; warnings: [] }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Plugin ids are used as folder names and resolution keys — keep them tame.
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * Ids reserved for first-party, non-plugin providers (e.g. the built-in
 * workspace-store providers). A third-party plugin must never claim one, or it
 * could shadow a first-party provider in an id-keyed registry.
 */
export const RESERVED_PLUGIN_IDS: ReadonlyArray<string> = [
  'builtin',
  'pairlens-community',
]

// Network allowlist entries: exact hostname or single leading '*.' wildcard.
// Hostnames only — no scheme, port, path, or credentials.
const HOST_RE =
  /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

const VALID_PERMISSIONS = ['network', 'market-data', 'credentials', 'storage']

/**
 * Validate an unknown value as a PluginManifest. Returns the typed manifest on
 * success, or a list of human-readable errors on failure. Non-fatal problems
 * come back as `warnings` on a manifest that is still valid.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
  const errors: Array<string> = []
  const warnings: Array<string> = []
  const fail = (): ManifestValidationResult => ({
    valid: false,
    manifest: null,
    errors,
    warnings: [],
  })

  if (!isPlainObject(input)) {
    errors.push('Manifest must be an object')
    return fail()
  }
  const m = input

  // Required string fields
  for (const key of ['id', 'name', 'version', 'author'] as const) {
    if (typeof m[key] !== 'string' || m[key].length === 0) {
      errors.push(`"${key}" is required and must be a non-empty string`)
    }
  }

  checkLocalizedText(m['description'], 'description', errors, {
    required: true,
  })
  checkLocalizedText(m['title'], 'title', errors, { required: false })

  if (typeof m['id'] === 'string' && !ID_RE.test(m['id'])) {
    errors.push(
      '"id" must be lowercase alphanumeric with dashes (2-64 chars), e.g. "my-plugin"',
    )
  }

  if (typeof m['id'] === 'string' && RESERVED_PLUGIN_IDS.includes(m['id'])) {
    errors.push(`"id" "${m['id']}" is reserved and cannot be used by a plugin`)
  }

  // Optional string fields
  for (const key of ['homepage', 'icon', 'minTerminalVersion'] as const) {
    if (m[key] !== undefined && typeof m[key] !== 'string') {
      errors.push(`"${key}" must be a string when present`)
    }
  }

  // capabilities[]
  if (!Array.isArray(m['capabilities'])) {
    errors.push('"capabilities" must be an array')
  } else {
    m['capabilities'].forEach((cap, i) => {
      if (!isPlainObject(cap)) {
        errors.push(`capabilities[${i}] must be an object`)
        return
      }
      if (!VALID_CAPABILITY_IDS.includes(cap['id'] as CapabilityId)) {
        errors.push(
          `capabilities[${i}].id "${String(cap['id'])}" is not a known capability`,
        )
      }
      if (typeof cap['singleton'] !== 'boolean') {
        errors.push(`capabilities[${i}].singleton must be a boolean`)
      }
      if (
        !Array.isArray(cap['markets']) ||
        !(cap['markets'] as Array<unknown>).every((x) => typeof x === 'string')
      ) {
        errors.push(`capabilities[${i}].markets must be a string[]`)
      }
      if (typeof cap['priority'] !== 'number') {
        errors.push(`capabilities[${i}].priority must be a number`)
      }
      if (typeof cap['streaming'] !== 'boolean') {
        errors.push(`capabilities[${i}].streaming must be a boolean`)
      }
    })
  }

  // config: Record<string, PluginConfigField>
  if (m['config'] !== undefined) {
    if (!isPlainObject(m['config'])) {
      errors.push('"config" must be an object')
    } else {
      for (const [fieldKey, field] of Object.entries(m['config'])) {
        if (!isPlainObject(field)) {
          errors.push(`config.${fieldKey} must be an object`)
          continue
        }
        if (!CONFIG_FIELD_TYPES.includes(field['type'] as string)) {
          errors.push(
            `config.${fieldKey}.type must be one of ${CONFIG_FIELD_TYPES.join(', ')}`,
          )
        }
        checkLocalizedText(field['label'], `config.${fieldKey}.label`, errors, {
          required: true,
        })
      }
    }
  } else {
    errors.push('"config" is required (use {} if there are no settings)')
  }

  // permissions?: PluginPermission[]
  if (m['permissions'] !== undefined) {
    if (
      !Array.isArray(m['permissions']) ||
      !(m['permissions'] as Array<unknown>).every(
        (p) => typeof p === 'string' && VALID_PERMISSIONS.includes(p),
      )
    ) {
      errors.push(
        `"permissions" must be an array of ${VALID_PERMISSIONS.join(' | ')}`,
      )
    }
  }

  // network?: { hosts: string[] } — enforced allowlist for sandboxed plugins
  if (m['network'] !== undefined) {
    if (!isPlainObject(m['network'])) {
      errors.push('"network" must be an object with a "hosts" array')
    } else {
      const hosts = m['network']['hosts']
      if (!Array.isArray(hosts)) {
        errors.push('"network.hosts" must be a string[]')
      } else {
        hosts.forEach((h, i) => {
          if (typeof h !== 'string' || !HOST_RE.test(h.toLowerCase())) {
            errors.push(
              `network.hosts[${i}] "${String(h)}" is not a valid hostname (exact or "*." wildcard, no scheme/port/path)`,
            )
          }
        })
        if (hosts.length > 64) {
          errors.push('"network.hosts" must not exceed 64 entries')
        }
      }
    }
  }

  // contributes.workspaces?: ContributedWorkspace[]
  //
  // Warnings, never errors. `contributes` went unvalidated until these layouts
  // existed, so an installed manifest that predates the check must not brick at
  // boot re-validation because one entry is malformed. The host drops the bad
  // entry and keeps the plugin: the terminal sanitizes every untrusted
  // contribution again on the way into its registry (facets filtered to known
  // values, geometry capped, variables derived), so nothing unusable renders.
  const contributes = m['contributes']
  if (contributes !== undefined) {
    if (!isPlainObject(contributes)) {
      warnings.push('"contributes" is not an object and will be ignored')
    } else if (contributes['workspaces'] !== undefined) {
      checkContributedWorkspaces(contributes['workspaces'], warnings)
    }
  }

  if (errors.length > 0) return fail()
  return {
    valid: true,
    manifest: input as PluginManifest,
    errors: [],
    warnings,
  }
}

// ── contributes.workspaces ──────────────────────────────────────────

function checkContributedWorkspaces(
  value: unknown,
  warnings: Array<string>,
): void {
  if (!Array.isArray(value)) {
    warnings.push(
      '"contributes.workspaces" is not an array and will be ignored',
    )
    return
  }
  if (value.length > WORKSPACE_LAYOUT_CAPS.maxWorkspaces) {
    warnings.push(
      `"contributes.workspaces" carries more than ${WORKSPACE_LAYOUT_CAPS.maxWorkspaces} entries; the rest will be ignored`,
    )
  }

  const seen = new Set<string>()
  value.forEach((entry, i) => {
    const path = `contributes.workspaces[${i}]`
    if (!isPlainObject(entry)) {
      warnings.push(`${path} is not an object and will be ignored`)
      return
    }
    for (const key of ['id', 'name'] as const) {
      const field = entry[key]
      if (typeof field !== 'string' || field.length === 0) {
        warnings.push(`${path}.${key} must be a non-empty string`)
      } else if (field.length > MAX_TEXT_LEN) {
        warnings.push(
          `${path}.${key} is longer than ${MAX_TEXT_LEN} characters and will be truncated`,
        )
      }
    }
    if (typeof entry['id'] === 'string') {
      if (seen.has(entry['id'])) {
        warnings.push(`${path}.id "${entry['id']}" is declared more than once`)
      }
      seen.add(entry['id'])
    }
    const problem = checkWorkspaceLayoutShape(entry['layout'], `${path}.layout`)
    if (problem) warnings.push(`${problem}; the entry will be ignored`)
  })
}
