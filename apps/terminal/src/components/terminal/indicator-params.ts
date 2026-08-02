// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { INDICATOR_CATALOG } from './indicator-picker'
import type { IndicatorType } from '@pairlens/fast-financial-charts/types'
import type { IndicatorCatalogEntry } from './indicator-picker'
import {
  customIndicatorRegistry,
  isCustomIndicatorType,
} from '@/lib/indicators/custom-indicator-registry'

export type IndicatorParamSpec = {
  key: string
  labelKey: string
  /** Raw display label — takes precedence over `labelKey` translation
   * (custom indicator inputs carry user-authored labels, not locale keys). */
  label?: string
  type: 'int' | 'float' | 'boolean' | 'select'
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string; labelKey: string; label?: string }>
}

const paramLabelKey = (key: string): string => `indicators.params.${key}`

const intSpec = (
  key: string,
  options?: { min?: number; max?: number },
): IndicatorParamSpec => ({
  key,
  labelKey: paramLabelKey(key),
  type: 'int',
  min: options?.min ?? 1,
  max: options?.max ?? 500,
  step: 1,
})

const floatSpec = (
  key: string,
  min: number,
  max: number,
  step: number,
): IndicatorParamSpec => ({
  key,
  labelKey: paramLabelKey(key),
  type: 'float',
  min,
  max,
  step,
})

/**
 * Spec for every param key that appears in the indicator catalog's
 * `defaultParams`. Keys not covered here fall back to a permissive spec
 * derived from the default value's runtime type (see `fallbackSpec`).
 */
export const INDICATOR_PARAM_SPECS: Record<string, IndicatorParamSpec> = {
  // Generic periods / lengths (ints)
  period: intSpec('period'),
  fast: intSpec('fast'),
  slow: intSpec('slow'),
  signal: intSpec('signal'),
  kPeriod: intSpec('kPeriod'),
  dPeriod: intSpec('dPeriod'),
  smooth: intSpec('smooth'),
  rsiPeriod: intSpec('rsiPeriod'),
  stochPeriod: intSpec('stochPeriod'),
  kSmooth: intSpec('kSmooth'),
  dSmooth: intSpec('dSmooth'),
  period1: intSpec('period1'),
  period2: intSpec('period2'),
  period3: intSpec('period3'),
  longPeriod: intSpec('longPeriod'),
  shortPeriod: intSpec('shortPeriod'),
  wmaPeriod: intSpec('wmaPeriod'),
  roc1: intSpec('roc1'),
  roc2: intSpec('roc2'),
  roc3: intSpec('roc3'),
  roc4: intSpec('roc4'),
  streakPeriod: intSpec('streakPeriod'),
  rankPeriod: intSpec('rankPeriod'),
  smoothPeriod: intSpec('smoothPeriod'),
  emaPeriod: intSpec('emaPeriod'),
  sumPeriod: intSpec('sumPeriod'),
  atrPeriod: intSpec('atrPeriod'),
  tenkanPeriod: intSpec('tenkanPeriod'),
  kijunPeriod: intSpec('kijunPeriod'),
  senkouBPeriod: intSpec('senkouBPeriod'),
  displacement: intSpec('displacement', { min: 0 }),
  fastPeriod: intSpec('fastPeriod'),
  slowPeriod: intSpec('slowPeriod'),
  smaPeriod: intSpec('smaPeriod'),
  rocPeriod: intSpec('rocPeriod'),

  // Floats
  offset: floatSpec('offset', 0, 1, 0.05),
  sigma: floatSpec('sigma', 0.1, 50, 0.1),
  stdDev: floatSpec('stdDev', 0.1, 10, 0.1),
  multiplier: floatSpec('multiplier', 0.1, 10, 0.1),
  deviation: floatSpec('deviation', 0.1, 100, 0.1),
  afStart: floatSpec('afStart', 0.001, 1, 0.001),
  afStep: floatSpec('afStep', 0.001, 1, 0.001),
  afMax: floatSpec('afMax', 0.01, 1, 0.01),
  firstStop: floatSpec('firstStop', 0.1, 20, 0.1),
  secondStop: floatSpec('secondStop', 0.1, 20, 0.1),
}

const fallbackSpec = (
  key: string,
  defaultValue: boolean | number | string,
): IndicatorParamSpec => {
  if (typeof defaultValue === 'boolean') {
    return { key, labelKey: paramLabelKey(key), type: 'boolean' }
  }
  return { key, labelKey: paramLabelKey(key), type: 'float' }
}

export function getCatalogEntry(
  type: IndicatorType,
): IndicatorCatalogEntry | undefined {
  return INDICATOR_CATALOG.find((entry) => entry.type === type)
}

/** Candle price sources a custom `source` input can select from. */
const SOURCE_OPTIONS = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
] as const

const rawOption = (value: string) => ({
  value,
  labelKey: paramLabelKey(value),
  label: value,
})

/** Param specs for a registry-defined custom indicator, from its meta inputs. */
function customParamSpecs(type: IndicatorType): Array<IndicatorParamSpec> {
  const entry = customIndicatorRegistry.get(type)
  if (!entry) return []
  return entry.descriptor.meta.inputs.map((input): IndicatorParamSpec => {
    const base = {
      key: input.key,
      labelKey: paramLabelKey(input.key),
      label: input.label ?? input.key,
    }
    switch (input.kind) {
      case 'int':
      case 'float':
        return {
          ...base,
          type: input.kind,
          min: input.min,
          max: input.max,
          step: input.step ?? (input.kind === 'int' ? 1 : undefined),
        }
      case 'bool':
        return { ...base, type: 'boolean' }
      case 'choice':
        return {
          ...base,
          type: 'select',
          options: input.options.map(rawOption),
        }
      case 'source':
        return {
          ...base,
          type: 'select',
          options: SOURCE_OPTIONS.map(rawOption),
        }
    }
  })
}

/**
 * Ordered param specs for an indicator type. Built-in types derive from their
 * catalog entry's `defaultParams` keys; `custom:*` types derive from the
 * registered script's declared inputs. Returns an empty array for unknown
 * types or indicators without configurable params.
 */
export function getIndicatorParamSpecs(
  type: IndicatorType,
): Array<IndicatorParamSpec> {
  if (isCustomIndicatorType(type)) return customParamSpecs(type)
  const entry = getCatalogEntry(type)
  if (!entry) return []
  return Object.entries(entry.defaultParams).map(
    ([key, value]) => INDICATOR_PARAM_SPECS[key] ?? fallbackSpec(key, value),
  )
}

const editableParamsCache = new Map<IndicatorType, boolean>()

export function hasEditableParams(type: IndicatorType): boolean {
  // Custom types are never cached — their inputs live in the (mutable)
  // registry, so a script edit or plugin (de)activation must be reflected.
  if (isCustomIndicatorType(type)) {
    return getIndicatorParamSpecs(type).length > 0
  }
  const cached = editableParamsCache.get(type)
  if (cached !== undefined) return cached
  const editable = getIndicatorParamSpecs(type).length > 0
  editableParamsCache.set(type, editable)
  return editable
}
