// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'
import { getCoreStepTypes } from '@pairlens/workflow-engine/core-steps'
import { registerStepTypes as registerWorkflowSteps } from '@pairlens/workflow-engine/step-registry'
import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { registerStepTypes as registerNotificationSteps } from '@pairlens/notification-engine/step-registry'
import {
  allAutomationToolNames,
  buildAutomationTools,
} from '../automation-tools'
import { AUTOMATION_TOOL_LABELS } from '../automation-tool-labels'
import { layoutGraph, onExternalGraphWrite } from '../graph-apply'
import { consumeAssistantIntent } from '../assistant-chat-cache'
import type { AutomationToolDeps } from '../automation-tools'
import type { ToolCallOptions } from 'ai'
import { useNotificationStore } from '@/stores/notification-store'
import { useWorkflowStore } from '@/stores/workflow-store'

const callOpts = {
  toolCallId: 't1',
  messages: [],
} as unknown as ToolCallOptions

function makeDeps(
  overrides: Partial<AutomationToolDeps> = {},
): AutomationToolDeps {
  return {
    surface: 'workflows',
    getMarketData: () => ({
      availableMarkets: [{ marketId: 'okx' }],
      getTimeframes: () => ['1h'],
      fetchHistory: async () => [],
    }),
    navigate: () => {},
    ...overrides,
  }
}

// The registries are filled by the plugin system at runtime; a bun test has
// no plugins, and an empty registry would make every graph "unknown step type".
registerWorkflowSteps(getCoreStepTypes())
registerNotificationSteps(CORE_NOTIFICATION_STEPS)

beforeEach(() => {
  useWorkflowStore.setState({
    workflows: [],
    loaded: true,
    activeWorkflowId: null,
    draft: null,
  })
  useNotificationStore.setState({
    rules: [],
    bindings: [],
    loaded: true,
    activeRuleId: null,
    draft: null,
  })
})

describe('layoutGraph', () => {
  test('lays a chain out top-down and spreads siblings across a row', () => {
    const positions = layoutGraph(
      [
        { id: 'trigger', type: 'trigger' },
        { id: 'tp', type: 'take-profit' },
        { id: 'sl', type: 'stop-loss' },
      ],
      [
        { source: 'trigger', target: 'tp' },
        { source: 'trigger', target: 'sl' },
      ],
    )
    const trigger = positions.get('trigger')!
    const tp = positions.get('tp')!
    const sl = positions.get('sl')!
    expect(tp.y).toBeGreaterThan(trigger.y)
    expect(sl.y).toBe(tp.y)
    expect(tp.x).not.toBe(sl.x)
  })

  test('puts a join below both of its inputs', () => {
    const positions = layoutGraph(
      [
        { id: 'a', type: 'trigger' },
        { id: 'b', type: 'wait' },
        { id: 'c', type: 'market-order' },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'a', target: 'c' },
      ],
    )
    expect(positions.get('c')!.y).toBeGreaterThan(positions.get('b')!.y)
  })
})

describe('get_step_reference', () => {
  test('reports the real config keys, not just the display labels', async () => {
    const tools = buildAutomationTools(makeDeps())
    const result = (await tools.get_step_reference.execute!({}, callOpts)) as {
      steps: Array<{
        type: string
        defaults: Record<string, unknown>
        config: Array<{ key: string; options?: Array<string> }>
      }>
    }

    const takeProfit = result.steps.find((step) => step.type === 'take-profit')!
    // The exact keys the runtime validates. Reading these off the wrong
    // property once left the model guessing them from "Close %" and friends.
    expect(takeProfit.config.map((field) => field.key)).toEqual([
      'triggerMode',
      'triggerValue',
      'sizePercent',
      'orderType',
      'limitPrice',
    ])
    expect(takeProfit.config[0].options).toEqual(['percent', 'absolute'])
    // And a complete data object to copy, which validates as-is.
    expect(Object.keys(takeProfit.defaults)).toContain('sizePercent')
  })

  test('a graph built from the reference validates as-is', async () => {
    const tools = buildAutomationTools(makeDeps())
    const reference = (await tools.get_step_reference.execute!(
      {},
      callOpts,
    )) as { steps: Array<{ type: string; defaults: Record<string, unknown> }> }
    const defaultsFor = (type: string) =>
      reference.steps.find((step) => step.type === type)!.defaults

    const result = (await tools.create_workflow.execute!(
      {
        name: 'From the reference',
        steps: [
          { id: 'trigger', type: 'trigger', data: defaultsFor('trigger') },
          {
            id: 'tp',
            type: 'take-profit',
            data: { ...defaultsFor('take-profit'), triggerValue: 10 },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            data: { ...defaultsFor('stop-loss'), triggerValue: 2 },
          },
        ],
        edges: [
          { source: 'trigger', target: 'tp' },
          { source: 'trigger', target: 'sl' },
        ],
      },
      callOpts,
    )) as { validation: { valid: boolean; errors: Array<string> } }

    expect(result.validation.errors).toEqual([])
    expect(result.validation.valid).toBe(true)
  })

  test('no step type on either surface loses its config on the way out', async () => {
    // The general form of the bug: a step whose definition declares config
    // must never be described as taking none, on either engine.
    for (const [deps, registry] of [
      [makeDeps(), getCoreStepTypes()],
      [makeDeps({ surface: 'notifications' }), CORE_NOTIFICATION_STEPS],
    ] as const) {
      const tools = buildAutomationTools(deps)
      const result = (await tools.get_step_reference.execute!(
        {},
        callOpts,
      )) as { steps: Array<{ type: string; config: Array<unknown> }> }
      const described = new Map(
        result.steps.map((step) => [step.type, step.config.length]),
      )
      for (const def of registry) {
        expect(described.get(def.type)).toBe(def.configSchema.length)
      }
    }
  })

  test('a failing step comes back with the config it expected', async () => {
    const tools = buildAutomationTools(makeDeps())
    const result = (await tools.create_workflow.execute!(
      {
        name: 'Wrong keys',
        steps: [
          { id: 'trigger', type: 'trigger' },
          // The label-derived spelling the model reached for before.
          { id: 'tp', type: 'take-profit', data: { closePercent: 100 } },
        ],
        edges: [{ source: 'trigger', target: 'tp' }],
      },
      callOpts,
    )) as {
      validation: {
        valid: boolean
        expectedConfig?: Array<{ type: string; config: Array<{ key: string }> }>
      }
    }

    expect(result.validation.valid).toBe(false)
    const help = result.validation.expectedConfig!
    expect(help.map((entry) => entry.type)).toEqual(['take-profit'])
    expect(help[0].config.map((field) => field.key)).toContain('sizePercent')
  })
})

describe('create_workflow', () => {
  test('writes the graph as uncommitted changes, never as a saved workflow', async () => {
    const tools = buildAutomationTools(makeDeps())
    const result = (await tools.create_workflow.execute!(
      {
        name: 'Bracket',
        steps: [
          { id: 'trigger', type: 'trigger' },
          {
            id: 'tp',
            type: 'take-profit',
            data: {
              triggerMode: 'percent',
              triggerValue: 5,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [{ source: 'trigger', target: 'tp' }],
      },
      callOpts,
    )) as { workflowId: string; validation: { valid: boolean } }

    const state = useWorkflowStore.getState()
    const saved = state.workflows.find((w) => w.id === result.workflowId)!
    // The committed workflow still holds only the seeded trigger: the user
    // commits, the assistant does not.
    expect(saved.steps.map((s) => s.id)).toEqual(['trigger'])
    expect(state.draft?.workflowId).toBe(result.workflowId)
    expect(state.draft?.currentSteps.map((s) => s.id).sort()).toEqual([
      'tp',
      'trigger',
    ])
    expect(state.draft?.pendingChanges.length).toBeGreaterThan(0)
    expect(result.validation.valid).toBe(true)
  })

  test('reports validation instead of pretending a broken graph is fine', async () => {
    const tools = buildAutomationTools(makeDeps())
    const result = (await tools.create_workflow.execute!(
      {
        name: 'No trigger',
        steps: [{ id: 'lonely', type: 'wait', data: { duration: 1 } }],
        edges: [],
      },
      callOpts,
    )) as { validation: { valid: boolean; errors: Array<string> } }

    expect(result.validation.valid).toBe(false)
    expect(result.validation.errors.join(' ')).toContain('trigger')
  })
})

describe('external write notification', () => {
  test('fires once the draft has been rewritten, so the canvas can re-read', async () => {
    let notified = 0
    const stop = onExternalGraphWrite(() => {
      notified += 1
    })
    const tools = buildAutomationTools(makeDeps())
    await tools.create_workflow.execute!(
      {
        name: 'Notify',
        steps: [{ id: 'trigger', type: 'trigger' }],
        edges: [],
      },
      callOpts,
    )
    stop()
    expect(notified).toBe(1)

    // Unsubscribed listeners stop hearing about it.
    await tools.create_workflow.execute!(
      { name: 'Quiet', steps: [{ id: 'trigger', type: 'trigger' }], edges: [] },
      callOpts,
    )
    expect(notified).toBe(1)
  })
})

describe('update_workflow', () => {
  test('drops steps the new graph leaves out', async () => {
    const tools = buildAutomationTools(makeDeps())
    const created = (await tools.create_workflow.execute!(
      {
        name: 'Two exits',
        steps: [
          { id: 'trigger', type: 'trigger' },
          {
            id: 'tp',
            type: 'take-profit',
            data: {
              triggerMode: 'percent',
              triggerValue: 5,
              sizePercent: 100,
              orderType: 'market',
            },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            data: {
              triggerMode: 'percent',
              triggerValue: 3,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [
          { source: 'trigger', target: 'tp' },
          { source: 'trigger', target: 'sl' },
        ],
      },
      callOpts,
    )) as { workflowId: string }

    await tools.update_workflow.execute!(
      {
        workflowId: created.workflowId,
        steps: [
          { id: 'trigger', type: 'trigger' },
          {
            id: 'tp',
            type: 'take-profit',
            data: {
              triggerMode: 'percent',
              triggerValue: 8,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [{ source: 'trigger', target: 'tp' }],
      },
      callOpts,
    )

    const draft = useWorkflowStore.getState().draft!
    expect(draft.currentSteps.map((s) => s.id).sort()).toEqual([
      'tp',
      'trigger',
    ])
    expect(draft.currentSteps.find((s) => s.id === 'tp')!.data).toMatchObject({
      triggerValue: 8,
    })
    expect(draft.currentEdges).toHaveLength(1)
  })
})

describe('simple alerts', () => {
  const deps = () => makeDeps({ surface: 'notifications' })

  test('creates an armed alert bound to the pair', async () => {
    const tools = buildAutomationTools(deps())
    const result = (await tools.create_simple_alert.execute!(
      {
        market: 'okx',
        pair: 'btc-usdt',
        alert: { kind: 'price-level', direction: 'above', price: 100_000 },
      },
      callOpts,
    )) as { ruleId: string }

    const state = useNotificationStore.getState()
    const rule = state.rules.find((r) => r.id === result.ruleId)!
    expect(rule.steps.length).toBeGreaterThan(1)
    const binding = state.bindings.find((b) => b.ruleId === result.ruleId)!
    expect(binding.pair).toBe('BTC-USDT')
    expect(binding.enabled).toBe(true)
    // Telegram needs a bot token the assistant cannot see, so it stays off.
    expect(rule.steps.some((step) => step.type === 'telegram')).toBe(false)
  })

  test('rejects venues the terminal does not have', async () => {
    const tools = buildAutomationTools(deps())
    const result = (await tools.create_simple_alert.execute!(
      {
        market: 'nope',
        pair: 'BTC-USDT',
        alert: {
          kind: 'percent-move',
          direction: 'up',
          percent: 5,
          window: '1h',
        },
      },
      callOpts,
    )) as { error?: string }
    expect(result.error).toContain('okx')
    expect(useNotificationStore.getState().rules).toHaveLength(0)
  })

  test('refuses to edit a custom flow as if it were a simple alert', async () => {
    const ruleId = useNotificationStore.getState().createRule('Custom')
    const tools = buildAutomationTools(deps())
    const result = (await tools.update_simple_alert.execute!(
      {
        ruleId,
        alert: { kind: 'price-level', direction: 'below', price: 1 },
      },
      callOpts,
    )) as { error?: string }
    expect(result.error).toContain('custom flow')
  })
})

describe('alert flows', () => {
  const deps = () => makeDeps({ surface: 'notifications' })

  test('lands uncommitted, and binds separately', async () => {
    const tools = buildAutomationTools(deps())
    const created = (await tools.create_alert_flow.execute!(
      {
        name: 'Fill watcher',
        steps: [
          { id: 'event', type: 'order-executed', data: { side: 'any' } },
          { id: 'toast', type: 'local-toast', data: {} },
        ],
        edges: [{ source: 'event', target: 'toast' }],
      },
      callOpts,
    )) as { ruleId: string; validation: { valid: boolean } }

    const state = useNotificationStore.getState()
    expect(
      state.rules.find((r) => r.id === created.ruleId)!.steps,
    ).toHaveLength(0)
    expect(state.draft?.currentSteps.map((s) => s.id).sort()).toEqual([
      'event',
      'toast',
    ])
    expect(created.validation.valid).toBe(true)

    const bound = (await tools.bind_alert.execute!(
      { ruleId: created.ruleId, market: 'okx', pair: 'eth-usdt' },
      callOpts,
    )) as { watching?: { pair: string } }
    expect(bound.watching?.pair).toBe('ETH-USDT')

    const twice = (await tools.bind_alert.execute!(
      { ruleId: created.ruleId, market: 'okx', pair: 'ETH-USDT' },
      callOpts,
    )) as { error?: string }
    expect(twice.error).toContain('Already watching')
  })
})

describe('shared tools', () => {
  test('every surface can hand over to the others', async () => {
    const routes: Array<{ to: string }> = []
    const tools = buildAutomationTools(
      makeDeps({ surface: 'notifications', navigate: (r) => routes.push(r) }),
    )
    const result = (await tools.handoff_to_builder.execute!(
      { target: 'workflows', message: 'Bracket the entry this alert watches.' },
      callOpts,
    )) as { handedOff?: string }

    expect(result.handedOff).toBe('workflows')
    expect(routes).toEqual([{ to: 'workflows', scriptId: undefined }])
    expect(consumeAssistantIntent('workflows')).toEqual({
      prompt: 'Bracket the entry this alert watches.',
    })
  })

  test('ask_user has no execute — only the user can answer it', () => {
    const tools = buildAutomationTools(makeDeps())
    expect(tools.ask_user.execute).toBeUndefined()
  })
})

describe('tool labels', () => {
  test('every automation tool has one, and none is left behind', () => {
    const names = allAutomationToolNames(makeDeps())
    expect(names.filter((name) => !(name in AUTOMATION_TOOL_LABELS))).toEqual(
      [],
    )
    expect(
      Object.keys(AUTOMATION_TOOL_LABELS).filter(
        (name) => !names.includes(name),
      ),
    ).toEqual([])
  })
})
