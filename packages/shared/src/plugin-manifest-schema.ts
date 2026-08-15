// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SUPPORTED_LOCALES } from './localized-text'
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
  'market-data:symbol-logo',
  'ai:inference',
  'ai:web-search',
  'trading:orders',
  'trading:balances',
  'trading:positions',
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

export type ManifestValidationResult =
  | { valid: true; manifest: PluginManifest; errors: [] }
  | { valid: false; manifest: null; errors: Array<string> }

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
 * success, or a list of human-readable errors on failure.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
  const errors: Array<string> = []
  const fail = (): ManifestValidationResult => ({
    valid: false,
    manifest: null,
    errors,
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
  // Light structural + size checking only. The terminal sanitizes an untrusted
  // contribution again on the way into its registry (facets are filtered to
  // known values, geometry is capped, variables are derived); the point here is
  // to reject a manifest that could never render rather than to police wording.
  const contributes = m['contributes']
  if (contributes !== undefined) {
    if (!isPlainObject(contributes)) {
      errors.push('"contributes" must be an object')
    } else if (contributes['workspaces'] !== undefined) {
      checkContributedWorkspaces(contributes['workspaces'], errors)
    }
  }

  if (errors.length > 0) return fail()
  return { valid: true, manifest: input as PluginManifest, errors: [] }
}

// ── contributes.workspaces ──────────────────────────────────────────

/** Ceilings mirror the terminal's own untrusted-layout caps. */
const MAX_WORKSPACES = 24
const MAX_WORKSPACE_COLUMNS = 16
const MAX_WORKSPACE_CELLS_PER_COLUMN = 24
const MAX_WORKSPACE_PANES_PER_CELL = 16
const MAX_WORKSPACE_PANES = 200

function checkContributedWorkspaces(
  value: unknown,
  errors: Array<string>,
): void {
  if (!Array.isArray(value)) {
    errors.push('"contributes.workspaces" must be an array')
    return
  }
  if (value.length > MAX_WORKSPACES) {
    errors.push(
      `"contributes.workspaces" must not exceed ${MAX_WORKSPACES} entries`,
    )
    return
  }

  const seen = new Set<string>()
  value.forEach((entry, i) => {
    const path = `contributes.workspaces[${i}]`
    if (!isPlainObject(entry)) {
      errors.push(`${path} must be an object`)
      return
    }
    for (const key of ['id', 'name'] as const) {
      const field = entry[key]
      if (typeof field !== 'string' || field.length === 0) {
        errors.push(`${path}.${key} is required and must be a non-empty string`)
      } else if (field.length > MAX_TEXT_LEN) {
        errors.push(`${path}.${key} must be at most ${MAX_TEXT_LEN} characters`)
      }
    }
    if (typeof entry['id'] === 'string') {
      if (seen.has(entry['id'])) {
        errors.push(`${path}.id "${entry['id']}" is declared more than once`)
      }
      seen.add(entry['id'])
    }
    checkWorkspaceLayout(entry['layout'], `${path}.layout`, errors)
  })
}

function checkWorkspaceLayout(
  value: unknown,
  path: string,
  errors: Array<string>,
): void {
  if (!isPlainObject(value)) {
    errors.push(`"${path}" is required and must be a layout object`)
    return
  }
  const columns = value['columns']
  if (!Array.isArray(columns) || columns.length === 0) {
    errors.push(`"${path}.columns" must be a non-empty array`)
    return
  }
  if (columns.length > MAX_WORKSPACE_COLUMNS) {
    errors.push(
      `"${path}.columns" must not exceed ${MAX_WORKSPACE_COLUMNS} entries`,
    )
    return
  }

  let totalPanes = 0
  for (const [ci, column] of columns.entries()) {
    const cells = isPlainObject(column) ? column['cells'] : null
    if (!Array.isArray(cells) || cells.length === 0) {
      errors.push(`"${path}.columns[${ci}].cells" must be a non-empty array`)
      return
    }
    if (cells.length > MAX_WORKSPACE_CELLS_PER_COLUMN) {
      errors.push(
        `"${path}.columns[${ci}].cells" must not exceed ${MAX_WORKSPACE_CELLS_PER_COLUMN} entries`,
      )
      return
    }
    for (const [ei, cell] of cells.entries()) {
      const panes = isPlainObject(cell) ? cell['panes'] : null
      if (!Array.isArray(panes) || panes.length === 0) {
        errors.push(
          `"${path}.columns[${ci}].cells[${ei}].panes" must be a non-empty array`,
        )
        return
      }
      if (panes.length > MAX_WORKSPACE_PANES_PER_CELL) {
        errors.push(
          `"${path}.columns[${ci}].cells[${ei}].panes" must not exceed ${MAX_WORKSPACE_PANES_PER_CELL} entries`,
        )
        return
      }
      totalPanes += panes.length
      if (totalPanes > MAX_WORKSPACE_PANES) {
        errors.push(
          `"${path}" must not exceed ${MAX_WORKSPACE_PANES} panes in total`,
        )
        return
      }
      for (const [pi, pane] of panes.entries()) {
        if (!isPlainObject(pane) || typeof pane['type'] !== 'string') {
          errors.push(
            `"${path}.columns[${ci}].cells[${ei}].panes[${pi}].type" must be a string`,
          )
          return
        }
      }
    }
  }
}
