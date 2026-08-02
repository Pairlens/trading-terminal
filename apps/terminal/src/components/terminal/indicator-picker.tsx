// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Check,
  Layers,
  Plus,
  Search,
  SplitSquareVertical,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import type {
  IndicatorInstanceInput,
  IndicatorType,
} from 'fast-financial-charts/types'

import type {
  IndicatorTemplate,
  IndicatorTemplateEntry,
} from '@/stores/indicator-templates-store'
import { useChartActions } from '@/lib/chart-terminal-context'
import { useIndicatorTemplatesStore } from '@/stores/indicator-templates-store'
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

const CUSTOM_CATEGORY_KEY = 'indicators.categories.custom'

const CATEGORY_KEYS = [
  'indicators.categories.movingAverages',
  'indicators.categories.oscillators',
  'indicators.categories.bandsChannels',
  'indicators.categories.trend',
  'indicators.categories.volume',
  'indicators.categories.volatility',
  'indicators.categories.statistical',
  CUSTOM_CATEGORY_KEY,
] as const

/** Picker entries for registry-defined custom indicators (reactive; rebuilt
 * only when the registry version bumps — never per tick). */
function buildCustomCatalogEntries(): Array<IndicatorCatalogEntry> {
  return customIndicatorRegistry.getAll().map((entry) => ({
    type: entry.type,
    labelKey: CUSTOM_CATEGORY_KEY,
    label: entry.descriptor.meta.title,
    categoryKey: CUSTOM_CATEGORY_KEY,
    defaultParams: defaultParamsFromInputs(entry.descriptor.meta.inputs),
    pane: entry.descriptor.meta.pane === 'overlay' ? 'overlay' : 'separate',
  }))
}

const subscribeToCustomIndicators = (onChange: () => void) =>
  customIndicatorRegistry.subscribe(onChange)

const getCustomIndicatorsVersion = () => customIndicatorRegistry.getVersion()

/** Display label for a catalog entry: raw label wins over translation. */
const entryLabel = (
  entry: IndicatorCatalogEntry,
  t: (key: string) => string,
): string => entry.label ?? t(entry.labelKey)

type CategoryKey = (typeof CATEGORY_KEYS)[number]
type SidebarSelection = 'all' | 'active' | CategoryKey
type PaneFilter = 'all' | 'overlay' | 'separate'

type IndicatorPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeIndicators: Array<IndicatorInstanceInput>
  onAddIndicator: (indicator: IndicatorInstanceInput) => void
  seriesId: string
}

export function IndicatorPicker({
  open,
  onOpenChange,
  activeIndicators,
  onAddIndicator,
  seriesId,
}: IndicatorPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] =
    useState<SidebarSelection>('all')
  const [paneFilter, setPaneFilter] = useState<PaneFilter>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // ── Indicator templates ─────────────────────────────────────────────
  const { addIndicator, removeAllIndicators } = useChartActions()
  const templates = useIndicatorTemplatesStore((s) => s.templates)
  const loadTemplates = useIndicatorTemplatesStore((s) => s.load)
  const saveTemplate = useIndicatorTemplatesStore((s) => s.saveTemplate)
  const deleteTemplate = useIndicatorTemplatesStore((s) => s.deleteTemplate)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [pendingTemplate, setPendingTemplate] =
    useState<Array<IndicatorTemplateEntry> | null>(null)

  useEffect(() => {
    if (open) loadTemplates()
  }, [open, loadTemplates])

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setSearch('')
        setSelectedCategory('all')
        setPaneFilter('all')
        setFocusedIndex(-1)
        setSavingTemplate(false)
        setTemplateName('')
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim()
    if (!name || activeIndicators.length === 0) return
    saveTemplate(
      name,
      activeIndicators.map((entry) => ({
        type: entry.type,
        params: entry.params ?? {},
        pane: entry.pane,
      })),
    )
    setTemplateName('')
    setSavingTemplate(false)
  }, [templateName, activeIndicators, saveTemplate])

  const handleApplyTemplate = useCallback(
    (template: IndicatorTemplate) => {
      removeAllIndicators()
      setPendingTemplate(template.indicators)
      onOpenChange(false)
    },
    [removeAllIndicators, onOpenChange],
  )

  // Deferred template apply: addIndicator toggles off entries that match the
  // pre-clear indicator list (its closure over activeIndicators is one render
  // behind), so wait until the cleared list has propagated before adding.
  useEffect(() => {
    if (!pendingTemplate) return
    if (activeIndicators.length > 0) return
    setPendingTemplate(null)
    for (const entry of pendingTemplate) {
      addIndicator({
        type: entry.type as IndicatorType,
        seriesId,
        params: entry.params,
        pane: entry.pane,
      })
    }
  }, [pendingTemplate, activeIndicators, addIndicator, seriesId])

  // Auto-switch away from "active" when all indicators are removed
  useEffect(() => {
    if (selectedCategory === 'active' && activeIndicators.length === 0) {
      setSelectedCategory('all')
    }
  }, [selectedCategory, activeIndicators.length])

  const activeTypeSet = useMemo(
    () => new Set(activeIndicators.map((i) => i.type)),
    [activeIndicators],
  )

  // Custom (script-defined) indicators — reactive on registry changes only
  // (plugin activation / script saves), never on market data ticks.
  const customIndicatorsVersion = useSyncExternalStore(
    subscribeToCustomIndicators,
    getCustomIndicatorsVersion,
    getCustomIndicatorsVersion,
  )
  const customEntries = useMemo(
    () => buildCustomCatalogEntries(),

    [customIndicatorsVersion],
  )
  const catalog = useMemo(
    () =>
      customEntries.length === 0
        ? INDICATOR_CATALOG
        : [...INDICATOR_CATALOG, ...customEntries],
    [customEntries],
  )

  // Search matcher reused across filter stages
  const matchesSearch = useCallback(
    (e: IndicatorCatalogEntry, q: string) =>
      !q ||
      entryLabel(e, t).toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q),
    [t],
  )

  // Filter pipeline: category → search → pane
  const { filtered, grouped, showGrouped, categoryCounts, paneFilterCounts } =
    useMemo(() => {
      const q = search.toLowerCase().trim()

      // Step 1: category filter
      let byCat: Array<IndicatorCatalogEntry>
      if (selectedCategory === 'all') {
        byCat = catalog
      } else if (selectedCategory === 'active') {
        byCat = catalog.filter((e) => activeTypeSet.has(e.type))
      } else {
        byCat = catalog.filter((e) => e.categoryKey === selectedCategory)
      }

      // Step 2: search — match against translated label and type code
      const bySearch = q ? byCat.filter((e) => matchesSearch(e, q)) : byCat

      // Compute pane filter counts from the search-filtered set
      const paneCounts = {
        all: bySearch.length,
        overlay: bySearch.filter((e) => e.pane === 'overlay').length,
        separate: bySearch.filter((e) => e.pane === 'separate').length,
      }

      // Step 3: pane filter
      const byPane =
        paneFilter === 'all'
          ? bySearch
          : bySearch.filter((e) => e.pane === paneFilter)

      // Group by category when viewing "all" with no search
      const groupedView = selectedCategory === 'all' && !q
      const groupedItems = groupedView
        ? CATEGORY_KEYS.map((catKey) => ({
            categoryKey: catKey,
            items: byPane.filter((e) => e.categoryKey === catKey),
          })).filter((g) => g.items.length > 0)
        : []

      // Counts per category (for sidebar badges) — respects search filter
      const searchFiltered = q
        ? catalog.filter((e) => matchesSearch(e, q))
        : catalog
      const catCounts: Record<string, number> = {}
      for (const catKey of CATEGORY_KEYS) {
        catCounts[catKey] = searchFiltered.filter(
          (e) => e.categoryKey === catKey,
        ).length
      }

      return {
        filtered: byPane,
        grouped: groupedItems,
        showGrouped: groupedView,
        categoryCounts: catCounts,
        paneFilterCounts: paneCounts,
      }
    }, [
      selectedCategory,
      paneFilter,
      search,
      activeTypeSet,
      matchesSearch,
      catalog,
    ])

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    if (showGrouped) {
      return grouped.flatMap((g) => g.items)
    }
    return filtered
  }, [showGrouped, grouped, filtered])

  const handleSelect = useCallback(
    (entry: IndicatorCatalogEntry) => {
      onAddIndicator({
        type: entry.type,
        seriesId,
        params: entry.defaultParams,
        pane: entry.pane,
      })
      onOpenChange(false)
    },
    [onAddIndicator, onOpenChange, seriesId],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, flatList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault()
        const entry = flatList[focusedIndex]
        if (entry) handleSelect(entry)
      }
    },
    [flatList, focusedIndex, handleSelect],
  )

  // Scroll focused item into view
  const scrollIntoView = useCallback((index: number) => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('[data-indicator-row]')
    items[index]?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Update scroll on focus change
  const prevFocusedIndex = useRef(focusedIndex)
  if (prevFocusedIndex.current !== focusedIndex) {
    prevFocusedIndex.current = focusedIndex
    // Use microtask to ensure DOM is updated
    queueMicrotask(() => scrollIntoView(focusedIndex))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl min-h-[420px] max-h-[min(560px,calc(100vh-4rem))] p-0 gap-0 flex flex-col overflow-hidden"
      >
        <DialogTitle className="sr-only">{t('indicators.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('indicators.description')}
        </DialogDescription>

        {/* Search bar */}
        <div className="px-3 py-2.5 border-b" onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t('indicators.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setFocusedIndex(-1)
              }}
              autoFocus
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground flex-1"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  searchRef.current?.focus()
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {t('indicators.picker.clear')}
              </button>
            )}
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r overflow-y-auto py-2 px-1.5 hidden sm:flex flex-col gap-0.5">
            {/* Templates */}
            <div className="px-2 pb-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('indicators.templates.heading')}
            </div>

            {templates.map((template) => (
              <div
                key={template.id}
                className="group/template flex items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => handleApplyTemplate(template)}
                  title={t('indicators.templates.applyTitle')}
                  className="min-w-0 flex-1 text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="truncate flex-1">{template.name}</span>
                  <span className="text-muted-foreground ml-auto">
                    {template.indicators.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(template.id)}
                  aria-label={t('indicators.templates.delete')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/template:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}

            {savingTemplate ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      handleSaveTemplate()
                    } else if (e.key === 'Escape') {
                      setSavingTemplate(false)
                      setTemplateName('')
                    }
                  }}
                  placeholder={t('indicators.templates.namePlaceholder')}
                  className="min-w-0 flex-1 bg-transparent border-b py-0.5 text-xs outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                  aria-label={t('indicators.templates.save')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Check className="size-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSavingTemplate(true)}
                disabled={activeIndicators.length === 0}
                className="w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="size-3 shrink-0" />
                <span className="truncate">
                  {t('indicators.templates.saveCurrent')}
                </span>
              </button>
            )}

            <div className="border-b mx-1 my-1.5" />

            <SidebarButton
              active={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
            >
              {t('indicators.picker.allIndicators')}
              <span className="text-muted-foreground ml-auto">
                {Object.values(categoryCounts).reduce((a, b) => a + b, 0)}
              </span>
            </SidebarButton>

            {activeIndicators.length > 0 && (
              <SidebarButton
                active={selectedCategory === 'active'}
                onClick={() => setSelectedCategory('active')}
              >
                {t('indicators.activeHeading')}
                <span className="text-muted-foreground ml-auto">
                  {activeIndicators.length}
                </span>
              </SidebarButton>
            )}

            <div className="border-b mx-1 my-1.5" />

            {CATEGORY_KEYS.filter(
              (catKey) =>
                catKey !== CUSTOM_CATEGORY_KEY || customEntries.length > 0,
            ).map((catKey) => (
              <SidebarButton
                key={catKey}
                active={selectedCategory === catKey}
                onClick={() => setSelectedCategory(catKey)}
              >
                {t(catKey)}
                <span className="text-muted-foreground ml-auto">
                  {categoryCounts[catKey]}
                </span>
              </SidebarButton>
            ))}

            {/* Clear all — pinned to the bottom of the sidebar */}
            <div className="mt-auto pt-1.5">
              <div className="border-b mx-1 mb-1.5" />
              <button
                type="button"
                onClick={() => removeAllIndicators()}
                disabled={activeIndicators.length === 0}
                className="w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Trash2 className="size-3 shrink-0" />
                <span className="truncate">
                  {t('indicators.picker.clearAll')}
                </span>
              </button>
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Filter tabs */}
            <div className="px-3 py-2 border-b flex items-center gap-1.5">
              <FilterTab
                active={paneFilter === 'all'}
                onClick={() => setPaneFilter('all')}
              >
                {t('indicators.picker.filterAll')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.all}
                </span>
              </FilterTab>
              <FilterTab
                active={paneFilter === 'overlay'}
                onClick={() => setPaneFilter('overlay')}
              >
                <Layers className="size-3" />
                {t('indicators.picker.filterOverlay')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.overlay}
                </span>
              </FilterTab>
              <FilterTab
                active={paneFilter === 'separate'}
                onClick={() => setPaneFilter('separate')}
              >
                <SplitSquareVertical className="size-3" />
                {t('indicators.picker.filterSeparate')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.separate}
                </span>
              </FilterTab>
            </div>

            {/* Indicator list */}
            <ScrollArea className="min-h-0 flex-1">
              <div ref={listRef}>
                {flatList.length === 0 && (
                  <div className="text-muted-foreground text-sm text-center py-8">
                    {t('indicators.noResults')}
                  </div>
                )}

                {showGrouped
                  ? grouped.map((group) => (
                      <div key={group.categoryKey}>
                        <div className="sticky top-0 bg-popover/95 backdrop-blur-sm px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          {t(group.categoryKey)}
                        </div>
                        {group.items.map((entry) => {
                          const globalIdx = flatList.indexOf(entry)
                          return (
                            <IndicatorRow
                              key={entry.type}
                              entry={entry}
                              label={entryLabel(entry, t)}
                              isActive={activeTypeSet.has(entry.type)}
                              isFocused={globalIdx === focusedIndex}
                              onSelect={() => handleSelect(entry)}
                              onHover={() => setFocusedIndex(globalIdx)}
                            />
                          )
                        })}
                      </div>
                    ))
                  : filtered.map((entry) => {
                      const idx = flatList.indexOf(entry)
                      return (
                        <IndicatorRow
                          key={entry.type}
                          entry={entry}
                          label={entryLabel(entry, t)}
                          isActive={activeTypeSet.has(entry.type)}
                          isFocused={idx === focusedIndex}
                          onSelect={() => handleSelect(entry)}
                          onHover={() => setFocusedIndex(idx)}
                        />
                      )
                    })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SidebarButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${
        active
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function IndicatorRow({
  entry,
  label,
  isActive,
  isFocused,
  onSelect,
  onHover,
}: {
  entry: IndicatorCatalogEntry
  label: string
  isActive: boolean
  isFocused: boolean
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      data-indicator-row
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
        isFocused ? 'bg-muted/80' : 'hover:bg-muted/50'
      }`}
    >
      {isActive ? (
        <Check className="text-primary size-4 shrink-0" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="truncate flex-1">{label}</span>
      <span className="text-muted-foreground text-xs font-mono shrink-0">
        {entry.type.startsWith('custom:')
          ? (entry.type.split(':').pop() ?? entry.type)
          : entry.type}
      </span>
    </button>
  )
}
