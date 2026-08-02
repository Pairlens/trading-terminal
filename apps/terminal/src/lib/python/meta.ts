// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pure helpers shared by the Python worker and tests: validation of the meta
 * dict a script's `meta = indicator(...)` serializes to, user-param overlay
 * onto declared input specs, and Python traceback cleanup. No pyodide imports
 * here — everything must run under plain `bun test`.
 */
import type {
  CustomIndicatorAlertSpec,
  CustomIndicatorFillSpec,
  CustomIndicatorHLine,
  CustomIndicatorInputSpec,
  CustomIndicatorMarkerSpec,
  CustomIndicatorMeta,
  CustomIndicatorRequestSpec,
  CustomIndicatorRiskSpec,
  CustomIndicatorSeriesSpec,
  CustomIndicatorStrategySpec,
} from '@pairlens/shared/plugin-types'

export const SOURCE_KEYS = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
] as const

const SERIES_STYLES = [
  'line',
  'histogram',
  'area',
  'stepline',
  'columns',
  'circles',
  'cross',
  'background',
] as const
const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
const PANES = ['overlay', 'separate'] as const
const INPUT_KINDS = ['int', 'float', 'bool', 'choice', 'source'] as const
const MARKER_SHAPES = [
  'triangle_up',
  'triangle_down',
  'arrow_up',
  'arrow_down',
  'circle',
  'square',
  'diamond',
  'cross',
  'x',
  'flag',
] as const
const MARKER_POSITIONS = ['above', 'below', 'top', 'bottom', 'series'] as const
const MARKER_SIZES = ['tiny', 'small', 'normal', 'large'] as const
const VALUE_FORMATS = ['price', 'percent', 'volume'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new Error(`Invalid indicator meta: ${message}`)
}

function asKey(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${where} must have a non-empty string 'key'`)
  }
  return value
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') fail(`${where} must be a string`)
  return value
}

function optionalFiniteNumber(
  value: unknown,
  where: string,
): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${where} must be a finite number`)
  }
  return value
}

function parseInput(raw: unknown, index: number): CustomIndicatorInputSpec {
  const where = `inputs[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const kind = raw.kind
  if (
    typeof kind !== 'string' ||
    !(INPUT_KINDS as ReadonlyArray<string>).includes(kind)
  ) {
    fail(`${where}.kind must be one of ${INPUT_KINDS.join(', ')}`)
  }
  const key = asKey(raw.key, where)
  const label = optionalString(raw.label, `${where}.label`)

  if (kind === 'int' || kind === 'float') {
    const def = raw.default
    if (typeof def !== 'number' || !Number.isFinite(def)) {
      fail(`${where}.default must be a finite number`)
    }
    return {
      kind,
      key,
      ...(label !== undefined ? { label } : {}),
      default: kind === 'int' ? Math.round(def) : def,
      ...(optionalFiniteNumber(raw.min, `${where}.min`) !== undefined
        ? { min: optionalFiniteNumber(raw.min, `${where}.min`) }
        : {}),
      ...(optionalFiniteNumber(raw.max, `${where}.max`) !== undefined
        ? { max: optionalFiniteNumber(raw.max, `${where}.max`) }
        : {}),
      ...(optionalFiniteNumber(raw.step, `${where}.step`) !== undefined
        ? { step: optionalFiniteNumber(raw.step, `${where}.step`) }
        : {}),
    }
  }
  if (kind === 'bool') {
    if (typeof raw.default !== 'boolean') {
      fail(`${where}.default must be a boolean`)
    }
    return {
      kind,
      key,
      ...(label !== undefined ? { label } : {}),
      default: raw.default,
    }
  }
  if (kind === 'choice') {
    const options = raw.options
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      options.some((o) => typeof o !== 'string' || o.length === 0)
    ) {
      fail(`${where}.options must be a non-empty array of strings`)
    }
    const def = raw.default
    if (typeof def !== 'string' || !options.includes(def)) {
      fail(`${where}.default must be one of its options`)
    }
    return {
      kind,
      key,
      ...(label !== undefined ? { label } : {}),
      default: def,
      options: options as Array<string>,
    }
  }
  // source
  const def = raw.default
  if (
    typeof def !== 'string' ||
    !(SOURCE_KEYS as ReadonlyArray<string>).includes(def)
  ) {
    fail(`${where}.default must be one of ${SOURCE_KEYS.join(', ')}`)
  }
  return {
    kind: 'source',
    key,
    ...(label !== undefined ? { label } : {}),
    default: def,
  }
}

function parseSeries(raw: unknown, index: number): CustomIndicatorSeriesSpec {
  const where = `series[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const key = asKey(raw.key, where)
  const style = raw.style
  if (
    typeof style !== 'string' ||
    !(SERIES_STYLES as ReadonlyArray<string>).includes(style)
  ) {
    fail(`${where}.style must be one of ${SERIES_STYLES.join(', ')}`)
  }
  const spec: CustomIndicatorSeriesSpec = {
    key,
    style: style as CustomIndicatorSeriesSpec['style'],
  }
  const title = optionalString(raw.title, `${where}.title`)
  if (title !== undefined) spec.title = title
  const color = optionalString(raw.color, `${where}.color`)
  if (color !== undefined) spec.color = color
  const width = optionalFiniteNumber(raw.width, `${where}.width`)
  if (width !== undefined) {
    if (width <= 0) fail(`${where}.width must be positive`)
    spec.width = width
  }
  if (raw.lineStyle !== undefined && raw.lineStyle !== null) {
    if (
      typeof raw.lineStyle !== 'string' ||
      !(LINE_STYLES as ReadonlyArray<string>).includes(raw.lineStyle)
    ) {
      fail(`${where}.lineStyle must be one of ${LINE_STYLES.join(', ')}`)
    }
    spec.lineStyle = raw.lineStyle as CustomIndicatorSeriesSpec['lineStyle']
  }
  if (raw.upDown !== undefined && raw.upDown !== null) {
    if (typeof raw.upDown !== 'boolean')
      fail(`${where}.upDown must be a boolean`)
    spec.upDown = raw.upDown
  }
  const palette = optionalPalette(raw.palette, `${where}.palette`)
  if (palette !== undefined) spec.palette = palette
  const opacity = optionalUnit(raw.opacity, `${where}.opacity`)
  if (opacity !== undefined) spec.opacity = opacity
  if (raw.hidden !== undefined && raw.hidden !== null) {
    if (typeof raw.hidden !== 'boolean')
      fail(`${where}.hidden must be a boolean`)
    spec.hidden = raw.hidden
  }
  return spec
}

/** A non-empty list of color strings, or undefined when absent. */
function optionalPalette(
  value: unknown,
  where: string,
): Array<string> | undefined {
  if (value === undefined || value === null) return undefined
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((c) => typeof c !== 'string' || c.length === 0)
  ) {
    fail(`${where} must be a non-empty array of color strings`)
  }
  return value as Array<string>
}

/** A number in 0..1, or undefined when absent. */
function optionalUnit(value: unknown, where: string): number | undefined {
  const num = optionalFiniteNumber(value, where)
  if (num === undefined) return undefined
  if (num < 0 || num > 1) fail(`${where} must be between 0 and 1`)
  return num
}

function parseMarker(raw: unknown, index: number): CustomIndicatorMarkerSpec {
  const where = `markers[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const key = asKey(raw.key, where)
  const shape = raw.shape
  if (
    typeof shape !== 'string' ||
    !(MARKER_SHAPES as ReadonlyArray<string>).includes(shape)
  ) {
    fail(`${where}.shape must be one of ${MARKER_SHAPES.join(', ')}`)
  }
  const position = raw.position ?? 'above'
  if (
    typeof position !== 'string' ||
    !(MARKER_POSITIONS as ReadonlyArray<string>).includes(position)
  ) {
    fail(`${where}.position must be one of ${MARKER_POSITIONS.join(', ')}`)
  }
  const spec: CustomIndicatorMarkerSpec = {
    key,
    shape: shape as CustomIndicatorMarkerSpec['shape'],
    position: position as CustomIndicatorMarkerSpec['position'],
  }
  if (position === 'series') {
    const at = optionalString(raw.at, `${where}.at`)
    if (at === undefined) {
      fail(`${where}.at is required when position is 'series'`)
    }
    spec.at = at
  }
  const color = optionalString(raw.color, `${where}.color`)
  if (color !== undefined) spec.color = color
  const text = optionalString(raw.text, `${where}.text`)
  if (text !== undefined) spec.text = text
  const title = optionalString(raw.title, `${where}.title`)
  if (title !== undefined) spec.title = title
  if (raw.size !== undefined && raw.size !== null) {
    if (
      typeof raw.size !== 'string' ||
      !(MARKER_SIZES as ReadonlyArray<string>).includes(raw.size)
    ) {
      fail(`${where}.size must be one of ${MARKER_SIZES.join(', ')}`)
    }
    spec.size = raw.size as CustomIndicatorMarkerSpec['size']
  }
  return spec
}

function parseFill(raw: unknown, index: number): CustomIndicatorFillSpec {
  const where = `fills[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const from = optionalString(raw.from, `${where}.from`)
  if (from === undefined || from.length === 0) {
    fail(`${where}.from must be a series key`)
  }
  const to = optionalString(raw.to, `${where}.to`)
  const level = optionalFiniteNumber(raw.level, `${where}.level`)
  if (to === undefined && level === undefined) {
    fail(`${where} needs either a 'to' series key or a numeric 'level'`)
  }
  const spec: CustomIndicatorFillSpec = { from }
  if (to !== undefined) spec.to = to
  if (level !== undefined) spec.level = level
  const color = optionalString(raw.color, `${where}.color`)
  if (color !== undefined) spec.color = color
  const palette = optionalPalette(raw.palette, `${where}.palette`)
  if (palette !== undefined) spec.palette = palette
  const opacity = optionalUnit(raw.opacity, `${where}.opacity`)
  if (opacity !== undefined) spec.opacity = opacity
  const title = optionalString(raw.title, `${where}.title`)
  if (title !== undefined) spec.title = title
  return spec
}

function parseAlert(raw: unknown, index: number): CustomIndicatorAlertSpec {
  const where = `alerts[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const key = asKey(raw.key, where)
  const title = optionalString(raw.title, `${where}.title`)
  if (title === undefined || title.length === 0) {
    fail(`${where}.title must be a non-empty string`)
  }
  const spec: CustomIndicatorAlertSpec = { key, title }
  const message = optionalString(raw.message, `${where}.message`)
  if (message !== undefined) spec.message = message
  return spec
}

function parseRequest(raw: unknown, index: number): CustomIndicatorRequestSpec {
  const where = `requests[${index}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const spec: CustomIndicatorRequestSpec = { key: asKey(raw.key, where) }
  const timeframe = optionalString(raw.timeframe, `${where}.timeframe`)
  if (timeframe !== undefined) spec.timeframe = timeframe
  const pair = optionalString(raw.pair, `${where}.pair`)
  if (pair !== undefined) spec.pair = pair.toUpperCase()
  const market = optionalString(raw.market, `${where}.market`)
  if (market !== undefined) spec.market = market
  return spec
}

function parseStrategy(raw: unknown): CustomIndicatorStrategySpec {
  const where = 'strategy'
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const number = (key: string, fallback: number): number =>
    optionalFiniteNumber(raw[key], `${where}.${key}`) ?? fallback
  const initialCapital = number('initialCapital', 10_000)
  if (initialCapital <= 0) fail(`${where}.initialCapital must be positive`)
  const positionSize = number('positionSize', 1)
  if (positionSize <= 0 || positionSize > 1) {
    fail(`${where}.positionSize must be in (0, 1]`)
  }
  const fee = number('fee', 0)
  if (fee < 0 || fee > 0.1) fail(`${where}.fee must be between 0 and 0.1`)
  const slippage = number('slippage', 0)
  if (slippage < 0 || slippage > 0.1) {
    fail(`${where}.slippage must be between 0 and 0.1`)
  }
  const spec: CustomIndicatorStrategySpec = {
    initialCapital,
    positionSize,
    fee,
    slippage,
    allowShort: raw.allowShort !== false,
  }
  const risk = parseRisk(raw.risk)
  if (risk !== undefined) spec.risk = risk
  return spec
}

/**
 * Protective exits. Every field is optional, so an empty or absent block means
 * "no protective exits" rather than an error — but a field that is present and
 * nonsensical (a negative stop, a zero bar cap) is rejected loudly, because
 * silently ignoring it would let a live bot run without the protection its
 * author believed they had asked for.
 */
function parseRisk(raw: unknown): CustomIndicatorRiskSpec | undefined {
  const where = 'strategy.risk'
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) fail(`${where} must be an object`)
  const spec: CustomIndicatorRiskSpec = {}
  for (const key of ['stopLoss', 'takeProfit', 'trailingStop'] as const) {
    const value = optionalFiniteNumber(raw[key], `${where}.${key}`)
    if (value === undefined) continue
    if (value <= 0 || value > 1) {
      fail(`${where}.${key} must be a fraction in (0, 1]`)
    }
    spec[key] = value
  }
  const maxBars = optionalFiniteNumber(raw.maxBars, `${where}.maxBars`)
  if (maxBars !== undefined) {
    if (maxBars < 1) fail(`${where}.maxBars must be at least 1`)
    spec.maxBars = Math.floor(maxBars)
  }
  return Object.keys(spec).length > 0 ? spec : undefined
}

function parseHLine(raw: unknown, index: number): CustomIndicatorHLine {
  const where = `hlines[${index}]`
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) fail(`${where} must be finite`)
    return { value: raw }
  }
  if (!isRecord(raw)) fail(`${where} must be a number or an object`)
  const value = raw.value
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${where}.value must be a finite number`)
  }
  const hline: CustomIndicatorHLine = { value }
  const color = optionalString(raw.color, `${where}.color`)
  if (color !== undefined) hline.color = color
  const label = optionalString(raw.label, `${where}.label`)
  if (label !== undefined) hline.label = label
  return hline
}

/**
 * Validate the plain dict serialized by the Python SDK's meta object and
 * stamp the host-provided script id. Throws with a descriptive message on any
 * shape violation.
 */
export function parseIndicatorMeta(
  raw: unknown,
  id: string,
): CustomIndicatorMeta {
  if (!isRecord(raw))
    fail('script must define a top-level `meta = indicator(...)`')
  const title = raw.title
  if (typeof title !== 'string' || title.length === 0) {
    fail('title must be a non-empty string')
  }
  const pane = raw.pane
  if (
    typeof pane !== 'string' ||
    !(PANES as ReadonlyArray<string>).includes(pane)
  ) {
    fail(`pane must be one of ${PANES.join(', ')}`)
  }
  const rawInputs = raw.inputs ?? []
  if (!Array.isArray(rawInputs)) fail('inputs must be an array')
  const inputs = rawInputs.map(parseInput)
  const seen = new Set<string>()
  for (const input of inputs) {
    if (seen.has(input.key)) fail(`duplicate input key '${input.key}'`)
    seen.add(input.key)
  }

  const rawSeries = raw.series
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) {
    fail('series must be a non-empty array')
  }
  const series = rawSeries.map(parseSeries)
  const seenSeries = new Set<string>()
  for (const s of series) {
    if (seenSeries.has(s.key)) fail(`duplicate series key '${s.key}'`)
    seenSeries.add(s.key)
  }

  const meta: CustomIndicatorMeta = {
    id,
    title,
    pane: pane as CustomIndicatorMeta['pane'],
    inputs,
    series,
  }

  if (raw.hlines !== undefined && raw.hlines !== null) {
    if (!Array.isArray(raw.hlines)) fail('hlines must be an array')
    meta.hlines = raw.hlines.map(parseHLine)
  }
  if (raw.markers !== undefined && raw.markers !== null) {
    if (!Array.isArray(raw.markers)) fail('markers must be an array')
    const markers = raw.markers.map(parseMarker)
    for (const marker of markers) {
      // `key` may be any compute() output, but an anchor has to be a plot we
      // actually have coordinates for.
      if (marker.at !== undefined && !seenSeries.has(marker.at)) {
        fail(`marker anchors on unknown series '${marker.at}'`)
      }
    }
    meta.markers = markers
  }
  if (raw.fills !== undefined && raw.fills !== null) {
    if (!Array.isArray(raw.fills)) fail('fills must be an array')
    const fills = raw.fills.map(parseFill)
    for (const fill of fills) {
      for (const key of [fill.from, fill.to]) {
        if (key !== undefined && !seenSeries.has(key)) {
          fail(`fill references unknown series '${key}'`)
        }
      }
    }
    meta.fills = fills
  }
  if (raw.alerts !== undefined && raw.alerts !== null) {
    if (!Array.isArray(raw.alerts)) fail('alerts must be an array')
    const alerts = raw.alerts.map(parseAlert)
    const seenAlerts = new Set<string>()
    for (const alert of alerts) {
      if (seenAlerts.has(alert.key)) fail(`duplicate alert key '${alert.key}'`)
      seenAlerts.add(alert.key)
    }
    meta.alerts = alerts
  }
  if (raw.requests !== undefined && raw.requests !== null) {
    if (!Array.isArray(raw.requests)) fail('requests must be an array')
    const requests = raw.requests.map(parseRequest)
    const seenRequests = new Set<string>()
    for (const request of requests) {
      if (seenRequests.has(request.key)) {
        fail(`duplicate request key '${request.key}'`)
      }
      seenRequests.add(request.key)
    }
    meta.requests = requests
  }
  if (raw.strategy !== undefined && raw.strategy !== null) {
    meta.strategy = parseStrategy(raw.strategy)
  }
  if (raw.precision !== undefined && raw.precision !== null) {
    if (
      typeof raw.precision !== 'number' ||
      !Number.isInteger(raw.precision) ||
      raw.precision < 0 ||
      raw.precision > 12
    ) {
      fail('precision must be an integer between 0 and 12')
    }
    meta.precision = raw.precision
  }
  if (raw.format !== undefined && raw.format !== null) {
    if (
      typeof raw.format !== 'string' ||
      !(VALUE_FORMATS as ReadonlyArray<string>).includes(raw.format)
    ) {
      fail(`format must be one of ${VALUE_FORMATS.join(', ')}`)
    }
    meta.format = raw.format as CustomIndicatorMeta['format']
  }
  if (raw.packages !== undefined && raw.packages !== null) {
    if (
      !Array.isArray(raw.packages) ||
      raw.packages.some((p) => typeof p !== 'string' || p.length === 0)
    ) {
      fail('packages must be an array of non-empty strings')
    }
    meta.packages = raw.packages as Array<string>
  }
  if (raw.minBars !== undefined && raw.minBars !== null) {
    if (
      typeof raw.minBars !== 'number' ||
      !Number.isInteger(raw.minBars) ||
      raw.minBars < 0
    ) {
      fail('minBars must be a non-negative integer')
    }
    meta.minBars = raw.minBars
  }
  return meta
}

/**
 * Overlay user-supplied values onto the script's declared inputs. Invalid or
 * missing values fall back to the declared default; numbers are clamped to
 * min/max and int inputs are rounded.
 */
export function resolveParams(
  inputs: Array<CustomIndicatorInputSpec>,
  user: Record<string, unknown>,
): Record<string, number | boolean | string> {
  const resolved: Record<string, number | boolean | string> = {}
  for (const input of inputs) {
    const value = user[input.key]
    switch (input.kind) {
      case 'int':
      case 'float': {
        let num =
          typeof value === 'number' && Number.isFinite(value)
            ? value
            : input.default
        if (input.min !== undefined) num = Math.max(input.min, num)
        if (input.max !== undefined) num = Math.min(input.max, num)
        resolved[input.key] = input.kind === 'int' ? Math.round(num) : num
        break
      }
      case 'bool':
        resolved[input.key] = typeof value === 'boolean' ? value : input.default
        break
      case 'choice':
        resolved[input.key] =
          typeof value === 'string' && input.options.includes(value)
            ? value
            : input.default
        break
      case 'source':
        resolved[input.key] =
          typeof value === 'string' &&
          (SOURCE_KEYS as ReadonlyArray<string>).includes(value)
            ? value
            : input.default
        break
    }
  }
  return resolved
}

/** The candle source the script's Context.source should expose. */
export function resolveSourceKey(
  inputs: Array<CustomIndicatorInputSpec>,
  params: Record<string, number | boolean | string>,
): string {
  const sourceInput = inputs.find((input) => input.kind === 'source')
  if (!sourceInput) return 'close'
  const value = params[sourceInput.key]
  return typeof value === 'string' ? value : 'close'
}

/** Directory the runtime writes an indicator's files to (see pairlens_sdk.py). */
const INDICATOR_DIR_RE = /\/pairlens_indicators\/[^/"]+\//g

/** Indentation of a traceback line, for grouping a frame with its source line. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * Drop the import machinery's own frames. A helper module that fails to import
 * buries the user's frame under `<frozen importlib._bootstrap>` noise.
 */
function dropFrozenFrames(lines: Array<string>): Array<string> {
  const kept: Array<string> = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!/^\s*File "<frozen /.test(line)) {
      kept.push(line)
      continue
    }
    // Skip the frame's own source lines too (indented deeper than `File`).
    const frameIndent = indentOf(line)
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim().length > 0 &&
      indentOf(lines[i + 1]) > frameIndent
    ) {
      i += 1
    }
  }
  return kept
}

/**
 * Drop pyodide-internal frames from a Python traceback so the user sees their
 * own script frames first, and rewrite helper-module paths to the file names
 * shown in the editor. Falls back to the original text when the expected
 * markers are missing.
 */
export function trimPythonTraceback(traceback: string): string {
  const lines = traceback.split('\n')
  const header = lines.findIndex((line) =>
    line.startsWith('Traceback (most recent call last):'),
  )
  if (header === -1) return traceback
  // Script frames are compiled with filename `<indicator:{id}>`.
  const firstUserFrame = lines.findIndex(
    (line, index) => index > header && line.includes('File "<indicator:'),
  )
  if (firstUserFrame === -1) return traceback
  const kept = dropFrozenFrames([
    ...lines.slice(0, header + 1),
    ...lines.slice(firstUserFrame),
  ])
  return kept.join('\n').replace(INDICATOR_DIR_RE, '')
}
