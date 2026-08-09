// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The indicator catalog — the 91 built-in chart indicators, their categories
 * and their default params.
 *
 * It used to live inside `indicator-picker.tsx`, a 1300-line Radix dialog.
 * That was fine while the desktop picker was the only door to it; the mobile
 * indicators sheet is a second one, and importing a desktop dialog to read a
 * data table would have pulled the dialog, the templates store and the whole
 * ScrollArea tree into the phone's chart chunk. The picker now imports from
 * here and re-exports for anything still reaching through it.
 *
 * Every `labelKey` and `categoryKey` is already translated in all 17 locales —
 * a new surface reuses them and never mints an indicator name of its own.
 */
import type { IndicatorType } from '@pairlens/fast-financial-charts/types'
import { customIndicatorRegistry } from '@/lib/indicators/custom-indicator-registry'
import { defaultParamsFromInputs } from '@/lib/indicators/custom-indicator-definitions'

export type IndicatorCatalogEntry = {
  type: IndicatorType
  labelKey: string
  /** Raw display label — takes precedence over `labelKey` translation.
   * Custom (script-defined) indicators carry their user-authored title. */
  label?: string
  categoryKey: string
  defaultParams: Record<string, boolean | number | string>
  pane: 'overlay' | 'separate'
}

export const INDICATOR_CATALOG: Array<IndicatorCatalogEntry> = [
  // Moving Averages
  {
    type: 'EMA',
    labelKey: 'indicators.names.EMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'SMA',
    labelKey: 'indicators.names.SMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 50 },
    pane: 'overlay',
  },
  {
    type: 'WMA',
    labelKey: 'indicators.names.WMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'DEMA',
    labelKey: 'indicators.names.DEMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'TEMA',
    labelKey: 'indicators.names.TEMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'VWAP',
    labelKey: 'indicators.names.VWAP',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'HMA',
    labelKey: 'indicators.names.HMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 9 },
    pane: 'overlay',
  },
  {
    type: 'VWMA',
    labelKey: 'indicators.names.VWMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'ALMA',
    labelKey: 'indicators.names.ALMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 9, offset: 0.85, sigma: 6 },
    pane: 'overlay',
  },
  {
    type: 'KAMA',
    labelKey: 'indicators.names.KAMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 10, fast: 2, slow: 30 },
    pane: 'overlay',
  },
  {
    type: 'SMMA',
    labelKey: 'indicators.names.SMMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 7 },
    pane: 'overlay',
  },
  {
    type: 'LSMA',
    labelKey: 'indicators.names.LSMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 25 },
    pane: 'overlay',
  },
  {
    type: 'McGinleyDynamic',
    labelKey: 'indicators.names.McGinleyDynamic',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 14 },
    pane: 'overlay',
  },
  {
    type: 'MovingAverageHamming',
    labelKey: 'indicators.names.MovingAverageHamming',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'MovingAverageChannel',
    labelKey: 'indicators.names.MovingAverageChannel',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'MovingAverageMultiple',
    labelKey: 'indicators.names.MovingAverageMultiple',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'GuppyMMA',
    labelKey: 'indicators.names.GuppyMMA',
    categoryKey: 'indicators.categories.movingAverages',
    defaultParams: {},
    pane: 'overlay',
  },

  // Oscillators & Momentum
  {
    type: 'RSI',
    labelKey: 'indicators.names.RSI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'MACD',
    labelKey: 'indicators.names.MACD',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    pane: 'separate',
  },
  {
    type: 'Stochastic',
    labelKey: 'indicators.names.Stochastic',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { kPeriod: 14, dPeriod: 3, smooth: 3 },
    pane: 'separate',
  },
  {
    type: 'StochRSI',
    labelKey: 'indicators.names.StochRSI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 },
    pane: 'separate',
  },
  {
    type: 'WilliamsR',
    labelKey: 'indicators.names.WilliamsR',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'CCI',
    labelKey: 'indicators.names.CCI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 20 },
    pane: 'separate',
  },
  {
    type: 'MFI',
    labelKey: 'indicators.names.MFI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'Momentum',
    labelKey: 'indicators.names.Momentum',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 10 },
    pane: 'separate',
  },
  {
    type: 'ROC',
    labelKey: 'indicators.names.ROC',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 12 },
    pane: 'separate',
  },
  {
    type: 'ADX',
    labelKey: 'indicators.names.ADX',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'Aroon',
    labelKey: 'indicators.names.Aroon',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 25 },
    pane: 'separate',
  },
  {
    type: 'TRIX',
    labelKey: 'indicators.names.TRIX',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 15, signal: 9 },
    pane: 'separate',
  },
  {
    type: 'BBPercent',
    labelKey: 'indicators.names.BBPercent',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 20, stdDev: 2 },
    pane: 'separate',
  },
  {
    type: 'AwesomeOscillator',
    labelKey: 'indicators.names.AwesomeOscillator',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { fast: 5, slow: 34 },
    pane: 'separate',
  },
  {
    type: 'ChoppinessIndex',
    labelKey: 'indicators.names.ChoppinessIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'FisherTransform',
    labelKey: 'indicators.names.FisherTransform',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 9 },
    pane: 'separate',
  },
  {
    type: 'VortexIndicator',
    labelKey: 'indicators.names.VortexIndicator',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'UltimateOscillator',
    labelKey: 'indicators.names.UltimateOscillator',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period1: 7, period2: 14, period3: 28 },
    pane: 'separate',
  },
  {
    type: 'CoppockCurve',
    labelKey: 'indicators.names.CoppockCurve',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { longPeriod: 14, shortPeriod: 11, wmaPeriod: 10 },
    pane: 'separate',
  },
  {
    type: 'KST',
    labelKey: 'indicators.names.KST',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { roc1: 10, roc2: 15, roc3: 20, roc4: 30 },
    pane: 'separate',
  },
  {
    type: 'ElderForceIndex',
    labelKey: 'indicators.names.ElderForceIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 13 },
    pane: 'separate',
  },
  {
    type: 'DPO',
    labelKey: 'indicators.names.DPO',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 20 },
    pane: 'separate',
  },
  {
    type: 'CMO',
    labelKey: 'indicators.names.CMO',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 9 },
    pane: 'separate',
  },
  {
    type: 'RVI',
    labelKey: 'indicators.names.RVI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 10, signal: 4 },
    pane: 'separate',
  },
  {
    type: 'TSI',
    labelKey: 'indicators.names.TSI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { longPeriod: 25, shortPeriod: 13, signal: 7 },
    pane: 'separate',
  },
  {
    type: 'SMIErgodic',
    labelKey: 'indicators.names.SMIErgodic',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { longPeriod: 20, shortPeriod: 5, signal: 5 },
    pane: 'separate',
  },
  {
    type: 'ConnorsRSI',
    labelKey: 'indicators.names.ConnorsRSI',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { rsiPeriod: 3, streakPeriod: 2, rankPeriod: 100 },
    pane: 'separate',
  },
  {
    type: 'BalanceOfPower',
    labelKey: 'indicators.names.BalanceOfPower',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'RelativeVolatilityIndex',
    labelKey: 'indicators.names.RelativeVolatilityIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 10, smoothPeriod: 14 },
    pane: 'separate',
  },
  {
    type: 'AcceleratorOscillator',
    labelKey: 'indicators.names.AcceleratorOscillator',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { fast: 5, slow: 34, smoothPeriod: 5 },
    pane: 'separate',
  },
  {
    type: 'MassIndex',
    labelKey: 'indicators.names.MassIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { emaPeriod: 9, sumPeriod: 25 },
    pane: 'separate',
  },
  {
    type: 'PriceOscillator',
    labelKey: 'indicators.names.PriceOscillator',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { fast: 12, slow: 26 },
    pane: 'separate',
  },
  {
    type: 'DirectionalMovement',
    labelKey: 'indicators.names.DirectionalMovement',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'TrendStrengthIndex',
    labelKey: 'indicators.names.TrendStrengthIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'RankCorrelationIndex',
    labelKey: 'indicators.names.RankCorrelationIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'MajorityRule',
    labelKey: 'indicators.names.MajorityRule',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'AccumulativeSwingIndex',
    labelKey: 'indicators.names.AccumulativeSwingIndex',
    categoryKey: 'indicators.categories.oscillators',
    defaultParams: {},
    pane: 'separate',
  },

  // Bands & Channels
  {
    type: 'BollingerBands',
    labelKey: 'indicators.names.BollingerBands',
    categoryKey: 'indicators.categories.bandsChannels',
    defaultParams: { period: 20, stdDev: 2 },
    pane: 'overlay',
  },
  {
    type: 'DonchianChannels',
    labelKey: 'indicators.names.DonchianChannels',
    categoryKey: 'indicators.categories.bandsChannels',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },
  {
    type: 'KeltnerChannels',
    labelKey: 'indicators.names.KeltnerChannels',
    categoryKey: 'indicators.categories.bandsChannels',
    defaultParams: { period: 20, atrPeriod: 10, multiplier: 2 },
    pane: 'overlay',
  },
  {
    type: 'Envelopes',
    labelKey: 'indicators.names.Envelopes',
    categoryKey: 'indicators.categories.bandsChannels',
    defaultParams: { period: 20, deviation: 10 },
    pane: 'overlay',
  },
  {
    type: 'PriceChannel',
    labelKey: 'indicators.names.PriceChannel',
    categoryKey: 'indicators.categories.bandsChannels',
    defaultParams: { period: 20 },
    pane: 'overlay',
  },

  // Trend
  {
    type: 'SuperTrend',
    labelKey: 'indicators.names.SuperTrend',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { period: 10, multiplier: 3 },
    pane: 'overlay',
  },
  {
    type: 'Ichimoku',
    labelKey: 'indicators.names.Ichimoku',
    categoryKey: 'indicators.categories.trend',
    defaultParams: {
      tenkanPeriod: 9,
      kijunPeriod: 26,
      senkouBPeriod: 52,
      displacement: 26,
    },
    pane: 'overlay',
  },
  {
    type: 'ParabolicSAR',
    labelKey: 'indicators.names.ParabolicSAR',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { afStart: 0.02, afStep: 0.02, afMax: 0.2 },
    pane: 'overlay',
  },
  {
    type: 'Alligator',
    labelKey: 'indicators.names.Alligator',
    categoryKey: 'indicators.categories.trend',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'WilliamsFractal',
    labelKey: 'indicators.names.WilliamsFractal',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { period: 2 },
    pane: 'overlay',
  },
  {
    type: 'ZigZag',
    labelKey: 'indicators.names.ZigZag',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { deviation: 5 },
    pane: 'overlay',
  },
  {
    type: 'ChandeKrollStop',
    labelKey: 'indicators.names.ChandeKrollStop',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { atrPeriod: 10, firstStop: 1, secondStop: 9 },
    pane: 'overlay',
  },
  {
    type: 'MACross',
    labelKey: 'indicators.names.MACross',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { fastPeriod: 9, slowPeriod: 21 },
    pane: 'overlay',
  },
  {
    type: 'EMACross',
    labelKey: 'indicators.names.EMACross',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { fastPeriod: 9, slowPeriod: 21 },
    pane: 'overlay',
  },
  {
    type: 'MAWithEMACross',
    labelKey: 'indicators.names.MAWithEMACross',
    categoryKey: 'indicators.categories.trend',
    defaultParams: { smaPeriod: 10, emaPeriod: 21 },
    pane: 'overlay',
  },

  // Volume
  {
    type: 'Volume',
    labelKey: 'indicators.names.Volume',
    categoryKey: 'indicators.categories.volume',
    defaultParams: {},
    pane: 'separate',
  },
  {
    type: 'OBV',
    labelKey: 'indicators.names.OBV',
    categoryKey: 'indicators.categories.volume',
    defaultParams: {},
    pane: 'separate',
  },
  {
    type: 'AD',
    labelKey: 'indicators.names.AD',
    categoryKey: 'indicators.categories.volume',
    defaultParams: {},
    pane: 'separate',
  },
  {
    type: 'CMF',
    labelKey: 'indicators.names.CMF',
    categoryKey: 'indicators.categories.volume',
    defaultParams: { period: 20 },
    pane: 'separate',
  },
  {
    type: 'KlingerOscillator',
    labelKey: 'indicators.names.KlingerOscillator',
    categoryKey: 'indicators.categories.volume',
    defaultParams: { fast: 34, slow: 55, signal: 13 },
    pane: 'separate',
  },
  {
    type: 'PVT',
    labelKey: 'indicators.names.PVT',
    categoryKey: 'indicators.categories.volume',
    defaultParams: {},
    pane: 'separate',
  },
  {
    type: 'EaseOfMovement',
    labelKey: 'indicators.names.EaseOfMovement',
    categoryKey: 'indicators.categories.volume',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'VolumeOscillator',
    labelKey: 'indicators.names.VolumeOscillator',
    categoryKey: 'indicators.categories.volume',
    defaultParams: { fast: 5, slow: 10 },
    pane: 'separate',
  },
  {
    type: 'NetVolume',
    labelKey: 'indicators.names.NetVolume',
    categoryKey: 'indicators.categories.volume',
    defaultParams: {},
    pane: 'separate',
  },
  {
    type: 'ChaikinOscillator',
    labelKey: 'indicators.names.ChaikinOscillator',
    categoryKey: 'indicators.categories.volume',
    defaultParams: { fast: 3, slow: 10 },
    pane: 'separate',
  },

  // Volatility
  {
    type: 'ATR',
    labelKey: 'indicators.names.ATR',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { period: 14 },
    pane: 'separate',
  },
  {
    type: 'BBWidth',
    labelKey: 'indicators.names.BBWidth',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { period: 20, stdDev: 2 },
    pane: 'separate',
  },
  {
    type: 'HistoricalVolatility',
    labelKey: 'indicators.names.HistoricalVolatility',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { period: 20 },
    pane: 'separate',
  },
  {
    type: 'StandardDeviation',
    labelKey: 'indicators.names.StandardDeviation',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { period: 20 },
    pane: 'separate',
  },
  {
    type: 'ChaikinVolatility',
    labelKey: 'indicators.names.ChaikinVolatility',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { emaPeriod: 10, rocPeriod: 10 },
    pane: 'separate',
  },
  {
    type: 'PivotPoints',
    labelKey: 'indicators.names.PivotPoints',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'FiftyTwoWeekHighLow',
    labelKey: 'indicators.names.FiftyTwoWeekHighLow',
    categoryKey: 'indicators.categories.volatility',
    defaultParams: { period: 252 },
    pane: 'overlay',
  },

  // Statistical
  {
    type: 'AveragePrice',
    labelKey: 'indicators.names.AveragePrice',
    categoryKey: 'indicators.categories.statistical',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'MedianPrice',
    labelKey: 'indicators.names.MedianPrice',
    categoryKey: 'indicators.categories.statistical',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'TypicalPrice',
    labelKey: 'indicators.names.TypicalPrice',
    categoryKey: 'indicators.categories.statistical',
    defaultParams: {},
    pane: 'overlay',
  },
  {
    type: 'LinearRegressionCurve',
    labelKey: 'indicators.names.LinearRegressionCurve',
    categoryKey: 'indicators.categories.statistical',
    defaultParams: { period: 25 },
    pane: 'overlay',
  },
  {
    type: 'LinearRegressionSlope',
    labelKey: 'indicators.names.LinearRegressionSlope',
    categoryKey: 'indicators.categories.statistical',
    defaultParams: { period: 25 },
    pane: 'separate',
  },
]

export const CUSTOM_CATEGORY_KEY = 'indicators.categories.custom'

/** Section order, shared by the desktop picker and the mobile sheet. */
export const CATEGORY_KEYS = [
  'indicators.categories.movingAverages',
  'indicators.categories.oscillators',
  'indicators.categories.bandsChannels',
  'indicators.categories.trend',
  'indicators.categories.volume',
  'indicators.categories.volatility',
  'indicators.categories.statistical',
  CUSTOM_CATEGORY_KEY,
] as const

export type IndicatorCategoryKey = (typeof CATEGORY_KEYS)[number]

/** Catalog entries for registry-defined custom indicators (reactive; rebuilt
 * only when the registry version bumps — never per tick). */
export function buildCustomCatalogEntries(): Array<IndicatorCatalogEntry> {
  return customIndicatorRegistry.getAll().map((entry) => ({
    type: entry.type,
    labelKey: CUSTOM_CATEGORY_KEY,
    label: entry.descriptor.meta.title,
    categoryKey: CUSTOM_CATEGORY_KEY,
    defaultParams: defaultParamsFromInputs(entry.descriptor.meta.inputs),
    pane: entry.descriptor.meta.pane === 'overlay' ? 'overlay' : 'separate',
  }))
}

export const subscribeToCustomIndicators = (onChange: () => void) =>
  customIndicatorRegistry.subscribe(onChange)

export const getCustomIndicatorsVersion = () =>
  customIndicatorRegistry.getVersion()

/** Display label for a catalog entry: raw label wins over translation. */
export const entryLabel = (
  entry: IndicatorCatalogEntry,
  t: (key: string) => string,
): string => entry.label ?? t(entry.labelKey)
