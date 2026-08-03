// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Starter workflows for the empty state.
 *
 * Every template is built only from step types that `pairlens-core` actually
 * registers (trigger, market-order, limit-order, take-profit, stop-loss,
 * condition, wait) and every one validates as-is — picking a template opens a
 * runnable draft, not a homework assignment with blanks in it.
 *
 * A workflow hangs off an order: the trigger step is the order the user places
 * from the trade panel, and everything downstream reacts to that fill. So the
 * templates are order plans — bracket, ladder, scale-out — not price watchers.
 * Price watchers are Notifications, one section up.
 */
import { ArrowDownWideNarrow, Layers, Timer, Wallet } from 'lucide-react'

import type { StarterTemplate } from '../starter-empty-state'
import type {
  WorkflowEdgeDSL,
  WorkflowStepDSL,
} from '@pairlens/workflow-engine/types'
import { useWorkflowStore } from '@/stores/workflow-store'

/** `createWorkflow` seeds every new workflow with a trigger under this id. */
const TRIGGER_ID = 'trigger'

type TemplateStep = {
  /** Local id, namespaced on apply so two templates never collide. */
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

type TemplateEdge = {
  /** `TRIGGER_ID` or a local step id. */
  source: string
  sourceHandle?: string
  target: string
}

export type WorkflowTemplate = StarterTemplate & {
  /** Where the seeded trigger goes, so the graph reads top-down. */
  triggerPosition: { x: number; y: number }
  steps: Array<TemplateStep>
  edges: Array<TemplateEdge>
}

export const WORKFLOW_TEMPLATES: Array<WorkflowTemplate> = [
  {
    id: 'bracket',
    title: 'Bracket the fill',
    description:
      'The one every position wants: an exit above and an exit below, both resting the moment the order fills.',
    icon: Layers,
    chips: ['Take profit +5%', 'Stop loss -3%'],
    triggerPosition: { x: 250, y: 40 },
    steps: [
      {
        id: 'tp',
        type: 'take-profit',
        position: { x: 20, y: 240 },
        data: {
          triggerMode: 'percent',
          triggerValue: 5,
          sizePercent: 100,
          orderType: 'market',
          limitPrice: 0,
        },
      },
      {
        id: 'sl',
        type: 'stop-loss',
        position: { x: 480, y: 240 },
        data: {
          triggerMode: 'percent',
          triggerValue: 3,
          sizePercent: 100,
          orderType: 'market',
          limitPrice: 0,
        },
      },
    ],
    edges: [
      { source: TRIGGER_ID, target: 'tp' },
      { source: TRIGGER_ID, target: 'sl' },
    ],
  },
  {
    id: 'scale-out',
    title: 'Scale out in three',
    description:
      'Take a third off at each of three levels instead of guessing one exit and living with it.',
    icon: ArrowDownWideNarrow,
    chips: ['+2% / 33%', '+5% / 33%', '+10% / 34%'],
    triggerPosition: { x: 250, y: 40 },
    steps: [
      {
        id: 'tp1',
        type: 'take-profit',
        position: { x: -60, y: 240 },
        data: {
          triggerMode: 'percent',
          triggerValue: 2,
          sizePercent: 33,
          orderType: 'market',
          limitPrice: 0,
        },
      },
      {
        id: 'tp2',
        type: 'take-profit',
        position: { x: 250, y: 240 },
        data: {
          triggerMode: 'percent',
          triggerValue: 5,
          sizePercent: 33,
          orderType: 'market',
          limitPrice: 0,
        },
      },
      {
        id: 'tp3',
        type: 'take-profit',
        position: { x: 560, y: 240 },
        data: {
          triggerMode: 'percent',
          triggerValue: 10,
          sizePercent: 34,
          orderType: 'market',
          limitPrice: 0,
        },
      },
    ],
    edges: [
      { source: TRIGGER_ID, target: 'tp1' },
      { source: TRIGGER_ID, target: 'tp2' },
      { source: TRIGGER_ID, target: 'tp3' },
    ],
  },
  {
    id: 'ladder-entry',
    title: 'Ladder the entry',
    description:
      'Rest half the size 1% under the fill and half 2.5% under it, so a dip adds instead of hurting.',
    icon: Wallet,
    chips: ['50% at -1%', '50% at -2.5%'],
    triggerPosition: { x: 250, y: 40 },
    steps: [
      {
        id: 'rung1',
        type: 'limit-order',
        position: { x: 20, y: 240 },
        data: {
          side: 'inherit',
          sizeMode: 'percent',
          size: 50,
          priceMode: 'offset-percent',
          priceValue: -1,
        },
      },
      {
        id: 'rung2',
        type: 'limit-order',
        position: { x: 480, y: 240 },
        data: {
          side: 'inherit',
          sizeMode: 'percent',
          size: 50,
          priceMode: 'offset-percent',
          priceValue: -2.5,
        },
      },
    ],
    edges: [
      { source: TRIGGER_ID, target: 'rung1' },
      { source: TRIGGER_ID, target: 'rung2' },
    ],
  },
  {
    id: 'cut-if-stalls',
    title: 'Cut it if it stalls',
    description:
      'Wait fifteen minutes, and if the trade is underwater by then, close it at market and move on.',
    icon: Timer,
    chips: ['Wait 15m', 'Down 1%', 'Market out'],
    triggerPosition: { x: 250, y: 20 },
    steps: [
      {
        id: 'pause',
        type: 'wait',
        position: { x: 250, y: 200 },
        data: { duration: 15, unit: 'minutes' },
      },
      {
        id: 'check',
        type: 'condition',
        position: { x: 250, y: 380 },
        data: { conditionType: 'percent-change', value: -1 },
      },
      {
        id: 'exit',
        type: 'market-order',
        position: { x: 130, y: 600 },
        data: { side: 'opposite', sizeMode: 'percent', size: 100 },
      },
    ],
    edges: [
      { source: TRIGGER_ID, target: 'pause' },
      { source: 'pause', target: 'check' },
      { source: 'check', sourceHandle: 'pass', target: 'exit' },
    ],
  },
]

/**
 * The DSL a template expands to, trigger included.
 *
 * Pure, so a test can hand it straight to `validateWorkflow` — a template that
 * opens with a red commit bar is worse than no template at all.
 */
export function workflowTemplateGraph(template: WorkflowTemplate): {
  steps: Array<WorkflowStepDSL>
  edges: Array<WorkflowEdgeDSL>
} {
  // Namespaced so the ids stay readable in the DSL but can never collide with
  // a step the user adds later from the palette (`<type>-<timestamp>`).
  const stepId = (local: string) => `tpl-${template.id}-${local}`
  const resolve = (ref: string) =>
    ref === TRIGGER_ID ? TRIGGER_ID : stepId(ref)

  return {
    steps: [
      {
        id: TRIGGER_ID,
        type: 'trigger',
        position: template.triggerPosition,
        data: {},
      },
      ...template.steps.map((step) => ({
        id: stepId(step.id),
        type: step.type,
        position: step.position,
        data: step.data,
      })),
    ],
    edges: template.edges.map((edge, index) => ({
      id: `tpl-${template.id}-e${index}`,
      source: resolve(edge.source),
      sourceHandle: edge.sourceHandle,
      target: resolve(edge.target),
    })),
  }
}

/**
 * Create the workflow and open it in the editor, pre-filled.
 *
 * Deliberately the same path a hand-built workflow takes — `createWorkflow`,
 * `startEditing`, then the very `addStep`/`addEdge` calls the canvas makes on
 * drop — so the result is an ordinary draft sitting in the commit bar, ready
 * to review, edit, or discard. No second creation route to keep in sync.
 */
export function applyWorkflowTemplate(template: WorkflowTemplate): string {
  const store = useWorkflowStore.getState()

  const workflowId = store.createWorkflow(template.title)
  store.selectWorkflow(workflowId)
  store.startEditing(workflowId)

  const { steps, edges } = workflowTemplateGraph(template)

  // `createWorkflow` already seeded the trigger; only move it.
  store.updateStepPosition(TRIGGER_ID, template.triggerPosition)
  for (const step of steps) {
    if (step.id === TRIGGER_ID) continue
    store.addStep(step)
  }
  for (const edge of edges) store.addEdge(edge)

  return workflowId
}
