// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The empty-state templates are the first thing a new user clicks. If one of
// them expands to an invalid graph they land on a red commit bar and conclude
// the feature is broken — so every template is validated here, against the
// same validators the commit bars run, using the real core step types.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import { getCoreStepTypes } from '@pairlens/workflow-engine/core-steps'
import { registerStepTypes as registerWorkflowSteps } from '@pairlens/workflow-engine/step-registry'
import { validateWorkflow } from '@pairlens/workflow-engine/validator'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { registerStepTypes as registerNotificationSteps } from '@pairlens/notification-engine/step-registry'
import { validateRule } from '@pairlens/notification-engine/validator'

import {
  NOTIFICATION_TEMPLATES,
  notificationTemplateChips,
  notificationTemplateGraph,
} from '../notifications/notification-templates'
import {
  WORKFLOW_TEMPLATES,
  workflowTemplateChips,
  workflowTemplateGraph,
} from '../workflows/workflow-templates'
import type { TFunction } from 'i18next'

// In the app these arrive over the `workflow:step-types` capability from
// pairlens-core; here they come straight from the same source module.
registerWorkflowSteps(getCoreStepTypes())
registerNotificationSteps(CORE_NOTIFICATION_STEPS)

const CORE_WORKFLOW_STEP_TYPES = new Set(getCoreStepTypes().map((d) => d.type))
const CORE_NOTIFICATION_STEP_TYPES = new Set(
  CORE_NOTIFICATION_STEPS.map((d) => d.type),
)

// The template titles and descriptions rendered in the picker cards are
// translated at their id — `workflows.templates.<id>.title` and
// `notifications.templates.<id>.description` — rather than via a `t('literal')`
// call site, so the catalog-parity test cannot see them. Walk the real
// definitions and confirm every derived key resolves in `en`, the same way
// `lib/__tests__/registry-labels.test.ts` covers its own derived keys.
const LOCALES_DIR = join(import.meta.dir, '..', '..', 'locales')

type CatalogNode = Record<string, unknown>

const en = JSON.parse(
  readFileSync(join(LOCALES_DIR, 'en', 'translation.json'), 'utf8'),
) as CatalogNode

function lookup(key: string): unknown {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as CatalogNode)[part]
  }
  return node
}

/**
 * Chip translation picks between a per-template key and a shared
 * `common.chips.*` key (or no key at all, for pure notation) inside
 * `notificationTemplateChips`/`workflowTemplateChips` — not a formula this
 * test can rederive on its own without duplicating that switch. Instead run
 * the real function with a `t` that just records what it was asked for, then
 * check every recorded key resolves. A chip left untranslated on purpose
 * (`'13-21 UTC'`, the scale-out percentages) never calls `t`, so it never
 * shows up here — which is the correct, not the missing, case.
 */
function recordingT(): { t: TFunction; keys: Array<string> } {
  const keys: Array<string> = []
  const t = ((key: string) => {
    keys.push(key)
    return key
  }) as unknown as TFunction
  return { t, keys }
}

describe('workflow starter templates', () => {
  it('offers between three and five', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(WORKFLOW_TEMPLATES.length).toBeLessThanOrEqual(5)
  })

  it('uses unique ids', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a title and description catalog key for every template', () => {
    const keys = WORKFLOW_TEMPLATES.flatMap((template) => [
      `workflows.templates.${template.id}.title`,
      `workflows.templates.${template.id}.description`,
    ])
    const missing = keys.filter((key) => typeof lookup(key) !== 'string')
    expect(missing).toEqual([])
  })

  it('has a resolvable catalog key for every translated chip', () => {
    const { t, keys } = recordingT()
    for (const template of WORKFLOW_TEMPLATES)
      workflowTemplateChips(t, template)
    expect(keys.length).toBeGreaterThan(0)
    const missing = keys.filter((key) => typeof lookup(key) !== 'string')
    expect(missing).toEqual([])
  })

  for (const template of WORKFLOW_TEMPLATES) {
    it(`"${template.title}" only uses real step types`, () => {
      for (const step of template.steps) {
        expect(CORE_WORKFLOW_STEP_TYPES.has(step.type)).toBe(true)
      }
    })

    it(`"${template.title}" expands to a valid workflow`, () => {
      const { steps, edges } = workflowTemplateGraph(template)
      const result = validateWorkflow({
        version: 1,
        id: template.id,
        name: template.title,
        steps,
        edges,
        createdAt: 0,
        updatedAt: 0,
      })
      expect(result.errors.map((e) => e.message)).toEqual([])
      expect(result.valid).toBe(true)
    })
  }
})

describe('notification starter templates', () => {
  it('offers between three and five', () => {
    expect(NOTIFICATION_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(NOTIFICATION_TEMPLATES.length).toBeLessThanOrEqual(5)
  })

  it('uses unique ids', () => {
    const ids = NOTIFICATION_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a title and description catalog key for every template', () => {
    const keys = NOTIFICATION_TEMPLATES.flatMap((template) => [
      `notifications.templates.${template.id}.title`,
      `notifications.templates.${template.id}.description`,
    ])
    const missing = keys.filter((key) => typeof lookup(key) !== 'string')
    expect(missing).toEqual([])
  })

  it('has a resolvable catalog key for every translated chip', () => {
    const { t, keys } = recordingT()
    for (const template of NOTIFICATION_TEMPLATES) {
      notificationTemplateChips(t, template)
    }
    expect(keys.length).toBeGreaterThan(0)
    const missing = keys.filter((key) => typeof lookup(key) !== 'string')
    expect(missing).toEqual([])
  })

  // All of them, now that the bare price level has moved to the simple-alert
  // dialog: what is left in this catalog is flows with steps.
  const graphTemplates = NOTIFICATION_TEMPLATES

  it('has at least one graph template', () => {
    expect(graphTemplates.length).toBeGreaterThan(0)
  })

  for (const template of graphTemplates) {
    it(`"${template.title}" only uses real step types`, () => {
      for (const step of template.steps) {
        expect(CORE_NOTIFICATION_STEP_TYPES.has(step.type)).toBe(true)
      }
    })

    it(`"${template.title}" expands to a valid rule`, () => {
      const { steps, edges } = notificationTemplateGraph(template)
      const result = validateRule({
        version: 1,
        id: template.id,
        name: template.title,
        steps,
        edges,
        createdAt: 0,
        updatedAt: 0,
      })
      expect(result.errors.map((e) => e.message)).toEqual([])
      expect(result.valid).toBe(true)
    })
  }
})
