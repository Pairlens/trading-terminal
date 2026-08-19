// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The assistant's tool set for the two automation builders: Workflows (order
 * plans that hang off a trade you place) and Notifications (alerts that watch
 * the market).
 *
 * Sibling of `assistant-tools.ts` rather than more branches inside it. The
 * two sets share nothing but the shared tools: one writes Python and deploys
 * bots, this one writes step graphs. Keeping them apart is also what keeps
 * each surface's tool list short enough for the model to hold in its head.
 *
 * Safety is structural again, and it is the same shape both stores already
 * gave the user. Every graph this writes lands in the OPEN DRAFT, recorded as
 * pending changes: the commit bar shows the diff and the user commits it.
 * There is no tool here that commits, and none that executes — a workflow only
 * ever runs from an order the user places, through the ordinary guarded order
 * path. Alerts are the milder half, but the same rule holds: the assistant
 * never enrols a delivery channel that needs a secret the user has not set up.
 */
import { tool } from 'ai'
import { z } from 'zod'

import {
  getStepType as getWorkflowStepType,
  getAllStepTypes as getWorkflowStepTypes,
} from '@pairlens/workflow-engine/step-registry'
import {
  getStepType as getNotificationStepType,
  getAllStepTypes as getNotificationStepTypes,
} from '@pairlens/notification-engine/step-registry'
import { validateWorkflow } from '@pairlens/workflow-engine/validator'
import { validateRule } from '@pairlens/notification-engine/validator'
import {
  PERCENT_WINDOWS,
  isSimpleAlert,
  readSimpleAlert,
} from '@pairlens/notification-engine/simple-alerts'

import { buildSharedAssistantTools } from './assistant-shared-tools'
import { applyGraphToDraft } from './graph-apply'
import type {
  AssistantSharedDeps,
  AssistantSurface,
} from './assistant-shared-tools'
import type { WorkflowStepTypeDefinition } from '@pairlens/workflow-engine/step-registry'
import type { NotificationStepTypeDefinition } from '@pairlens/notification-engine/step-registry'
import type { DesiredEdge, DesiredStep, GraphDraftAccess } from './graph-apply'
import type { SimpleAlertSpec } from '@pairlens/notification-engine/simple-alerts'
import type { AssistantMarketDataHandle } from './assistant-tools'
import { normalizePairKey } from '@/lib/pairs'
import { useNotificationStore } from '@/stores/notification-store'
import { useWorkflowStore } from '@/stores/workflow-store'

export type AutomationSurface = Extract<
  AssistantSurface,
  'workflows' | 'notifications'
>

export type AutomationToolDeps = AssistantSharedDeps & {
  surface: AutomationSurface
  getMarketData: () => AssistantMarketDataHandle | null
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const stepSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "Your own id for this step, referenced by the edges. Reuse an existing step's id to edit it in place.",
    ),
  type: z.string().min(1).describe('A type id from get_step_reference'),
  data: z
    .record(z.unknown())
    .optional()
    .describe('Config values, keyed as get_step_reference lists them'),
})

const edgeSchema = z.object({
  source: z.string().min(1),
  sourceHandle: z
    .string()
    .optional()
    .describe(
      "Only for steps with more than one output, e.g. 'pass' / 'fail' on a condition",
    ),
  target: z.string().min(1),
})

/** Positions are ours to decide, so the model only ever sends the shape. */
function toDesired(
  steps: Array<z.infer<typeof stepSchema>>,
): Array<DesiredStep> {
  return steps.map((step) => ({
    id: step.id,
    type: step.type,
    data: step.data ?? {},
  }))
}

function toDesiredEdges(
  edges: Array<z.infer<typeof edgeSchema>>,
): Array<DesiredEdge> {
  return edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  }))
}

/**
 * A registered step type from either engine. Typed off the real definitions
 * on purpose: the first version described the shape by hand, spelled
 * `configSchema` as `configFields`, and structurally still accepted the real
 * definition — so every step reported an empty config and the model had no
 * choice but to guess key names off the display labels.
 */
type AnyStepDefinition =
  | WorkflowStepTypeDefinition
  | NotificationStepTypeDefinition

/** What the model needs about a step type: what it is and what it takes. */
function describeStepType(def: AnyStepDefinition) {
  const compat = 'compat' in def ? def.compat : undefined
  return {
    type: def.type,
    label: def.label,
    category: def.category,
    outputs: def.handles.outputs.map((handle) => handle.id),
    acceptsInput: def.handles.inputs.length > 0,
    requires: compat?.requires,
    // A complete, valid data object to start from: every key the step needs,
    // spelled the way the runtime spells it.
    defaults: def.defaultData(),
    config: def.configSchema.map((field) => ({
      key: field.key,
      type: field.type,
      label: field.label,
      options: field.options?.map((option) => option.value),
      min: field.min,
      max: field.max,
      onlyWhen:
        'showWhen' in field && field.showWhen
          ? `${field.showWhen.key} is ${JSON.stringify(field.showWhen.equals)}`
          : undefined,
    })),
  }
}

function validationSummary(
  errors: Array<{ stepId?: string; message: string }>,
) {
  return errors.map((error) =>
    error.stepId ? `${error.stepId}: ${error.message}` : error.message,
  )
}

/**
 * The step types behind a failed validation, described. Returning these with
 * the errors turns "that field name is wrong" from a guessing loop into one
 * more call.
 */
function expectedConfigFor(
  errors: Array<{ stepId?: string; message: string }>,
  steps: Array<{ id: string; type: string }>,
  lookup: (type: string) => AnyStepDefinition | undefined,
) {
  const failing = new Set(
    errors.map((error) => error.stepId).filter((id): id is string => !!id),
  )
  const described = [
    ...new Set(
      steps.filter((step) => failing.has(step.id)).map((step) => step.type),
    ),
  ]
    .map(lookup)
    .filter((def): def is AnyStepDefinition => def !== undefined)
    .map(describeStepType)
  return described.length > 0 ? described : undefined
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

/** The workflow store, as the graph applier wants to see it. */
function workflowDraftAccess(): GraphDraftAccess {
  const store = useWorkflowStore.getState()
  return {
    getDraft: () => useWorkflowStore.getState().draft,
    addStep: store.addStep,
    removeStep: store.removeStep,
    updateStepPosition: store.updateStepPosition,
    updateStepData: store.updateStepData,
    addEdge: store.addEdge,
    removeEdge: store.removeEdge,
  }
}

/** Open (or keep open) a draft on this workflow, so edits are reviewable. */
function openWorkflowDraft(workflowId: string): void {
  const store = useWorkflowStore.getState()
  if (store.draft?.workflowId === workflowId) return
  store.selectWorkflow(workflowId)
  store.startEditing(workflowId)
}

function currentWorkflow(workflowId?: string) {
  const store = useWorkflowStore.getState()
  const id = workflowId ?? store.draft?.workflowId ?? store.activeWorkflowId
  if (!id) {
    return {
      error:
        'No workflow is open. Pass workflowId, or start one with create_workflow.',
    } as const
  }
  const workflow = store.workflows.find((entry) => entry.id === id)
  if (!workflow) {
    return {
      error: `No workflow with id '${id}'. Use list_workflows.`,
    } as const
  }
  return { workflow } as const
}

/** Validate what the draft holds right now, not the committed snapshot. */
function validateWorkflowDraft(workflowId: string) {
  const store = useWorkflowStore.getState()
  const workflow = store.workflows.find((entry) => entry.id === workflowId)
  if (!workflow) return { valid: false, errors: ['Workflow disappeared.'] }
  const draft = store.draft?.workflowId === workflowId ? store.draft : null
  const steps = draft?.currentSteps ?? workflow.steps
  const result = validateWorkflow({
    ...workflow,
    steps,
    edges: draft?.currentEdges ?? workflow.edges,
  })
  return {
    valid: result.valid,
    errors: validationSummary(result.errors),
    expectedConfig: result.valid
      ? undefined
      : expectedConfigFor(result.errors, steps, getWorkflowStepType),
  }
}

/** Workflow tools need nothing from deps: the graph is entirely local. */
export function buildWorkflowTools() {
  return {
    list_workflows: tool({
      description:
        "List the user's workflows with their size and whether one has uncommitted changes.",
      inputSchema: z.object({}),
      execute: async () => {
        const store = useWorkflowStore.getState()
        store.load()
        const state = useWorkflowStore.getState()
        return {
          workflows: state.workflows.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            steps: workflow.steps.length,
            edges: workflow.edges.length,
            editing: state.draft?.workflowId === workflow.id,
            updatedAt: new Date(workflow.updatedAt).toISOString(),
          })),
        }
      },
    }),

    get_workflow: tool({
      description:
        'Read a workflow: every step with its config, every edge, and what validation says about it. Defaults to the one open in the builder.',
      inputSchema: z.object({ workflowId: z.string().optional() }),
      execute: async ({ workflowId }) => {
        const found = currentWorkflow(workflowId)
        if ('error' in found) return found
        const store = useWorkflowStore.getState()
        const draft =
          store.draft?.workflowId === found.workflow.id ? store.draft : null
        return {
          id: found.workflow.id,
          name: found.workflow.name,
          uncommittedChanges: draft?.pendingChanges.length ?? 0,
          steps: (draft?.currentSteps ?? found.workflow.steps).map((step) => ({
            id: step.id,
            type: step.type,
            data: step.data,
          })),
          edges: (draft?.currentEdges ?? found.workflow.edges).map((edge) => ({
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: edge.target,
          })),
          validation: validateWorkflowDraft(found.workflow.id),
        }
      },
    }),

    get_step_reference: tool({
      description:
        'List every step type this terminal can run: its category, its outputs, a complete `defaults` data object, and every config key with its allowed values. Call it before writing a graph and copy `defaults` for each step you add, changing only the keys you mean to change. The available steps come from the installed plugins, and both the type ids and the config keys are exact — a display label is not a key.',
      inputSchema: z.object({}),
      execute: async () => {
        const types = getWorkflowStepTypes()
        if (types.length === 0) {
          return {
            error:
              'The step registry is empty — the plugin system has not finished loading. Ask the user to retry in a moment.',
          }
        }
        return { steps: types.map(describeStepType) }
      },
    }),

    create_workflow: tool({
      description:
        'Create a workflow and lay out its steps. It opens as an UNCOMMITTED draft: the user reviews the diff and presses Commit, which is the only way it becomes real. Every workflow starts from the seeded step with id "trigger" (the order the user places from the trade panel) — include it in your steps and hang everything else off it.',
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        steps: z.array(stepSchema).min(1).max(30),
        edges: z.array(edgeSchema).max(60),
      }),
      execute: async ({ name, steps, edges }) => {
        const store = useWorkflowStore.getState()
        store.load()
        const workflowId = useWorkflowStore.getState().createWorkflow(name)
        openWorkflowDraft(workflowId)

        const applied = applyGraphToDraft(
          workflowDraftAccess(),
          toDesired(steps),
          toDesiredEdges(edges),
        )
        if ('error' in applied) return applied
        return {
          workflowId,
          applied,
          validation: validateWorkflowDraft(workflowId),
          note: 'Uncommitted. The user commits it from the bar above the canvas; nothing runs until they place an order that uses it.',
        }
      },
    }),

    update_workflow: tool({
      description:
        'Rewrite an open workflow to this exact set of steps and edges: anything you leave out is removed, a step id you reuse keeps its place on the canvas. Read it with get_workflow first. Lands as uncommitted changes for the user to review.',
      inputSchema: z.object({
        workflowId: z.string().optional(),
        name: z.string().min(1).max(80).optional(),
        steps: z.array(stepSchema).min(1).max(30),
        edges: z.array(edgeSchema).max(60),
      }),
      execute: async ({ workflowId, name, steps, edges }) => {
        const found = currentWorkflow(workflowId)
        if ('error' in found) return found
        const id = found.workflow.id
        openWorkflowDraft(id)
        if (name !== undefined)
          useWorkflowStore.getState().renameWorkflow(id, name)

        const applied = applyGraphToDraft(
          workflowDraftAccess(),
          toDesired(steps),
          toDesiredEdges(edges),
        )
        if ('error' in applied) return applied
        return {
          workflowId: id,
          applied,
          validation: validateWorkflowDraft(id),
          note: 'Uncommitted — the user reviews the diff and commits.',
        }
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const channelsSchema = z
  .object({
    toast: z.boolean().default(true),
    os: z.boolean().default(true),
    telegram: z
      .boolean()
      .default(false)
      .describe(
        'Only when the user asked for Telegram AND has connected a bot token in Settings',
      ),
  })
  .describe('Where the alert is delivered. Defaults are in-app plus OS.')

const simpleAlertSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('price-level'),
    direction: z.enum(['above', 'below']),
    price: z.number().positive(),
    channels: channelsSchema.optional(),
  }),
  z.object({
    kind: z.literal('percent-move'),
    direction: z.enum(['up', 'down', 'either']),
    percent: z.number().positive().max(100),
    window: z.enum(PERCENT_WINDOWS),
    channels: channelsSchema.optional(),
  }),
])

const DEFAULT_CHANNELS = { toast: true, os: true, telegram: false }

function toSpec(input: z.infer<typeof simpleAlertSchema>): SimpleAlertSpec {
  const channels = { ...DEFAULT_CHANNELS, ...(input.channels ?? {}) }
  return input.kind === 'price-level'
    ? {
        kind: 'price-level',
        direction: input.direction,
        price: input.price,
        channels,
      }
    : {
        kind: 'percent-move',
        direction: input.direction,
        percent: input.percent,
        window: input.window,
        channels,
      }
}

function notificationDraftAccess(): GraphDraftAccess {
  const store = useNotificationStore.getState()
  return {
    getDraft: () => useNotificationStore.getState().draft,
    addStep: store.addStep,
    removeStep: store.removeStep,
    updateStepPosition: store.updateStepPosition,
    updateStepData: store.updateStepData,
    addEdge: store.addEdge,
    removeEdge: store.removeEdge,
  }
}

function openRuleDraft(ruleId: string): void {
  const store = useNotificationStore.getState()
  if (store.draft?.ruleId === ruleId) return
  store.selectRule(ruleId)
  store.startEditing(ruleId)
}

function currentRule(ruleId?: string) {
  const store = useNotificationStore.getState()
  const id = ruleId ?? store.draft?.ruleId ?? store.activeRuleId
  if (!id) {
    return {
      error:
        'No alert is open. Pass ruleId, or make one with create_simple_alert / create_alert_flow.',
    } as const
  }
  const rule = store.rules.find((entry) => entry.id === id)
  if (!rule)
    return { error: `No alert with id '${id}'. Use list_alerts.` } as const
  return { rule } as const
}

function validateRuleDraft(ruleId: string) {
  const store = useNotificationStore.getState()
  const rule = store.rules.find((entry) => entry.id === ruleId)
  if (!rule) return { valid: false, errors: ['Alert disappeared.'] }
  const draft = store.draft?.ruleId === ruleId ? store.draft : null
  const steps = draft?.currentSteps ?? rule.steps
  const result = validateRule({
    ...rule,
    steps,
    edges: draft?.currentEdges ?? rule.edges,
  })
  return {
    valid: result.valid,
    errors: validationSummary(result.errors),
    expectedConfig: result.valid
      ? undefined
      : expectedConfigFor(result.errors, steps, getNotificationStepType),
  }
}

/**
 * A pair the connectors will recognise. DEX ids carry a raw address, which
 * `normalizePairKey` knows not to upper-case, on Solana as well as on EVM.
 */
function normalizePair(pair: string): string {
  return normalizePairKey(pair)
}

function checkTarget(
  deps: AutomationToolDeps,
  market: string,
  pair: string,
): { error: string } | null {
  const marketData = deps.getMarketData()
  const venues = marketData?.availableMarkets.map((m) => m.marketId) ?? []
  if (venues.length > 0 && !venues.includes(market)) {
    return {
      error: `'${market}' is not a connected venue. Available: ${venues.join(', ')}.`,
    }
  }
  if (!/^[^\s-]+-[^\s-]+$/.test(pair)) {
    return { error: `'${pair}' is not a BASE-QUOTE pair like BTC-USDT.` }
  }
  return null
}

export function buildNotificationTools(deps: AutomationToolDeps) {
  return {
    list_alerts: tool({
      description:
        "List the user's alerts: which are the two-field simple kind, which are custom flows, what each is bound to, and whether it is switched on.",
      inputSchema: z.object({}),
      execute: async () => {
        useNotificationStore.getState().load()
        const state = useNotificationStore.getState()
        return {
          alerts: state.rules.map((rule) => ({
            id: rule.id,
            name: rule.name,
            kind: isSimpleAlert(rule) ? 'simple' : 'flow',
            spec: readSimpleAlert(rule),
            enabled: rule.enabled !== false,
            cooldownSeconds: rule.cooldown,
            boundTo: state.bindings
              .filter((binding) => binding.ruleId === rule.id)
              .map((binding) => ({
                pair: binding.pair,
                market: binding.market,
                enabled: binding.enabled,
              })),
          })),
        }
      },
    }),

    get_alert: tool({
      description:
        "Read one alert's full graph and what validation says about it. Defaults to the one open in the builder.",
      inputSchema: z.object({ ruleId: z.string().optional() }),
      execute: async ({ ruleId }) => {
        const found = currentRule(ruleId)
        if ('error' in found) return found
        const store = useNotificationStore.getState()
        const draft = store.draft?.ruleId === found.rule.id ? store.draft : null
        return {
          id: found.rule.id,
          name: found.rule.name,
          kind: isSimpleAlert(found.rule) ? 'simple' : 'flow',
          spec: readSimpleAlert(found.rule),
          enabled: found.rule.enabled !== false,
          cooldownSeconds: found.rule.cooldown,
          uncommittedChanges: draft?.pendingChanges.length ?? 0,
          steps: (draft?.currentSteps ?? found.rule.steps).map((step) => ({
            id: step.id,
            type: step.type,
            data: step.data,
          })),
          edges: (draft?.currentEdges ?? found.rule.edges).map((edge) => ({
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: edge.target,
          })),
          boundTo: store.bindings
            .filter((binding) => binding.ruleId === found.rule.id)
            .map((binding) => ({ pair: binding.pair, market: binding.market })),
          validation: validateRuleDraft(found.rule.id),
        }
      },
    }),

    get_step_reference: tool({
      description:
        'List every alert step type available: the events that can fire a rule, the conditions that filter them, and the channels that deliver, each with a complete `defaults` data object and its exact config keys. Call it before writing a flow and copy `defaults` for each step, changing only what you mean to change. What is installed decides what exists, and a display label is not a key.',
      inputSchema: z.object({}),
      execute: async () => {
        const types = getNotificationStepTypes()
        if (types.length === 0) {
          return {
            error:
              'The step registry is empty — the plugin system has not finished loading. Ask the user to retry in a moment.',
          }
        }
        return { steps: types.map(describeStepType) }
      },
    }),

    create_simple_alert: tool({
      description:
        'Create a price-level or percent-move alert on one pair, armed immediately. This is the right tool for almost every alert request ("tell me when BTC hits 100k", "tell me if ETH drops 5% in an hour") — reach for create_alert_flow only when the user needs a condition, a non-price event, or a webhook.',
      inputSchema: z.object({
        market: z.string().describe('Venue id, e.g. okx'),
        pair: z.string().describe('BASE-QUOTE, e.g. BTC-USDT'),
        alert: simpleAlertSchema,
      }),
      execute: async ({ market, pair, alert }) => {
        const normalized = normalizePair(pair)
        const bad = checkTarget(deps, market, normalized)
        if (bad) return bad
        const store = useNotificationStore.getState()
        store.load()
        const ruleId = useNotificationStore.getState().createSimpleAlert({
          pair: normalized,
          market,
          spec: toSpec(alert),
        })
        const rule = useNotificationStore
          .getState()
          .rules.find((entry) => entry.id === ruleId)
        return {
          ruleId,
          name: rule?.name,
          cooldownSeconds: rule?.cooldown,
          note: 'Live now, and it fires while this terminal is open.',
        }
      },
    }),

    update_simple_alert: tool({
      description:
        "Change a simple alert's level, direction, percentage, window or channels. Only works on alerts list_alerts calls 'simple' — a custom flow is edited with update_alert_flow.",
      inputSchema: z.object({
        ruleId: z.string(),
        alert: simpleAlertSchema,
      }),
      execute: async ({ ruleId, alert }) => {
        const store = useNotificationStore.getState()
        const rule = store.rules.find((entry) => entry.id === ruleId)
        if (!rule) return { error: `No alert with id '${ruleId}'.` }
        if (!isSimpleAlert(rule)) {
          return {
            error:
              'That alert is a custom flow, not a simple alert. Read it with get_alert and edit it with update_alert_flow.',
          }
        }
        store.updateSimpleAlert(ruleId, toSpec(alert))
        const updated = useNotificationStore
          .getState()
          .rules.find((entry) => entry.id === ruleId)
        return {
          ruleId,
          name: updated?.name,
          cooldownSeconds: updated?.cooldown,
        }
      },
    }),

    create_alert_flow: tool({
      description:
        'Create a custom alert as a step graph: one or more event steps, optional conditions, and at least one channel step. It opens as an UNCOMMITTED draft the user commits. Bind it to a pair with bind_alert, or it watches nothing.',
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        steps: z.array(stepSchema).min(2).max(20),
        edges: z.array(edgeSchema).max(40),
      }),
      execute: async ({ name, steps, edges }) => {
        const store = useNotificationStore.getState()
        store.load()
        const ruleId = useNotificationStore.getState().createRule(name)
        openRuleDraft(ruleId)

        const applied = applyGraphToDraft(
          notificationDraftAccess(),
          toDesired(steps),
          toDesiredEdges(edges),
        )
        if ('error' in applied) return applied
        return {
          ruleId,
          applied,
          validation: validateRuleDraft(ruleId),
          note: 'Uncommitted. The user commits it from the bar above the canvas, and it needs a binding (bind_alert) before it can fire.',
        }
      },
    }),

    update_alert_flow: tool({
      description:
        'Rewrite an alert flow to this exact set of steps and edges: anything you leave out is removed, a step id you reuse keeps its place. Read it with get_alert first. Lands as uncommitted changes.',
      inputSchema: z.object({
        ruleId: z.string().optional(),
        name: z.string().min(1).max(80).optional(),
        steps: z.array(stepSchema).min(2).max(20),
        edges: z.array(edgeSchema).max(40),
      }),
      execute: async ({ ruleId, name, steps, edges }) => {
        const found = currentRule(ruleId)
        if ('error' in found) return found
        const id = found.rule.id
        openRuleDraft(id)
        if (name !== undefined)
          useNotificationStore.getState().renameRule(id, name)

        const applied = applyGraphToDraft(
          notificationDraftAccess(),
          toDesired(steps),
          toDesiredEdges(edges),
        )
        if ('error' in applied) return applied
        return {
          ruleId: id,
          applied,
          validation: validateRuleDraft(id),
          note: 'Uncommitted — the user reviews the diff and commits.',
        }
      },
    }),

    bind_alert: tool({
      description:
        'Point an alert at a pair on a venue. A rule with no binding never fires; one rule can watch several pairs.',
      inputSchema: z.object({
        ruleId: z.string(),
        market: z.string(),
        pair: z.string(),
      }),
      execute: async ({ ruleId, market, pair }) => {
        const store = useNotificationStore.getState()
        if (!store.rules.some((rule) => rule.id === ruleId)) {
          return { error: `No alert with id '${ruleId}'. Use list_alerts.` }
        }
        const normalized = normalizePair(pair)
        const bad = checkTarget(deps, market, normalized)
        if (bad) return bad
        if (
          store.bindings.some(
            (binding) =>
              binding.ruleId === ruleId &&
              binding.pair === normalized &&
              binding.market === market,
          )
        ) {
          return { error: `Already watching ${normalized} on ${market}.` }
        }
        const bindingId = store.addBinding(ruleId, normalized, market)
        return { bindingId, watching: { pair: normalized, market } }
      },
    }),
  }
}

// ---------------------------------------------------------------------------

export function buildAutomationTools(deps: AutomationToolDeps) {
  return {
    ...buildSharedAssistantTools(deps),
    ...(deps.surface === 'workflows'
      ? buildWorkflowTools()
      : buildNotificationTools(deps)),
  }
}

export type AutomationToolSet = ReturnType<typeof buildAutomationTools>

export type AutomationWorkflowContext = {
  id: string
  name: string
  steps: number
  editing: boolean
  uncommittedChanges: number
}

export type AutomationAlertContext = {
  id: string
  name: string
  kind: 'simple' | 'flow'
  enabled: boolean
  watching: Array<string>
}

export type AutomationPromptContext = {
  surface: AutomationSurface
  workflows: Array<AutomationWorkflowContext>
  alerts: Array<AutomationAlertContext>
  /** Step type ids the installed plugins actually registered. */
  stepTypes: Array<string>
  venues: Array<string>
}

/**
 * The fresh snapshot the transport reads at send time, so the prompt always
 * describes the page as it is now rather than as it was when the chat opened.
 */
export function collectAutomationPromptContext(
  deps: AutomationToolDeps,
): AutomationPromptContext {
  const workflowState = useWorkflowStore.getState()
  const notificationState = useNotificationStore.getState()

  return {
    surface: deps.surface,
    workflows: workflowState.workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      steps: workflow.steps.length,
      editing: workflowState.draft?.workflowId === workflow.id,
      uncommittedChanges:
        workflowState.draft?.workflowId === workflow.id
          ? workflowState.draft.pendingChanges.length
          : 0,
    })),
    alerts: notificationState.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      kind: isSimpleAlert(rule) ? ('simple' as const) : ('flow' as const),
      enabled: rule.enabled !== false,
      watching: notificationState.bindings
        .filter((binding) => binding.ruleId === rule.id)
        .map((binding) => `${binding.pair} on ${binding.market}`),
    })),
    stepTypes: (deps.surface === 'workflows'
      ? getWorkflowStepTypes()
      : getNotificationStepTypes()
    ).map((def) => def.type),
    venues: deps.getMarketData()?.availableMarkets.map((m) => m.marketId) ?? [],
  }
}

/**
 * Every tool either builder can offer. Deduped: both surfaces expose a
 * `get_step_reference`, over their own registry.
 */
export function allAutomationToolNames(
  deps: AutomationToolDeps,
): Array<string> {
  return [
    ...new Set([
      ...Object.keys(buildSharedAssistantTools(deps)),
      ...Object.keys(buildWorkflowTools()),
      ...Object.keys(buildNotificationTools(deps)),
    ]),
  ]
}
