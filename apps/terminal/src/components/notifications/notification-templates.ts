// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Starter notification rules for the empty state.
 *
 * Built only from step types the notification engine actually registers —
 * events (price-alert, order-executed, indicator-alert, candle-close),
 * conditions (percent-change, time-window) and channels (local-toast,
 * os-notification). Webhook is deliberately absent: it needs a URL, so a
 * template using it would open invalid.
 *
 * Each template also gets a binding, because a rule with no pair attached is
 * inert and the empty state's whole promise is "click this and it works".
 * BTC-USDT on OKX matches the default the workspace templates use; the Pairs
 * panel under the rule list is where the user retargets it.
 */
import {
  Bell,
  CandlestickChart,
  Clock,
  Receipt,
  SquareFunction,
} from 'lucide-react'

import type { StarterTemplate } from '../starter-empty-state'
import type {
  NotificationEdgeDSL,
  NotificationStepDSL,
} from '@pairlens/notification-engine/types'
import type { TFunction } from 'i18next'
import { useNotificationStore } from '@/stores/notification-store'
import i18n from '@/lib/i18n'

/** Where a template's rule points until the user says otherwise. */
export const TEMPLATE_PAIR = 'BTC-USDT'
export const TEMPLATE_MARKET = 'okx'

type TemplateStep = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

type TemplateEdge = {
  source: string
  sourceHandle?: string
  target: string
}

export type NotificationTemplate = StarterTemplate & {
  /**
   * Price-level alerts already have a dedicated creation path (the chart's
   * right-click "alert here"); this flag routes the template through it
   * instead of hand-assembling the same three steps a second time.
   */
  kind: 'price-level' | 'graph'
  steps: Array<TemplateStep>
  edges: Array<TemplateEdge>
}

/** The level the price template starts at — round, obviously a placeholder. */
export const TEMPLATE_PRICE_LEVEL = 100000

export const NOTIFICATION_TEMPLATES: Array<NotificationTemplate> = [
  {
    id: 'price-level',
    kind: 'price-level',
    title: 'Price crosses a level',
    description: `Toast plus an OS notification the moment ${TEMPLATE_PAIR} crosses ${TEMPLATE_PRICE_LEVEL.toLocaleString()}. Drag the level to yours.`,
    icon: Bell,
    chips: ['Price above', 'Toast', 'OS notification'],
    steps: [],
    edges: [],
  },
  {
    id: 'volatile-candle',
    kind: 'graph',
    title: 'The hourly candle went big',
    description:
      'Fires when an hourly candle closes more than 3% from where it opened, up or down.',
    icon: CandlestickChart,
    chips: ['1H close', '±3% body', 'Toast + OS'],
    steps: [
      {
        id: 'event',
        type: 'candle-close',
        position: { x: 0, y: 100 },
        data: { timeframe: '1h' },
      },
      {
        id: 'move',
        type: 'percent-change',
        position: { x: 300, y: 100 },
        data: { percent: 3, direction: 'either' },
      },
      {
        id: 'toast',
        type: 'local-toast',
        position: { x: 620, y: 20 },
        data: {},
      },
      {
        id: 'os',
        type: 'os-notification',
        position: { x: 620, y: 180 },
        data: { sound: true },
      },
    ],
    edges: [
      { source: 'event', target: 'move' },
      { source: 'move', sourceHandle: 'pass', target: 'toast' },
      { source: 'move', sourceHandle: 'pass', target: 'os' },
    ],
  },
  {
    id: 'fills',
    kind: 'graph',
    title: 'Tell me when an order fills',
    description:
      'Every filled order on the pair reaches you, so the terminal can sit in the background.',
    icon: Receipt,
    chips: ['Order filled', 'Any side', 'OS notification'],
    steps: [
      {
        id: 'event',
        type: 'order-executed',
        position: { x: 0, y: 100 },
        data: { side: 'any', status: 'filled' },
      },
      {
        id: 'os',
        type: 'os-notification',
        position: { x: 340, y: 100 },
        data: { sound: true },
      },
      {
        id: 'toast',
        type: 'local-toast',
        position: { x: 340, y: 260 },
        data: {},
      },
    ],
    edges: [
      { source: 'event', target: 'os' },
      { source: 'event', target: 'toast' },
    ],
  },
  {
    id: 'indicator-relay',
    kind: 'graph',
    title: 'Relay my indicator alerts',
    description:
      'Alert conditions declared by your Python indicators become real notifications.',
    icon: SquareFunction,
    chips: ['Any indicator', 'Any condition', 'Toast + OS'],
    steps: [
      {
        id: 'event',
        type: 'indicator-alert',
        position: { x: 0, y: 100 },
        data: { indicator: '', condition: '' },
      },
      {
        id: 'toast',
        type: 'local-toast',
        position: { x: 340, y: 20 },
        data: {},
      },
      {
        id: 'os',
        type: 'os-notification',
        position: { x: 340, y: 180 },
        data: { sound: true },
      },
    ],
    edges: [
      { source: 'event', target: 'toast' },
      { source: 'event', target: 'os' },
    ],
  },
  {
    id: 'session-drop',
    kind: 'graph',
    title: 'Sharp drop, only while I am up',
    description:
      'A 2% down candle wakes you, but only between 13:00 and 21:00 UTC.',
    icon: Clock,
    chips: ['1H close', 'Down 2%', '13-21 UTC'],
    steps: [
      {
        id: 'event',
        type: 'candle-close',
        position: { x: 0, y: 100 },
        data: { timeframe: '1h' },
      },
      {
        id: 'drop',
        type: 'percent-change',
        position: { x: 300, y: 100 },
        data: { percent: 2, direction: 'down' },
      },
      {
        id: 'hours',
        type: 'time-window',
        position: { x: 600, y: 100 },
        data: { startHour: 13, endHour: 21 },
      },
      {
        id: 'os',
        type: 'os-notification',
        position: { x: 900, y: 100 },
        data: { sound: true },
      },
    ],
    edges: [
      { source: 'event', target: 'drop' },
      { source: 'drop', sourceHandle: 'pass', target: 'hours' },
      { source: 'hours', sourceHandle: 'pass', target: 'os' },
    ],
  },
]

/**
 * Localized chips for a template's picker card.
 *
 * Most chips are short English phrases ('Order filled', 'OS notification')
 * that need translating like any other prose. A few are pure notation
 * ('13-21 UTC', the scale-out percentages) with no word to translate, so they
 * pass through unchanged. Where the same chip text appears on more than one
 * card ('OS notification', 'Toast + OS', '1H close', the 'Down N%' pattern
 * shared with the workflow templates) it gets one key under `common.chips`
 * instead of a duplicate per template. Every key's `defaultValue` reads from
 * the template's own `chips` array, so the English here can never drift from
 * what a plugin-contributed template (with no catalog entry) would render.
 */
export function notificationTemplateChips(
  t: TFunction,
  template: NotificationTemplate,
): Array<string> {
  const [c0, c1, c2] = template.chips
  switch (template.id) {
    case 'price-level':
      return [
        t('notifications.templates.price-level.chips.0', {
          defaultValue: c0,
        }),
        t('notifications.templates.price-level.chips.1', {
          defaultValue: c1,
        }),
        t('common.chips.osNotification', { defaultValue: c2 }),
      ]
    case 'volatile-candle':
      return [
        t('common.chips.timeframeClose', { defaultValue: c0 }),
        t('notifications.templates.volatile-candle.chips.1', {
          defaultValue: c1,
        }),
        t('common.chips.toastPlusOs', { defaultValue: c2 }),
      ]
    case 'fills':
      return [
        t('notifications.templates.fills.chips.0', { defaultValue: c0 }),
        t('notifications.templates.fills.chips.1', { defaultValue: c1 }),
        t('common.chips.osNotification', { defaultValue: c2 }),
      ]
    case 'indicator-relay':
      return [
        t('notifications.templates.indicator-relay.chips.0', {
          defaultValue: c0,
        }),
        t('notifications.templates.indicator-relay.chips.1', {
          defaultValue: c1,
        }),
        t('common.chips.toastPlusOs', { defaultValue: c2 }),
      ]
    case 'session-drop':
      return [
        t('common.chips.timeframeClose', { defaultValue: c0 }),
        t('common.chips.downPercent', { defaultValue: c1, percent: '2%' }),
        c2, // '13-21 UTC' — pure notation, nothing to translate
      ]
    default:
      return template.chips
  }
}

/**
 * The DSL a graph template expands to. Pure, so a test can hand it straight to
 * `validateRule` — a template that opens with a red commit bar is worse than
 * no template at all. (`price-level` goes through `createPriceAlertRule`
 * instead and carries no steps of its own.)
 */
export function notificationTemplateGraph(template: NotificationTemplate): {
  steps: Array<NotificationStepDSL>
  edges: Array<NotificationEdgeDSL>
} {
  const stepId = (local: string) => `tpl-${template.id}-${local}`
  return {
    steps: template.steps.map((step) => ({
      id: stepId(step.id),
      type: step.type,
      position: step.position,
      data: step.data,
    })),
    edges: template.edges.map((edge, index) => ({
      id: `tpl-${template.id}-e${index}`,
      source: stepId(edge.source),
      sourceHandle: edge.sourceHandle,
      target: stepId(edge.target),
    })),
  }
}

/**
 * Create the rule, bind it to a pair, and open it in the editor pre-filled.
 *
 * Same store actions the sidebar and canvas already use — `createRule` /
 * `createPriceAlertRule`, `startEditing`, then `addStep`/`addEdge` per element
 * exactly as a drop on the canvas does.
 *
 * The graph is then committed, so the rule is armed the moment it appears.
 * Leaving it as an uncommitted draft meant the rule showed up in the list with
 * its toggle on while `rule.steps` was still empty: enabled, visible, and
 * incapable of firing until the user happened to notice the Commit button.
 * The price-level branch below has always committed for exactly this reason.
 * Editing still works the usual way — commitDraft re-opens the rule with a
 * clean draft, so the canvas stays live and the next change is pending again.
 */
export function applyNotificationTemplate(
  template: NotificationTemplate,
): string {
  const store = useNotificationStore.getState()

  if (template.kind === 'price-level') {
    const ruleId = store.createPriceAlertRule({
      pair: TEMPLATE_PAIR,
      market: TEMPLATE_MARKET,
      price: TEMPLATE_PRICE_LEVEL,
      direction: 'above',
    })
    store.selectRule(ruleId)
    store.startEditing(ruleId)
    return ruleId
  }

  const ruleId = store.createRule(
    i18n.t(`notifications.templates.${template.id}.title`, {
      defaultValue: template.title,
    }),
  )
  store.addBinding(ruleId, TEMPLATE_PAIR, TEMPLATE_MARKET)
  store.selectRule(ruleId)
  store.startEditing(ruleId)

  const { steps, edges } = notificationTemplateGraph(template)
  for (const step of steps) store.addStep(step)
  for (const edge of edges) store.addEdge(edge)
  store.commitDraft()

  return ruleId
}
