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

/**
 * Every key `registry-labels.ts` can derive from these definitions.
 *
 * Only three per step type. A step's config field labels, placeholders and
 * handle labels used to be derived here too, back when a generic panel
 * rendered a step from its `configSchema`; that panel was replaced by
 * per-step components in March 2026 and deleted in August, and those keys
 * went with it. Field text lives in each step component's own literal keys
 * now, and handles are unlabelled dots.
 *
 * Config OPTION wording survived that cut, but through a different door:
 * see `messageOptionKeys` below.
 */
function stepKeys(
  scope: 'workflows' | 'notifications',
  steps: Array<{ type: string; compat?: unknown }>,
): Array<string> {
  const keys: Array<string> = []
  for (const step of steps) {
    const base = `${scope}.stepTypes.${step.type}`
    keys.push(`${base}.label`)
    if (step.compat) keys.push(`${base}.compat`, `${base}.compatReason`)
  }
  return keys
}

/**
 * The config-option keys that outlived the builder's dropdowns.
 *
 * `lib/notifications/event-messages.ts` translates the enum fragments in a
 * delivered notification ("Buy", "Filled", "Above") by resolving the runtime
 * value against the step's own option keys, so a notification and the
 * dropdown that configured it read the same word. It builds the key inline
 * rather than calling `registry-labels.ts`, which is exactly how these keys
 * survived a sweep that searched for the helper names: grep for a function
 * and an inline template literal is invisible.
 *
 * So read the call sites instead of trusting a copied list. A fourth
 * `optionLabel` call is picked up here automatically; a list would have to
 * be remembered.
 */
function messageOptionKeys(): Array<string> {
  const src = readFileSync(
    join(import.meta.dir, '..', 'notifications', 'event-messages.ts'),
    'utf8',
  )
  const keys: Array<string> = []
  for (const [, stepType, field] of src.matchAll(
    /optionLabel\(\s*'([^']+)',\s*'([^']+)'/g,
  )) {
    // The option values come from the step definition, never from the
    // catalog. Reading the catalog to decide which catalog keys ought to
    // exist is circular: a deleted key would simply stop being expected,
    // and the notification that needed it would fall back to a raw enum.
    const step = CORE_NOTIFICATION_STEPS.find((s) => s.type === stepType)
    const schema = step?.configSchema.find((f) => f.key === field)
    for (const opt of schema?.options ?? []) {
      keys.push(
        `notifications.stepTypes.${stepType}.fields.${field}.options.${opt.value}`,
      )
    }
  }
  return keys
}

/** Every key the en catalog actually carries under `<scope>.stepTypes.`. */
function catalogStepKeys(scope: 'workflows' | 'notifications'): Array<string> {
  const root = lookup(`${scope}.stepTypes`)
  const keys: Array<string> = []
  const walk = (node: unknown, path: string) => {
    if (typeof node !== 'object' || node === null) {
      keys.push(path)
      return
    }
    for (const [k, v] of Object.entries(node as Node)) walk(v, `${path}.${k}`)
  }
  walk(root, `${scope}.stepTypes`)
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

  test.each([
    [
      'workflow',
      'workflows' as const,
      stepKeys('workflows', getCoreStepTypes()),
    ],
    [
      'notification',
      'notifications' as const,
      stepKeys('notifications', CORE_NOTIFICATION_STEPS),
    ],
  ])('%s step types carry nothing undeclared', (_name, scope, derived) => {
    const declared = [...derived, ...messageOptionKeys()]
    // The orphan audit in i18n-catalog.test.ts waves the whole
    // `<scope>.stepTypes.` subtree through on a prefix, because the step
    // type sits in the middle of the key and no literal prefix can reach
    // it. That shadow is why 2295 config-field and handle keys sat in
    // seventeen catalogs for five months after the panel that rendered
    // them stopped being mounted. This is the assertion that closes it:
    // anything under the prefix that no function in registry-labels.ts
    // can derive is dead weight, and fails here instead of hiding.
    const undeclared = catalogStepKeys(scope).filter(
      (k) => !declared.includes(k),
    )
    expect(undeclared.sort()).toEqual([])
  })

  test('notification option wording resolves', () => {
    const keys = messageOptionKeys()
    const missing = keys.filter((k) => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })

  test('the optionLabel scan actually finds call sites (self-check)', () => {
    // A rotted regex would report zero live option keys, the reverse
    // assertion would then demand their deletion, and the notifications
    // people receive would quietly fall back to raw enum values.
    expect(messageOptionKeys().length).toBeGreaterThan(4)
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
