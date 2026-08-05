// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Connector conformance gate with live per-suite status.
 *
 * `bun run dev` verifies the cross-connector contract before starting the
 * terminal. Running the whole thing as one silent `bun test` made that a
 * ~13s black box, so instead we split the suite into one child `bun test`
 * per connector (plus the shared contract suites and the market engine),
 * run them concurrently, and render a live grid:
 *
 *   ·  pending    ◐  running    ✔  passed    ✖  failed    –  skipped
 *
 * Splitting is also faster in wall-clock terms — the suites are mostly
 * waiting on fake timers, so they pack well across cores.
 *
 * Usage:
 *   bun scripts/dev/conformance.ts          # standalone, exits non-zero on failure
 *   import { runConformanceGate } from './dev/conformance'
 */

import { resolve } from 'node:path'
import { Glob } from 'bun'

const REPO_ROOT = resolve(import.meta.dir, '..', '..')

// ---------------------------------------------------------------------------
// Suite discovery
// ---------------------------------------------------------------------------

export type SuiteKind = 'connector' | 'contract'

export type Suite = {
  /** Stable id, also the label shown in the grid. */
  label: string
  kind: SuiteKind
  /** Test files, repo-root-relative. */
  files: Array<string>
}

const CONNECTOR_DIR_SUFFIXES = [
  '-market-connector',
  '-dex-connector',
  '-data-provider',
]

/** Friendly labels for the shared (non per-connector) suites. */
const CONTRACT_LABELS: Record<string, string> = {
  'golden-conformance': 'golden contract',
  'order-conformance': 'order contract',
  'private-ws-conformance': 'private ws',
  'trade-parsers': 'trade parsers',
  'geo-restriction': 'geo restriction',
  'inference-sse': 'ai inference',
  'web-search': 'web search',
}

function labelForConnectorDir(dir: string): string {
  for (const suffix of CONNECTOR_DIR_SUFFIXES) {
    if (dir.endsWith(suffix)) return dir.slice(0, -suffix.length)
  }
  return dir
}

/**
 * Split `packages/plugins` + `packages/market-engine` into one suite per
 * connector, one per shared contract file, and one for the engine — the same
 * set of files `bun test packages/plugins packages/market-engine` would run.
 */
export function discoverSuites(): Array<Suite> {
  const connectors = new Map<string, Array<string>>()
  const contracts = new Map<string, Array<string>>()
  const glob = new Glob('**/*.test.ts')

  for (const rel of glob.scanSync({
    cwd: resolve(REPO_ROOT, 'packages/plugins/src'),
    onlyFiles: true,
  })) {
    const path = `packages/plugins/src/${rel.replaceAll('\\', '/')}`
    const segments = rel.replaceAll('\\', '/').split('/')
    const head = segments[0]!

    if (head === '__tests__') {
      // Shared cross-connector suites, plus the opt-in live suites.
      if (segments[1] === 'live') {
        push(contracts, 'live (opt-in)', path)
        continue
      }
      const base = segments[segments.length - 1]!.replace(/\.test\.ts$/, '')
      push(contracts, CONTRACT_LABELS[base] ?? base, path)
      continue
    }

    push(connectors, labelForConnectorDir(head), path)
  }

  for (const rel of glob.scanSync({
    cwd: resolve(REPO_ROOT, 'packages/market-engine/src'),
    onlyFiles: true,
  })) {
    push(
      contracts,
      'market engine',
      `packages/market-engine/src/${rel.replaceAll('\\', '/')}`,
    )
  }

  const byLabel = (a: Suite, b: Suite) => a.label.localeCompare(b.label)
  return [
    ...[...connectors]
      .map(([label, files]): Suite => ({ label, kind: 'connector', files }))
      .sort(byLabel),
    ...[...contracts]
      .map(([label, files]): Suite => ({ label, kind: 'contract', files }))
      .sort(byLabel),
  ]
}

/**
 * Shortest path that re-runs exactly this suite — the shared directory for a
 * multi-file suite, the file itself for a single-file one. Used in the failure
 * report so the copy-pasteable command stays readable.
 */
export function rerunTarget(suite: Suite): string {
  if (suite.files.length === 1) return suite.files[0]
  const parts = suite.files.map((f) => f.split('/'))
  const first = parts[0]
  let shared = 0
  while (
    shared < first.length - 1 &&
    parts.every((p) => p[shared] === first[shared])
  ) {
    shared++
  }
  return first.slice(0, shared).join('/')
}

function push(map: Map<string, Array<string>>, key: string, value: string) {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export type SuiteStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'

export type SuiteResult = {
  suite: Suite
  status: SuiteStatus
  pass: number
  fail: number
  skip: number
  durationMs: number
  /** Combined stdout+stderr, kept so failures can be shown in full. */
  output: string
}

const COUNT_RE = (word: string) => new RegExp(`^\\s*(\\d+)\\s+${word}\\b`, 'm')

function parseCount(output: string, word: string): number {
  const m = COUNT_RE(word).exec(output)
  return m ? Number(m[1]) : 0
}

async function runSuite(suite: Suite): Promise<SuiteResult> {
  const startedAt = Date.now()
  const proc = Bun.spawn(['bun', 'test', ...suite.files], {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const output = `${stdout}${stderr}`
  const pass = parseCount(output, 'pass')
  const fail = parseCount(output, 'fail')
  const skip = parseCount(output, 'skip')

  const status: SuiteStatus =
    exitCode !== 0 || fail > 0
      ? 'failed'
      : pass === 0 && skip > 0
        ? 'skipped'
        : 'passed'

  return {
    suite,
    status,
    pass,
    fail,
    skip,
    durationMs: Date.now() - startedAt,
    output,
  }
}

/** Run `items` through `run` with at most `limit` in flight at any moment. */
async function mapWithLimit<T>(
  items: Array<T>,
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const item = items[next++]
        await run(item)
      }
    })(),
  )
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const CELL_W = 24

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function marker(status: SuiteStatus, frame: number): string {
  switch (status) {
    case 'pending':
      return `${DIM}·${RESET}`
    case 'running':
      return `${CYAN}${SPINNER[frame % SPINNER.length]}${RESET}`
    case 'passed':
      return `${GREEN}✔${RESET}`
    case 'failed':
      return `${RED}✖${RESET}`
    case 'skipped':
      return `${DIM}–${RESET}`
  }
}

function cell(
  suite: Suite,
  state: SuiteResult | undefined,
  status: SuiteStatus,
  frame: number,
): string {
  const icon = marker(status, frame)
  const name =
    status === 'pending'
      ? `${DIM}${suite.label}${RESET}`
      : status === 'failed'
        ? `${RED}${suite.label}${RESET}`
        : suite.label
  const detail = !state
    ? ''
    : status === 'failed'
      ? `${state.fail || 1} failed`
      : status === 'skipped'
        ? 'skipped'
        : `${state.pass}`
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : ''
  const text = `${icon} ${name}${suffix}`
  return text + ' '.repeat(Math.max(1, CELL_W - visibleWidth(text)))
}

// eslint-disable-next-line no-control-regex -- \x1b is the ANSI escape byte; stripping color codes is the point
const ANSI_RE = /\x1b\[[0-9;]*m/g

function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, '').length
}

type Renderer = {
  update: () => void
  finish: () => void
}

function createGridRenderer(
  suites: Array<Suite>,
  statusOf: (suite: Suite) => SuiteStatus,
  resultOf: (suite: Suite) => SuiteResult | undefined,
): Renderer {
  const isTty = Boolean(process.stdout.isTTY)
  // `columns` is 0 on some pseudo-terminals, so fall back rather than divide it.
  const width = process.stdout.columns || 80
  const columns = Math.max(1, Math.min(3, Math.floor((width - 4) / CELL_W)))
  let frame = 0
  let printedLines = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const build = (): Array<string> => {
    const lines: Array<string> = []
    for (const kind of ['connector', 'contract'] as const) {
      const group = suites.filter((s) => s.kind === kind)
      if (group.length === 0) continue
      lines.push(
        `  ${DIM}${kind === 'connector' ? 'connectors' : 'contracts & engine'}${RESET}`,
      )
      for (let i = 0; i < group.length; i += columns) {
        lines.push(
          '  ' +
            group
              .slice(i, i + columns)
              .map((s) => cell(s, resultOf(s), statusOf(s), frame))
              .join('')
              .trimEnd(),
        )
      }
    }
    return lines
  }

  const paint = () => {
    const lines = build()
    if (printedLines > 0) process.stdout.write(`\x1b[${printedLines}A`)
    for (const line of lines) process.stdout.write(`\x1b[2K${line}\n`)
    // The grid never shrinks, so no leftover rows to clear.
    printedLines = lines.length
  }

  const showCursor = () => {
    process.stdout.write('\x1b[?25h')
  }
  // A SIGINT listener suppresses the default exit, so this one has to exit too.
  const onSigint = () => {
    showCursor()
    process.exit(130)
  }

  if (isTty) {
    process.stdout.write('\x1b[?25l') // hide cursor
    // Ctrl+C during the gate must not leave the user's shell cursorless.
    process.once('SIGINT', onSigint)
    process.once('exit', showCursor)
    paint()
    timer = setInterval(() => {
      frame++
      paint()
    }, 90)
    timer.unref?.()
  } else {
    // Non-TTY (CI, piped logs): announce the full plan once, then one line
    // per suite as it settles — see `logSettled` below.
    for (const kind of ['connector', 'contract'] as const) {
      const group = suites.filter((s) => s.kind === kind)
      if (group.length === 0) continue
      console.info(
        `  ${DIM}${kind === 'connector' ? 'connectors' : 'contracts & engine'}:${RESET} ${group
          .map((s) => s.label)
          .join(', ')}`,
      )
    }
  }

  return {
    update: () => {
      if (isTty) paint()
    },
    finish: () => {
      if (!isTty) return
      clearInterval(timer)
      paint()
      showCursor()
      process.off('SIGINT', onSigint)
      process.off('exit', showCursor)
    },
  }
}

function logSettled(result: SuiteResult): void {
  if (process.stdout.isTTY) return
  const tag =
    result.status === 'failed'
      ? `${RED}FAIL${RESET}`
      : result.status === 'skipped'
        ? `${DIM}SKIP${RESET}`
        : `${GREEN}OK${RESET}`
  console.info(
    `  ${tag} ${result.suite.label} ${DIM}(${result.pass} pass, ${result.fail} fail, ${result.skip} skip, ${fmtDuration(result.durationMs)})${RESET}`,
  )
}

/** Trim a failed suite's output to the part worth reading in the dev log. */
function failureExcerpt(output: string, maxLines = 40): string {
  const lines = output.trimEnd().split('\n')
  const excerpt = lines.length > maxLines ? lines.slice(-maxLines) : lines
  return excerpt.map((l) => `    ${DIM}│${RESET} ${l}`).join('\n')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type ConformanceReport = {
  ok: boolean
  results: Array<SuiteResult>
  totals: { pass: number; fail: number; skip: number }
  durationMs: number
}

export async function runConformanceGate(): Promise<ConformanceReport> {
  const suites = discoverSuites()
  const statuses = new Map<string, SuiteStatus>(
    suites.map((s) => [s.label, 'pending' as SuiteStatus]),
  )
  const results = new Map<string, SuiteResult>()
  const startedAt = Date.now()

  console.info(
    `  ${DIM}[1/2]${RESET} Verifying connector conformance ${DIM}(${suites.length} suites)${RESET}`,
  )

  const renderer = createGridRenderer(
    suites,
    (s) => statuses.get(s.label) ?? 'pending',
    (s) => results.get(s.label),
  )

  const concurrency = Math.max(
    2,
    Math.min(10, (navigator.hardwareConcurrency || 4) - 1),
  )

  await mapWithLimit(suites, concurrency, async (suite) => {
    statuses.set(suite.label, 'running')
    renderer.update()
    const result = await runSuite(suite)
    statuses.set(suite.label, result.status)
    results.set(suite.label, result)
    renderer.update()
    logSettled(result)
  })

  renderer.finish()

  const ordered = suites.map((s) => results.get(s.label)!).filter(Boolean)
  const totals = ordered.reduce(
    (acc, r) => ({
      pass: acc.pass + r.pass,
      fail: acc.fail + r.fail,
      skip: acc.skip + r.skip,
    }),
    { pass: 0, fail: 0, skip: 0 },
  )
  const failed = ordered.filter((r) => r.status === 'failed')
  const durationMs = Date.now() - startedAt

  console.info('')
  if (failed.length === 0) {
    console.info(
      `  ${DIM}[1/2]${RESET} ${GREEN}Connector conformance OK${RESET} ${DIM}${totals.pass} tests${totals.skip ? `, ${totals.skip} skipped` : ''} across ${suites.length} suites in ${fmtDuration(durationMs)}${RESET}`,
    )
  } else {
    console.info(
      `  ${BOLD}${YELLOW}⚠  CONNECTOR CONFORMANCE FAILED${RESET} ${DIM}(${failed.length} of ${suites.length} suites)${RESET}`,
    )
    console.info(
      `  ${YELLOW}   The market-data/order contract is broken — the UI may receive${RESET}`,
    )
    console.info(`  ${YELLOW}   inconsistent data across connectors.${RESET}`)
    for (const result of failed) {
      console.info('')
      console.info(
        `  ${RED}✖ ${result.suite.label}${RESET} ${DIM}${rerunTarget(result.suite)}${RESET}`,
      )
      console.info(failureExcerpt(result.output))
    }
    console.info('')
    console.info(
      `  ${DIM}   Re-run one suite with: bun test ${rerunTarget(failed[0].suite)}${RESET}`,
    )
  }
  console.info('')

  return { ok: failed.length === 0, results: ordered, totals, durationMs }
}

if (import.meta.main) {
  const report = await runConformanceGate()
  process.exit(report.ok ? 0 : 1)
}
