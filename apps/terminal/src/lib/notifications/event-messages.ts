// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Translated notification text.
 *
 * `@pairlens/notification-engine` ships each event step with an English
 * `formatMessage`, because the engine is shared with headless callers that
 * have no i18next. The evaluator calls whatever definition is in the engine's
 * registry, so the terminal swaps in translating implementations at startup —
 * the same override seam `registerChannelDeliveries` already uses for
 * `deliver`.
 *
 * This is the text the user actually receives: the toast body, the OS
 * notification. Leaving it English while the builder around it is translated
 * would be the one place the terminal still speaks English at you.
 *
 * Enum fragments (side, status, direction) reuse the step's own config-option
 * keys rather than duplicating them — `registry-labels.ts` derives the same
 * keys for the builder's dropdowns, so a notification and the dropdown that
 * configured it always read the same word.
 */
import {
  getStepType,
  registerStepType,
} from '@pairlens/notification-engine/step-registry'

import i18n from '@/lib/i18n'

/** A step's config-option label, e.g. `filled` → "Filled". */
function optionLabel(
  stepType: string,
  field: string,
  value: unknown,
  fallback: string,
): string {
  const raw = String(value ?? '')
  if (!raw) return fallback
  return i18n.t(
    `notifications.stepTypes.${stepType}.fields.${field}.options.${raw}`,
    { defaultValue: raw },
  )
}

const UNKNOWN_PAIR = () =>
  i18n.t('notifications.messages.unknownPair', { defaultValue: 'unknown' })

/**
 * First value that is actually text.
 *
 * The optional fields on these steps default to `''`, not `undefined` —
 * "leave it blank to match everything" is the documented normal case. A `??`
 * chain treats `''` as present, so the engine's own formatters title a blank
 * indicator alert with an empty string. Skip empties instead.
 */
function firstText(...values: Array<unknown>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

/**
 * Replace the English `formatMessage` on every built-in event step. Call once
 * at startup, after core steps are registered and before any rule can fire.
 */
export function registerEventMessages(): void {
  const priceAlert = getStepType('price-alert')
  if (priceAlert) {
    registerStepType({
      ...priceAlert,
      formatMessage: (data, payload) => ({
        title: i18n.t('notifications.messages.priceAlert.title', {
          pair: String(payload.pair ?? UNKNOWN_PAIR()),
        }),
        body: i18n.t('notifications.messages.priceAlert.body', {
          pair: String(payload.pair ?? ''),
          direction: optionLabel(
            'price-alert',
            'direction',
            data.direction,
            '',
          ),
          price: String(data.price),
          current: String(payload.price ?? '—'),
        }),
        severity: 'info',
      }),
    })
  }

  const orderExecuted = getStepType('order-executed')
  if (orderExecuted) {
    registerStepType({
      ...orderExecuted,
      formatMessage: (data, payload) => ({
        title: i18n.t('notifications.messages.orderExecuted.title'),
        body: i18n.t('notifications.messages.orderExecuted.body', {
          side: optionLabel(
            'order-executed',
            'side',
            payload.data.side ?? data.side,
            '',
          ),
          pair: String(payload.pair ?? ''),
          status: optionLabel(
            'order-executed',
            'status',
            payload.data.status ?? 'filled',
            'filled',
          ),
        }),
        severity: 'success',
      }),
    })
  }

  const signalGenerated = getStepType('signal-generated')
  if (signalGenerated) {
    registerStepType({
      ...signalGenerated,
      formatMessage: (data, payload) => ({
        title: i18n.t('notifications.messages.signalGenerated.title'),
        body: i18n.t('notifications.messages.signalGenerated.body', {
          // Free-text the user typed into the step, not an enum — passed
          // through as written.
          signal:
            firstText(payload.data.signalType, data.signalType) ??
            i18n.t('notifications.messages.signalGenerated.genericSignal'),
          pair: String(payload.pair ?? UNKNOWN_PAIR()),
        }),
        severity: 'info',
      }),
    })
  }

  const indicatorAlert = getStepType('indicator-alert')
  if (indicatorAlert) {
    registerStepType({
      ...indicatorAlert,
      // The title and body here are usually the user's own words — the
      // `alert.condition` title and message from their Python indicator — so
      // only the generic fallbacks are translated.
      formatMessage: (data, payload) => ({
        title:
          firstText(payload.data.conditionTitle, data.condition) ??
          i18n.t('notifications.messages.indicatorAlert.title'),
        body:
          firstText(payload.data.message) ??
          i18n.t('notifications.messages.indicatorAlert.body', {
            indicator:
              firstText(payload.data.indicatorTitle, data.indicator) ??
              i18n.t('notifications.messages.indicatorAlert.genericName'),
            pair: String(payload.pair ?? UNKNOWN_PAIR()),
          }),
        severity: 'info',
      }),
    })
  }

  const candleClose = getStepType('candle-close')
  if (candleClose) {
    registerStepType({
      ...candleClose,
      formatMessage: (data, payload) => ({
        title: i18n.t('notifications.messages.candleClose.title'),
        // Timeframes ('1h', '4h') are notation, not words — left as they are.
        body: i18n.t('notifications.messages.candleClose.body', {
          timeframe: String(data.timeframe),
          pair: String(payload.pair ?? UNKNOWN_PAIR()),
        }),
        severity: 'info',
      }),
    })
  }
}
