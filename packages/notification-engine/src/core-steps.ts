// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Built-in Notification Step Definitions ──────────────────────────
//
// Event steps:     price-alert, percent-move, order-executed,
//                  signal-generated, indicator-alert, candle-close
// Condition steps: price-condition, percent-change, time-window
// Channel steps:   local-toast, os-notification, webhook, telegram
//
// Pair/market context lives on the rule, not on individual event steps.
// Event steps are the entry points of notification flows — they have no
// incoming edges. Channel `deliver` functions are stubs — the terminal
// registers concrete implementations at runtime.

import { PERCENT_WINDOWS } from './simple-alerts'
import type { NotificationStepTypeDefinition } from './step-registry'

/** First value that is real text, skipping nullish and blank strings. */
function firstText(...values: Array<unknown>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

/** Shared by every step whose trigger is driven by a candle stream. */
const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
]

// ── Event Steps ──────────────────────────────────────────────────────
// Pair/market is inherited from the rule — not configured per event step.

const priceAlert: NotificationStepTypeDefinition = {
  type: 'price-alert',
  label: 'Price Alert',
  icon: 'TrendingUp',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    {
      key: 'direction',
      type: 'select',
      label: 'Direction',
      default: 'above',
      options: [
        { value: 'above', label: 'Above' },
        { value: 'below', label: 'Below' },
      ],
    },
    {
      key: 'price',
      type: 'number',
      label: 'Price',
      default: 0,
      min: 0,
      step: 0.01,
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    if (!data.price || Number(data.price) <= 0)
      errors.push('Price must be positive')
    return errors
  },
  defaultData: () => ({ direction: 'above', price: 0 }),
  formatMessage: (data, payload) => ({
    title: `Price Alert: ${String(payload.pair ?? 'unknown')}`,
    body: `${String(payload.pair ?? '')} is now ${String(data.direction)} ${String(data.price)} — current: ${String(payload.price ?? 'N/A')}`,
    severity: 'info',
  }),
}

/** Window labels for the `percent-move` config select. */
const PERCENT_WINDOW_OPTIONS = PERCENT_WINDOWS.map((window) => ({
  value: window,
  label:
    window === '24h'
      ? '24H'
      : window === '4h'
        ? '4H'
        : window === '1h'
          ? '1H'
          : window,
}))

/**
 * "It moved 5% in the last hour."
 *
 * The rolling counterpart to `price-alert`: instead of a level, a
 * magnitude over a trailing window. The percent-change CONDITION step
 * cannot express this — it reads whatever `percentChange` its upstream
 * event happens to carry, which is one candle's body on a close event and
 * the 24h figure on a ticker, never an arbitrary window. The subscription
 * manager measures the window and emits the event; the filter below owns
 * the threshold, so one stream serves every rule watching that window.
 */
const percentMove: NotificationStepTypeDefinition = {
  type: 'percent-move',
  label: 'Price Move',
  icon: 'TrendingUpDown',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    {
      key: 'percent',
      type: 'number',
      label: 'Percent',
      default: 5,
      min: 0,
      step: 0.1,
    },
    {
      key: 'direction',
      type: 'select',
      label: 'Direction',
      default: 'either',
      options: [
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
        { value: 'either', label: 'Either' },
      ],
    },
    {
      key: 'window',
      type: 'select',
      label: 'Within',
      default: '1h',
      options: PERCENT_WINDOW_OPTIONS,
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    if (!data.percent || Number(data.percent) <= 0)
      errors.push('Percent must be positive')
    return errors
  },
  defaultData: () => ({ percent: 5, direction: 'either', window: '1h' }),
  formatMessage: (data, payload) => {
    const change = Number(payload.data.percentChange ?? 0)
    const window = firstText(payload.data.window, data.window) ?? ''
    const signed = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
    return {
      title: `${String(payload.pair ?? 'Price')} ${signed} in ${window}`,
      body: `${String(payload.pair ?? '')} is ${change >= 0 ? 'up' : 'down'} ${Math.abs(
        change,
      ).toFixed(
        2,
      )}% over the last ${window} — now ${String(payload.price ?? 'N/A')}`,
      severity: change >= 0 ? 'success' : 'warning',
    }
  },
}

const orderExecuted: NotificationStepTypeDefinition = {
  type: 'order-executed',
  label: 'Order Executed',
  icon: 'ShoppingCart',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    {
      key: 'side',
      type: 'select',
      label: 'Side',
      default: 'any',
      options: [
        { value: 'any', label: 'Any' },
        { value: 'buy', label: 'Buy' },
        { value: 'sell', label: 'Sell' },
      ],
    },
    {
      key: 'status',
      type: 'select',
      label: 'Status',
      default: 'filled',
      options: [
        { value: 'any', label: 'Any' },
        { value: 'filled', label: 'Filled' },
        { value: 'partially_filled', label: 'Partially Filled' },
      ],
    },
  ],
  validate: () => [],
  defaultData: () => ({ side: 'any', status: 'filled' }),
  formatMessage: (data, payload) => ({
    title: 'Order Executed',
    body: `${String(payload.data.side ?? data.side).toUpperCase()} ${String(payload.pair ?? '')} — ${String(payload.data.status ?? 'filled')}`,
    severity: 'success',
  }),
}

const signalGenerated: NotificationStepTypeDefinition = {
  type: 'signal-generated',
  label: 'Signal Generated',
  icon: 'Zap',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    // Signals confirm on close, so this step is driven by a candle stream and
    // needs its own timeframe. It used to have none while the subscription
    // manager still read `data.timeframe` — silently defaulting every signal
    // rule to a 1h stream no matter what the user had in mind.
    {
      key: 'timeframe',
      type: 'select',
      label: 'Timeframe',
      default: '1h',
      options: TIMEFRAME_OPTIONS,
    },
    {
      key: 'signalType',
      type: 'string',
      label: 'Signal Type (optional)',
      default: '',
      placeholder: 'Any type',
    },
  ],
  validate: () => [],
  defaultData: () => ({ timeframe: '1h', signalType: '' }),
  formatMessage: (data, payload) => ({
    title: 'Signal Generated',
    body: `${firstText(payload.data.signalType, data.signalType) ?? 'Signal'} on ${String(payload.pair ?? 'unknown')}${
      payload.data.direction ? ` (${String(payload.data.direction)})` : ''
    }`,
    severity: 'info',
  }),
}

/**
 * Fires when a custom (Python) chart indicator's declared `alert.condition`
 * turns true on a closing bar. Leaving both fields blank matches every
 * condition of every indicator.
 */
const indicatorAlert: NotificationStepTypeDefinition = {
  type: 'indicator-alert',
  label: 'Indicator Alert',
  icon: 'SquareFunction',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    // Conditions confirm on a closed bar, so a rule that fires without the
    // chart open has to say which timeframe's closes to evaluate.
    {
      key: 'timeframe',
      type: 'select',
      label: 'Timeframe',
      default: '1h',
      options: TIMEFRAME_OPTIONS,
    },
    {
      key: 'indicator',
      type: 'string',
      label: 'Indicator (optional)',
      default: '',
      placeholder: 'Any indicator',
    },
    {
      key: 'condition',
      type: 'string',
      label: 'Condition (optional)',
      default: '',
      placeholder: 'Any condition',
    },
  ],
  validate: () => [],
  defaultData: () => ({ timeframe: '1h', indicator: '', condition: '' }),
  formatMessage: (data, payload) => ({
    // `condition` and `indicator` default to '' — blank is the documented way
    // to match every condition of every indicator — so `??` would hand back an
    // empty title for the most common configuration. Skip blanks, not just
    // nullish values.
    title:
      firstText(payload.data.conditionTitle, data.condition) ??
      'Indicator Alert',
    body:
      firstText(payload.data.message) ??
      `${firstText(payload.data.indicatorTitle, data.indicator) ?? 'Indicator'} fired on ${String(
        payload.pair ?? 'unknown',
      )}`,
    severity: 'info',
  }),
}

const candleClose: NotificationStepTypeDefinition = {
  type: 'candle-close',
  label: 'Candle Close',
  icon: 'CandlestickChart',
  category: 'event',
  handles: {
    inputs: [],
    outputs: [{ id: 'out', label: 'Triggered' }],
  },
  configSchema: [
    {
      key: 'timeframe',
      type: 'select',
      label: 'Timeframe',
      default: '1h',
      options: TIMEFRAME_OPTIONS,
    },
  ],
  validate: () => [],
  defaultData: () => ({ timeframe: '1h' }),
  formatMessage: (data, payload) => ({
    title: 'Candle Close',
    // The event's own timeframe, not the step's — they agree now that the
    // filter enforces it, and reporting the payload keeps the message honest
    // if a future event source ever routes differently.
    body: `${firstText(payload.data.timeframe, data.timeframe) ?? ''} candle closed on ${String(payload.pair ?? 'unknown')}`,
    severity: 'info',
  }),
}

// ── Condition Steps ──────────────────────────────────────────────────

const priceCondition: NotificationStepTypeDefinition = {
  type: 'price-condition',
  label: 'Price Condition',
  icon: 'ArrowUpDown',
  category: 'condition',
  branching: true,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [
      { id: 'pass', label: 'Pass' },
      { id: 'fail', label: 'Fail' },
    ],
  },
  configSchema: [
    {
      key: 'direction',
      type: 'select',
      label: 'Direction',
      default: 'above',
      options: [
        { value: 'above', label: 'Above' },
        { value: 'below', label: 'Below' },
      ],
    },
    {
      key: 'price',
      type: 'number',
      label: 'Price',
      default: 0,
      min: 0,
      step: 0.01,
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    if (!data.price || Number(data.price) <= 0)
      errors.push('Price must be positive')
    return errors
  },
  defaultData: () => ({ direction: 'above', price: 0 }),
  evaluate: (data, payload) => {
    const current = payload.price ?? 0
    const target = Number(data.price)
    return data.direction === 'above' ? current >= target : current <= target
  },
}

const percentChange: NotificationStepTypeDefinition = {
  type: 'percent-change',
  label: 'Percent Change',
  icon: 'Percent',
  category: 'condition',
  branching: true,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [
      { id: 'pass', label: 'Pass' },
      { id: 'fail', label: 'Fail' },
    ],
  },
  configSchema: [
    {
      key: 'percent',
      type: 'number',
      label: 'Percent',
      default: 5,
      min: 0,
      step: 0.1,
    },
    {
      key: 'direction',
      type: 'select',
      label: 'Direction',
      default: 'either',
      options: [
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
        { value: 'either', label: 'Either' },
      ],
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    if (Number(data.percent) <= 0) errors.push('Percent must be positive')
    return errors
  },
  defaultData: () => ({ percent: 5, direction: 'either' }),
  evaluate: (data, payload) => {
    const change = Number(payload.data.percentChange ?? 0)
    const threshold = Number(data.percent)
    if (data.direction === 'up') return change >= threshold
    if (data.direction === 'down') return change <= -threshold
    return Math.abs(change) >= threshold
  },
}

const timeWindow: NotificationStepTypeDefinition = {
  type: 'time-window',
  label: 'Time Window',
  icon: 'Clock',
  category: 'condition',
  branching: true,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [
      { id: 'pass', label: 'Pass' },
      { id: 'fail', label: 'Fail' },
    ],
  },
  configSchema: [
    {
      key: 'startHour',
      type: 'number',
      label: 'Start Hour (UTC)',
      default: 9,
      min: 0,
      max: 23,
      step: 1,
    },
    {
      key: 'endHour',
      type: 'number',
      label: 'End Hour (UTC)',
      default: 17,
      min: 0,
      max: 23,
      step: 1,
    },
  ],
  validate: () => [],
  defaultData: () => ({ startHour: 9, endHour: 17 }),
  evaluate: (data) => {
    const now = new Date()
    const hour = now.getUTCHours()
    const start = Number(data.startHour)
    const end = Number(data.endHour)
    if (start <= end) {
      return hour >= start && hour < end
    }
    return hour >= start || hour < end
  },
}

// ── Channel Steps ────────────────────────────────────────────────────

const localToast: NotificationStepTypeDefinition = {
  type: 'local-toast',
  label: 'Toast',
  icon: 'MessageSquare',
  category: 'channel',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [],
  },
  configSchema: [],
  validate: () => [],
  defaultData: () => ({}),
  deliver: async () => {},
}

const osNotification: NotificationStepTypeDefinition = {
  type: 'os-notification',
  label: 'OS Notification',
  icon: 'Bell',
  category: 'channel',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [],
  },
  configSchema: [
    {
      key: 'sound',
      type: 'toggle',
      label: 'Play Sound',
      default: true,
    },
  ],
  validate: () => [],
  defaultData: () => ({ sound: true }),
  deliver: async () => {},
}

const webhook: NotificationStepTypeDefinition = {
  type: 'webhook',
  label: 'Webhook',
  icon: 'Webhook',
  category: 'channel',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [],
  },
  configSchema: [
    {
      key: 'url',
      type: 'string',
      label: 'URL',
      default: '',
      placeholder: 'https://example.com/webhook',
    },
    {
      key: 'method',
      type: 'select',
      label: 'Method',
      default: 'POST',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
      ],
    },
    {
      key: 'includePayload',
      type: 'toggle',
      label: 'Include Event Payload',
      default: true,
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    if (!data.url) errors.push('URL is required')
    try {
      if (data.url) {
        const parsed = new URL(String(data.url))
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push('URL must use http or https')
        }
      }
    } catch {
      errors.push('Invalid URL')
    }
    return errors
  },
  defaultData: () => ({ url: '', method: 'POST', includePayload: true }),
  deliver: async () => {},
}

/**
 * Telegram.
 *
 * The bot token is deliberately NOT a config field. Rules are persisted in
 * localStorage and synced to the App Server under the `automation` domain, so
 * a token here would be a credential uploaded to Pairlens servers — the one
 * thing the credential design forbids. The terminal keeps it in the OS
 * keychain (browser: the vault) and its delivery implementation reads it from
 * there; the step carries only routing.
 *
 * `chatId` blank means "the chat linked in settings", which is what a user who
 * connected one bot to their own DM wants and never has to type.
 */
const telegram: NotificationStepTypeDefinition = {
  type: 'telegram',
  label: 'Telegram',
  icon: 'Send',
  category: 'channel',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [],
  },
  configSchema: [
    {
      key: 'chatId',
      type: 'string',
      label: 'Chat ID (optional)',
      default: '',
      placeholder: 'Linked chat',
    },
    {
      key: 'silent',
      type: 'toggle',
      label: 'Silent Message',
      default: false,
    },
  ],
  validate: (data) => {
    const errors: Array<string> = []
    const chatId = String(data.chatId ?? '').trim()
    // Blank is the normal case. A typed value is either a numeric id
    // (negative for groups) or an @channelusername — anything else is a
    // paste of the wrong thing, most often the bot token.
    if (chatId && !/^(-?\d+|@[A-Za-z0-9_]{4,})$/.test(chatId)) {
      errors.push('Chat ID must be a number or @channelname')
    }
    return errors
  },
  defaultData: () => ({ chatId: '', silent: false }),
  deliver: async () => {},
}

// ── All Core Steps ───────────────────────────────────────────────────

export const CORE_NOTIFICATION_STEPS: Array<NotificationStepTypeDefinition> = [
  // Events
  priceAlert,
  percentMove,
  orderExecuted,
  signalGenerated,
  indicatorAlert,
  candleClose,
  // Conditions
  priceCondition,
  percentChange,
  timeWindow,
  // Channels
  localToast,
  osNotification,
  webhook,
  telegram,
]
