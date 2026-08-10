// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Chart data → CSV.
//
// Pure string building, no DOM and no chart engine: the caller hands over the
// bars it already has (the engine's own series, so a forming bar and a replay
// cursor are both reflected) and gets a file back. That split is what makes
// the column layout testable — the interesting part of an export is not the
// download, it is whether a compare symbol and an indicator that started
// later than the chart still land on the right rows.
//
// Rows are the MAIN series' bars. Everything else joins on timestamp and
// leaves an empty cell where it has nothing, because a compare symbol listed
// three months after the base pair legitimately has no value for the early
// rows — shifting its column up to fill them would silently fabricate data.
// ---------------------------------------------------------------------------
import type {
  ChartBar,
  IndicatorValuePoint,
} from '@pairlens/fast-financial-charts/types'

export type ChartCsvTimeFormat = 'iso' | 'utc' | 'unixSeconds' | 'unixMillis'

export type ChartCsvSeries = {
  /** Column prefix — the pair key for a compare symbol. */
  label: string
  bars: ReadonlyArray<ChartBar>
}

export type ChartCsvIndicator = {
  /** Display label as the chart shows it, e.g. `ema (21)`. */
  label: string
  values: ReadonlyArray<IndicatorValuePoint>
}

export type ChartCsvInput = {
  /** The chart's primary series. Its bars define the rows. */
  main: ChartCsvSeries
  /** Compare overlays. Exported as a close column each — they are drawn as lines. */
  compares?: ReadonlyArray<ChartCsvSeries>
  indicators?: ReadonlyArray<ChartCsvIndicator>
  timeFormat: ChartCsvTimeFormat
}

const MAIN_COLUMNS = ['time', 'open', 'high', 'low', 'close', 'volume']

/**
 * Numbers, without the exponent notation.
 *
 * `String(1e-7)` is `"1e-7"`, which some spreadsheets import as text — and
 * prices at the low-decimals end of crypto reach that range routinely. The
 * expansion moves the decimal point through the digits JS already chose
 * rather than going back through `toFixed`, which would re-render the value
 * at a precision it never had: `(1e-7).toFixed(24)` is
 * `0.000000099999999999999995`.
 */
export function formatCsvNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rendered = String(value)
  const parts = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(rendered)
  if (!parts) return rendered

  const [, sign, whole, fraction = '', exponent] = parts
  const digits = whole + fraction
  const point = whole.length + Number(exponent)
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) {
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

/** RFC 4180 quoting. */
function quote(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}

/**
 * Text cells only. A label opening with `=`, `+`, `@` or a control character
 * is a formula to Excel and Sheets, and indicator titles come from scripts the
 * user (or a plugin) wrote. Leading apostrophe is the standard defusing.
 * Numbers never pass through here, so a negative value keeps its sign.
 */
function escapeText(field: string): string {
  return quote(/^[=+@\t\r]/.test(field) ? `'${field}` : field)
}

export function formatCsvTime(ts: number, format: ChartCsvTimeFormat): string {
  if (!Number.isFinite(ts)) return ''
  switch (format) {
    case 'unixMillis':
      return String(Math.trunc(ts))
    case 'unixSeconds':
      return String(Math.floor(ts / 1000))
    case 'utc':
      // `2026-08-10 12:00:00` — what a spreadsheet parses as a date without
      // being told to.
      return new Date(ts)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, '')
    case 'iso':
      return new Date(ts).toISOString()
  }
}

/**
 * The value keys an indicator actually produced, in first-seen order.
 *
 * Indicators are free-form records keyed by `ts` (`{ts, value}` for an EMA,
 * `{ts, macd, signal, histogram}` for a MACD), and a custom Python indicator
 * defines whatever series it declared. Scanning the points is the only way to
 * learn the shape; first-seen order keeps the columns stable rather than
 * alphabetised into a different order than the chart draws them.
 */
function indicatorKeys(
  values: ReadonlyArray<IndicatorValuePoint>,
): Array<string> {
  const keys: Array<string> = []
  const seen = new Set<string>()
  for (const point of values) {
    for (const key of Object.keys(point)) {
      if (key === 'ts' || seen.has(key)) continue
      if (point[key] === undefined) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

/**
 * The column name for one plot of an indicator.
 *
 * Two cases collapse to the bare label: a single-plot indicator, whose key is
 * the placeholder `value` (`EMA (21)`, not `EMA (21) value`), and a plot whose
 * key restates the indicator (MACD's own line is keyed `macd`, and
 * `MACD macd` reads like a typo). Every other plot keeps its key, so MACD's
 * remaining columns stay `MACD signal` and `MACD histogram`.
 */
function indicatorHeader(
  label: string,
  key: string,
  keys: ReadonlyArray<string>,
): string {
  if (keys.length === 1 && key === 'value') return label
  if (key.toLowerCase() === label.toLowerCase()) return label
  return `${label} ${key}`
}

/** Two EMA(21)s on one chart must not produce two identical headers. */
function uniqueHeader(taken: Set<string>, header: string): string {
  if (!taken.has(header)) {
    taken.add(header)
    return header
  }
  let n = 2
  while (taken.has(`${header} (${n})`)) n += 1
  const unique = `${header} (${n})`
  taken.add(unique)
  return unique
}

function cellValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return formatCsvNumber(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return escapeText(String(value))
}

/**
 * Build the CSV text for a chart.
 *
 * Newlines are `\n`: every spreadsheet reads it, and CRLF only earns its
 * bytes when a file is going somewhere that predates them.
 */
export function buildChartCsv(input: ChartCsvInput): string {
  const { main, compares = [], indicators = [], timeFormat } = input

  const taken = new Set<string>(MAIN_COLUMNS)
  const headers = [...MAIN_COLUMNS]

  const compareColumns = compares.map((series) => ({
    header: uniqueHeader(taken, `${series.label} close`),
    byTs: new Map(series.bars.map((bar) => [bar.ts, bar.close])),
  }))
  headers.push(...compareColumns.map((column) => column.header))

  const indicatorColumns = indicators.flatMap((indicator) => {
    const keys = indicatorKeys(indicator.values)
    const byTs = new Map(indicator.values.map((point) => [point.ts, point]))
    return keys.map((key) => ({
      header: uniqueHeader(taken, indicatorHeader(indicator.label, key, keys)),
      key,
      byTs,
    }))
  })
  headers.push(...indicatorColumns.map((column) => column.header))

  const lines = [headers.map(escapeText).join(',')]

  for (const bar of main.bars) {
    const row = [
      formatCsvTime(bar.ts, timeFormat),
      formatCsvNumber(bar.open),
      formatCsvNumber(bar.high),
      formatCsvNumber(bar.low),
      formatCsvNumber(bar.close),
      formatCsvNumber(bar.volume),
    ]
    for (const column of compareColumns) {
      const close = column.byTs.get(bar.ts)
      row.push(close === undefined ? '' : formatCsvNumber(close))
    }
    for (const column of indicatorColumns) {
      row.push(cellValue(column.byTs.get(bar.ts)?.[column.key]))
    }
    lines.push(row.join(','))
  }

  return `${lines.join('\n')}\n`
}

/**
 * The bars a viewport covers, inclusive of both ends.
 *
 * The engine's viewport indices can run past the last bar (the right margin
 * scrolls into empty space) and below zero, so both ends are clamped instead
 * of trusted.
 */
export function barsInViewport(
  bars: ReadonlyArray<ChartBar>,
  viewport: { startIndex: number; endIndex: number },
): Array<ChartBar> {
  const start = Math.max(0, Math.floor(viewport.startIndex))
  const end = Math.min(bars.length - 1, Math.ceil(viewport.endIndex))
  if (end < start) return []
  return bars.slice(start, end + 1)
}

/** `BTC-USDT_okx_1h_2026-08-10.csv` — safe on every filesystem we ship to. */
export function chartCsvFileName(input: {
  pairKey: string
  market: string
  timeframe: string
  now: Date
}): string {
  const slug = (value: string) =>
    value.replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '')
  const date = input.now.toISOString().slice(0, 10)
  const parts = [
    slug(input.pairKey) || 'chart',
    slug(input.market),
    slug(input.timeframe),
    date,
  ].filter(Boolean)
  return `${parts.join('_')}.csv`
}
