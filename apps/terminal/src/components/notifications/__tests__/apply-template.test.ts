// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Picking a template used to leave the rule EMPTY: the graph went into an
// uncommitted draft, so the rule appeared in the list with its toggle on while
// `rule.steps` was still `[]`. It looked armed and could never fire, because
// nothing reaches the runtime until Commit.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { registerStepTypes } from '@pairlens/notification-engine/step-registry'
import { validateRule } from '@pairlens/notification-engine/validator'

const backing = new Map<string, string>()
const previousStorage = globalThis.localStorage as Storage | undefined
globalThis.localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => {
    backing.set(k, String(v))
  },
  removeItem: (k: string) => {
    backing.delete(k)
  },
  clear: () => backing.clear(),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size
  },
} as Storage

const { NOTIFICATION_TEMPLATES, applyNotificationTemplate, TEMPLATE_PAIR } =
  await import('../notification-templates')
const { useNotificationStore } = await import('@/stores/notification-store')

beforeAll(() => {
  registerStepTypes(CORE_NOTIFICATION_STEPS)
})

beforeEach(() => {
  backing.clear()
  useNotificationStore.setState({
    rules: [],
    bindings: [],
    draft: null,
    activeRuleId: null,
    loaded: true,
  })
})

afterEach(() => {
  useNotificationStore.setState({ rules: [], bindings: [], draft: null })
})

// Every notification template is a graph now: a bare price level is a simple
// alert made in the New alert dialog, not a template that expands to nodes.
const graphTemplates = NOTIFICATION_TEMPLATES

describe('applying a notification template', () => {
  it('has graph templates to cover', () => {
    expect(graphTemplates.length).toBeGreaterThan(0)
  })

  it.each(graphTemplates.map((t) => [t.id, t] as const))(
    '%s arrives armed, not as an empty rule',
    (_id, template) => {
      const ruleId = applyNotificationTemplate(template)
      const rule = useNotificationStore
        .getState()
        .rules.find((r) => r.id === ruleId)

      expect(rule).toBeDefined()
      // The committed rule is what the runtime evaluates. An empty one is
      // inert no matter what the draft holds.
      expect(rule!.steps.length).toBe(template.steps.length)
      expect(rule!.edges.length).toBe(template.edges.length)
      expect(rule!.enabled).not.toBe(false)
    },
  )

  it.each(graphTemplates.map((t) => [t.id, t] as const))(
    '%s commits a graph the validator accepts',
    (_id, template) => {
      const ruleId = applyNotificationTemplate(template)
      const rule = useNotificationStore
        .getState()
        .rules.find((r) => r.id === ruleId)!

      expect(validateRule(rule).errors).toEqual([])
    },
  )

  it('binds the rule to a pair so it is not inert', () => {
    const ruleId = applyNotificationTemplate(graphTemplates[0])
    const bindings = useNotificationStore
      .getState()
      .bindings.filter((b) => b.ruleId === ruleId)

    expect(bindings).toHaveLength(1)
    expect(bindings[0].pair).toBe(TEMPLATE_PAIR)
    expect(bindings[0].enabled).toBe(true)
  })

  it('leaves the rule open for editing with nothing pending', () => {
    const ruleId = applyNotificationTemplate(graphTemplates[0])
    const { draft } = useNotificationStore.getState()

    // Still editable — but the pending list is clean, because the template's
    // own steps are already saved rather than sitting as unsaved changes.
    expect(draft?.ruleId).toBe(ruleId)
    expect(draft?.pendingChanges).toEqual([])
    expect(draft?.currentSteps.length).toBe(graphTemplates[0].steps.length)
  })

  it('keeps every edge pointing at a step that exists', () => {
    for (const template of graphTemplates) {
      const ruleId = applyNotificationTemplate(template)
      const rule = useNotificationStore
        .getState()
        .rules.find((r) => r.id === ruleId)!
      const ids = new Set(rule.steps.map((s) => s.id))
      for (const edge of rule.edges) {
        expect(ids.has(edge.source)).toBe(true)
        expect(ids.has(edge.target)).toBe(true)
      }
    }
  })
})

afterAll(() => {
  if (previousStorage) globalThis.localStorage = previousStorage
})
