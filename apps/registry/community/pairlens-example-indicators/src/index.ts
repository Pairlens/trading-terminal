/**
 * Example Indicators — reference community `chart:indicator` plugin.
 *
 * This is the template to copy for shipping your own Python chart indicators
 * as a plugin. The contract is small:
 *
 *   - the module exports `manifest` and `createPlugin`
 *   - `execute({ capability: 'chart:indicator' })` resolves to an array of
 *     descriptors: `{ meta, language: 'python', source }`
 *   - `meta` mirrors what the script's `meta = indicator(...)` declares (plus
 *     a stable `id` unique within this plugin), so the terminal can render
 *     the indicator's inputs and series without running Python first
 *   - `source` is the entry script (`main.py`), targeting the `pairlens`
 *     Python SDK
 *   - `modules` is optional: `{ path, source }` helper files written next to
 *     the entry, so a bigger indicator can `import helpers` like any Python
 *     folder
 *
 * Community plugins run in the sandbox worker: no imports of host modules at
 * runtime (types are inlined below — they mirror CustomIndicatorDescriptor in
 * @pairlens/shared/plugin-types), no DOM, and network only via the manifest
 * allowlist (this plugin needs none).
 */
import manifestJson from '../manifest.json'

// ── Types (mirrors of @pairlens/shared/plugin-types) ────────────────────────

type IndicatorSeriesSpec = {
  key: string
  title?: string
  style: 'line' | 'histogram' | 'area'
  color?: string
  width?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  upDown?: boolean
}

type IndicatorInputSpec =
  | {
      kind: 'int' | 'float'
      key: string
      label?: string
      default: number
      min?: number
      max?: number
      step?: number
    }
  | { kind: 'bool'; key: string; label?: string; default: boolean }
  | {
      kind: 'choice'
      key: string
      label?: string
      default: string
      options: Array<string>
    }
  | { kind: 'source'; key: string; label?: string; default: string }

type IndicatorHLine = { value: number; color?: string; label?: string }

type IndicatorMeta = {
  id: string
  title: string
  pane: 'overlay' | 'separate'
  inputs: Array<IndicatorInputSpec>
  series: Array<IndicatorSeriesSpec>
  hlines?: Array<IndicatorHLine>
  packages?: Array<string>
  minBars?: number
}

type IndicatorDescriptor = {
  meta: IndicatorMeta
  language: 'python'
  source: string
  modules?: Array<{ path: string; source: string }>
}

// ── Z-Score — rolling z-score of price (teaches: rolling stats, hlines) ─────

const Z_SCORE_SOURCE = `import numpy as np

from pairlens import indicator, input, series, hline, color

meta = indicator(
    title='Z-Score',
    pane='sub',
    inputs=[
        input.int('length', default=50, min=2, max=500),
        input.source('src', default='close'),
    ],
    series=[series.line('zscore', title='Z-Score', color=color.accent, width=2)],
    hlines=[
        hline(2, color=color.down, label='+2σ'),
        hline(0, color=color.muted),
        hline(-2, color=color.up, label='-2σ'),
    ],
    packages=['numpy'],
    min_bars=50,
)


def compute(ctx):
    length = int(ctx.params.length)
    src = np.asarray(ctx.source, dtype=np.float64)
    n = len(src)
    z = np.full(n, np.nan)
    if n < length:
        return {'zscore': z}

    # Rolling mean/std with a sliding-window view: fully vectorized,
    # no Python loop over bars.
    windows = np.lib.stride_tricks.sliding_window_view(src, length)
    mean = windows.mean(axis=1)
    std = windows.std(axis=1)
    valid = std > 0  # flat windows have no meaningful z-score
    z[length - 1 :][valid] = (src[length - 1 :][valid] - mean[valid]) / std[valid]
    return {'zscore': z}
`

const Z_SCORE_META: IndicatorMeta = {
  id: 'z-score',
  title: 'Z-Score',
  pane: 'separate',
  inputs: [
    { kind: 'int', key: 'length', default: 50, min: 2, max: 500 },
    { kind: 'source', key: 'src', default: 'close' },
  ],
  series: [
    {
      key: 'zscore',
      style: 'line',
      title: 'Z-Score',
      color: 'token:accent',
      width: 2,
    },
  ],
  hlines: [
    { value: 2, color: 'token:down', label: '+2σ' },
    { value: 0, color: 'token:muted' },
    { value: -2, color: 'token:up', label: '-2σ' },
  ],
  packages: ['numpy'],
  minBars: 50,
}

// ── EMA Ribbon — four EMAs on the price pane (teaches: multi-series
//    overlay, several int inputs) ─────────────────────────────────────────────

const EMA_RIBBON_SOURCE = `import numpy as np

from pairlens import indicator, input, series, color

meta = indicator(
    title='EMA Ribbon',
    pane='overlay',
    inputs=[
        input.int('fast', default=8, min=1, max=200),
        input.int('mid', default=13, min=1, max=200),
        input.int('slow', default=21, min=1, max=300),
        input.int('anchor', default=34, min=1, max=400),
        input.source('src', default='close'),
    ],
    series=[
        series.line('fast', title='EMA fast', color=color.up, width=2),
        series.line('mid', title='EMA mid', color=color.primary),
        series.line('slow', title='EMA slow', color=color.accent),
        series.line('anchor', title='EMA anchor', color=color.muted, width=2),
    ],
    packages=['numpy'],
    min_bars=34,
)


def ema(values, length):
    # EMA is a recursive scan, so the bar loop is unavoidable.
    alpha = 2.0 / (length + 1.0)
    out = np.empty_like(values)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = alpha * values[i] + (1.0 - alpha) * out[i - 1]
    # NaN out the warmup: a seeded EMA hasn't converged yet.
    out[: length - 1] = np.nan
    return out


def compute(ctx):
    src = np.asarray(ctx.source, dtype=np.float64)
    return {
        key: ema(src, int(ctx.params[key]))
        for key in ('fast', 'mid', 'slow', 'anchor')
    }
`

const EMA_RIBBON_META: IndicatorMeta = {
  id: 'ema-ribbon',
  title: 'EMA Ribbon',
  pane: 'overlay',
  inputs: [
    { kind: 'int', key: 'fast', default: 8, min: 1, max: 200 },
    { kind: 'int', key: 'mid', default: 13, min: 1, max: 200 },
    { kind: 'int', key: 'slow', default: 21, min: 1, max: 300 },
    { kind: 'int', key: 'anchor', default: 34, min: 1, max: 400 },
    { kind: 'source', key: 'src', default: 'close' },
  ],
  series: [
    {
      key: 'fast',
      style: 'line',
      title: 'EMA fast',
      color: 'token:up',
      width: 2,
    },
    { key: 'mid', style: 'line', title: 'EMA mid', color: 'token:primary' },
    { key: 'slow', style: 'line', title: 'EMA slow', color: 'token:accent' },
    {
      key: 'anchor',
      style: 'line',
      title: 'EMA anchor',
      color: 'token:muted',
      width: 2,
    },
  ],
  packages: ['numpy'],
  minBars: 34,
}

// ── Volume Impulse — relative volume histogram (teaches: histogram style,
//    ctx.volume, choice + bool inputs) ────────────────────────────────────────

const VOLUME_IMPULSE_SOURCE = `import numpy as np

from pairlens import indicator, input, series, hline, color

meta = indicator(
    title='Volume Impulse',
    pane='sub',
    inputs=[
        input.int('length', default=20, min=2, max=200),
        input.choice('smoothing', options=['sma', 'ema'], default='sma'),
        input.bool('directional', default=False, label='Sign by candle direction'),
    ],
    series=[
        series.histogram('impulse', title='Impulse', up_down=True),
        series.line('trend', title='Trend', color=color.muted, style='dashed'),
    ],
    hlines=[hline(0, color=color.muted)],
    packages=['numpy'],
    min_bars=20,
)


def sma(values, length):
    out = np.full(len(values), np.nan)
    if len(values) >= length:
        kernel = np.ones(length) / length
        out[length - 1 :] = np.convolve(values, kernel, mode='valid')
    return out


def ema(values, length):
    alpha = 2.0 / (length + 1.0)
    out = np.empty_like(values)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = alpha * values[i] + (1.0 - alpha) * out[i - 1]
    return out


def compute(ctx):
    length = int(ctx.params.length)
    volume = np.asarray(ctx.volume, dtype=np.float64)

    if ctx.params.smoothing == 'ema':
        avg = ema(volume, length)
    else:
        avg = sma(volume, length)

    # Excess relative volume: 0 = average, +1 = double the average.
    with np.errstate(divide='ignore', invalid='ignore'):
        excess = np.where(avg > 0, volume / avg - 1.0, np.nan)
    excess[: length - 1] = np.nan  # warmup

    if ctx.params.directional:
        # Magnitude = deviation from average volume, sign = candle direction.
        sign = np.where(np.asarray(ctx.close) >= np.asarray(ctx.open), 1.0, -1.0)
        impulse = np.abs(excess) * sign
    else:
        impulse = excess

    # Smoothed impulse trend (warmup treated as neutral volume).
    trend = ema(np.nan_to_num(excess, nan=0.0), length)
    trend[: length - 1] = np.nan
    return {'impulse': impulse, 'trend': trend}
`

const VOLUME_IMPULSE_META: IndicatorMeta = {
  id: 'volume-impulse',
  title: 'Volume Impulse',
  pane: 'separate',
  inputs: [
    { kind: 'int', key: 'length', default: 20, min: 2, max: 200 },
    {
      kind: 'choice',
      key: 'smoothing',
      default: 'sma',
      options: ['sma', 'ema'],
    },
    {
      kind: 'bool',
      key: 'directional',
      label: 'Sign by candle direction',
      default: false,
    },
  ],
  series: [
    { key: 'impulse', style: 'histogram', title: 'Impulse', upDown: true },
    {
      key: 'trend',
      style: 'line',
      title: 'Trend',
      color: 'token:muted',
      lineStyle: 'dashed',
    },
  ],
  hlines: [{ value: 0, color: 'token:muted' }],
  packages: ['numpy'],
  minBars: 20,
}

// ── Plugin module contract ───────────────────────────────────────────────────

const descriptors: Array<IndicatorDescriptor> = [
  { meta: Z_SCORE_META, language: 'python', source: Z_SCORE_SOURCE },
  { meta: EMA_RIBBON_META, language: 'python', source: EMA_RIBBON_SOURCE },
  {
    meta: VOLUME_IMPULSE_META,
    language: 'python',
    source: VOLUME_IMPULSE_SOURCE,
  },
]

type PluginExecuteParams = {
  capability: string
  params: Record<string, unknown>
  context: Record<string, unknown>
}

type PluginInstance = {
  manifest: typeof manifestJson
  status: 'installed'
  config: Record<string, unknown>
  execute: (params: PluginExecuteParams) => Promise<unknown>
}

export const manifest = manifestJson

export function createPlugin(): PluginInstance {
  return {
    manifest: manifestJson,
    status: 'installed',
    config: {},
    execute: async ({ capability }) => {
      if (capability !== 'chart:indicator') {
        throw new Error(`unsupported capability '${capability}'`)
      }
      return descriptors
    },
  }
}
