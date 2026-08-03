// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The empty-state templates are the first thing a new user clicks. If one of
// them expands to an invalid graph they land on a red commit bar and conclude
// the feature is broken — so every template is validated here, against the
// same validators the commit bars run, using the real core step types.
import { describe, expect, it } from 'bun:test'

import { getCoreStepTypes } from '@pairlens/workflow-engine/core-steps'
import { registerStepTypes as registerWorkflowSteps } from '@pairlens/workflow-engine/step-registry'
import { validateWorkflow } from '@pairlens/workflow-engine/validator'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { registerStepTypes as registerNotificationSteps } from '@pairlens/notification-engine/step-registry'
import { validateRule } from '@pairlens/notification-engine/validator'

import {
  NOTIFICATION_TEMPLATES,
  notificationTemplateGraph,
} from '../notifications/notification-templates'
import {
  WORKFLOW_TEMPLATES,
  workflowTemplateGraph,
} from '../workflows/workflow-templates'

// In the app these arrive over the `workflow:step-types` capability from
// pairlens-core; here they come straight from the same source module.
registerWorkflowSteps(getCoreStepTypes())
registerNotificationSteps(CORE_NOTIFICATION_STEPS)

const CORE_WORKFLOW_STEP_TYPES = new Set(getCoreStepTypes().map((d) => d.type))
const CORE_NOTIFICATION_STEP_TYPES = new Set(
  CORE_NOTIFICATION_STEPS.map((d) => d.type),
)

describe('workflow starter templates', () => {
  it('offers between three and five', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(WORKFLOW_TEMPLATES.length).toBeLessThanOrEqual(5)
  })

  it('uses unique ids', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
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

  // `price-level` is assembled by `createPriceAlertRule`, which the chart's
  // "alert here" action already exercises; it carries no steps of its own.
  const graphTemplates = NOTIFICATION_TEMPLATES.filter(
    (t) => t.kind === 'graph',
  )

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
