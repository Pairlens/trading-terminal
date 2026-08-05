// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { getCoreStepTypes } from '@pairlens/workflow-engine/core-steps'
import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { CAPABILITY_META } from '@pairlens/shared/capability-meta'

/**
 * Coverage for the derived keys in `lib/registry-labels.ts`.
 *
 * The catalog-parity test only sees `t('literal')` call sites, so keys
 * built from a step's `type` or a capability's `id` are invisible to it.
 * They are also the keys most likely to go missing: a step type added in
 * `@pairlens/workflow-engine` renders fine in English via its
 * `defaultValue` fallback and silently stays English everywhere else.
 *
 * This walks the real definitions — not a fixture — so that new step types
 * and capabilities fail here until the catalog catches up.
 */

const LOCALES_DIR = join(import.meta.dir, '..', '..', 'locales')

type Node = Record<string, unknown>

const en = JSON.parse(
  readFileSync(join(LOCALES_DIR, 'en', 'translation.json'), 'utf8'),
) as Node

function lookup(key: string): unknown {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Node)[part]
  }
  return node
}

/** Every key `registry-labels.ts` can derive from these definitions. */
function stepKeys(
  scope: 'workflows' | 'notifications',
  steps: Array<{
    type: string
    handles: {
      inputs: Array<{ id: string; label?: string }>
      outputs: Array<{ id: string; label?: string }>
    }
    configSchema: Array<{
      key: string
      placeholder?: string
      options?: Array<{ value: string }>
    }>
    compat?: unknown
  }>,
): Array<string> {
  const keys: Array<string> = []
  for (const step of steps) {
    const base = `${scope}.stepTypes.${step.type}`
    keys.push(`${base}.label`)
    if (step.compat) keys.push(`${base}.compat`, `${base}.compatReason`)
    for (const field of step.configSchema) {
      keys.push(`${base}.fields.${field.key}.label`)
      if (field.placeholder)
        keys.push(`${base}.fields.${field.key}.placeholder`)
      for (const opt of field.options ?? []) {
        keys.push(`${base}.fields.${field.key}.options.${opt.value}`)
      }
    }
    for (const handle of [...step.handles.inputs, ...step.handles.outputs]) {
      // Unlabelled handles render nothing, so they need no key.
      if (handle.label) keys.push(`${base}.handles.${handle.id}`)
    }
  }
  return keys
}

describe('derived catalog keys resolve in en', () => {
  test.each([
    ['workflow', stepKeys('workflows', getCoreStepTypes())],
    ['notification', stepKeys('notifications', CORE_NOTIFICATION_STEPS)],
  ])('%s step types', (_name, keys) => {
    expect(keys.length).toBeGreaterThan(0)
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })

  test('plugin capabilities', () => {
    const keys = CAPABILITY_META.flatMap((meta) => [
      // Colons in a capability id are i18next's namespace separator, so
      // `registry-labels.ts` nests under them. `replaceAll`, not `replace`:
      // one id has two colons, and mirroring a `replace` here is how this
      // test agreed with the bug instead of catching it.
      `capabilities.${meta.id.replaceAll(':', '.')}.label`,
      `capabilities.${meta.id.replaceAll(':', '.')}.description`,
      `capabilities.domains.${meta.domain}`,
    ])
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })
})
