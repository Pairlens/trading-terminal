// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What Python libraries a script can use, and where they come from.
 *
 * Three tiers, from most to least guaranteed:
 *
 * 1. Preloaded — numpy. Warmed during runtime boot; import it, nothing to
 *    declare.
 * 2. Runtime-built — every package compiled for this exact Pyodide build
 *    (pandas, scipy, scikit-learn, ...). Enumerated from the runtime's own
 *    lockfile, served same-origin at /_pyodide/pyodide-lock.json, so the
 *    catalog can never drift from what actually installs.
 * 3. Pure-Python PyPI — any wheel tagged `py3-none-any`, pulled by micropip.
 *    This tier is open by design: scripts run locally in the user's own
 *    sandboxed worker (browser and desktop alike), so there is no server to
 *    protect and nothing to vet. Compiled packages outside tier 2 are the one
 *    hard limit — there is no C toolchain in the runtime.
 *
 * A module-level `import x` resolves tiers 1–2 automatically at registration;
 * tier 3 resolves through the install-and-retry path or an explicit
 * `packages=[...]` declaration (which is also how versions are pinned).
 */

/** One package of the Pyodide distribution, as listed in its lockfile. */
export type RuntimePackage = {
  /** Distribution name (`scikit-learn`). */
  name: string
  /** Version this runtime build ships. */
  version: string
  /** Top-level importable modules (`sklearn`). */
  imports: Array<string>
}

/**
 * Import name → PyPI distribution name, for packages whose module is not
 * named after its distribution. The install-and-retry path in the worker sees
 * only the failing module name; installing that name verbatim would either
 * miss (`dotenv`) or hit a tombstone dist that fails on purpose (`sklearn`).
 * Runtime-built packages normally resolve from the lockfile before this table
 * is consulted — these entries also cover them for the offline-then-online
 * edge where that first resolution pass was skipped.
 */
export const KNOWN_IMPORT_DISTS: Record<string, string> = {
  sklearn: 'scikit-learn',
  cv2: 'opencv-python',
  PIL: 'pillow',
  yaml: 'pyyaml',
  bs4: 'beautifulsoup4',
  dateutil: 'python-dateutil',
  dotenv: 'python-dotenv',
  websocket: 'websocket-client',
  jose: 'python-jose',
  binance: 'python-binance',
}

/** Where a curated library installs from. */
export type CuratedSource = 'preloaded' | 'runtime' | 'pypi'

/** A hand-picked library worth surfacing above the full runtime list. */
export type CuratedLibrary = {
  /** Distribution name, as it appears in `packages=[...]`. */
  dist: string
  /** Top-level module scripts import, when it differs from `dist`. */
  module?: string
  source: CuratedSource
  /** One line on why a trading script would reach for it. */
  blurb: string
}

/**
 * The shortlist shown before any search: libraries a trading script actually
 * reaches for, each known to work in this runtime. Ordering is rough
 * usefulness, not alphabet. Blurbs are English-only, matching the SDK
 * reference entries.
 */
export const CURATED_LIBRARIES: Array<CuratedLibrary> = [
  {
    dist: 'numpy',
    source: 'preloaded',
    blurb:
      'Array math over the candle series. Preloaded — every ctx column already is a numpy array.',
  },
  {
    dist: 'pandas',
    source: 'runtime',
    blurb:
      'DataFrames, resampling, rolling windows. The lingua franca of offline research notebooks.',
  },
  {
    dist: 'scipy',
    source: 'runtime',
    blurb:
      'Signal processing, statistics, optimization — savgol filters, peak finding, curve fits.',
  },
  {
    dist: 'scikit-learn',
    module: 'sklearn',
    source: 'runtime',
    blurb:
      'Classic machine learning: regressions, clustering, classifiers over engineered features.',
  },
  {
    dist: 'statsmodels',
    source: 'runtime',
    blurb:
      'Econometrics: ARIMA, cointegration tests, GARCH-adjacent models, OLS with real diagnostics.',
  },
  {
    dist: 'polars',
    source: 'runtime',
    blurb: 'Columnar DataFrames, much faster than pandas on large windows.',
  },
  {
    dist: 'ta',
    source: 'pypi',
    blurb:
      'Pure-Python technical analysis library — dozens of indicators beyond pairlens.ta.',
  },
  {
    dist: 'pandas-ta',
    module: 'pandas_ta',
    source: 'pypi',
    blurb:
      'Technical analysis as pandas DataFrame extensions, 130+ indicators.',
  },
  {
    dist: 'sympy',
    source: 'runtime',
    blurb:
      'Symbolic math — derive and simplify formulas before evaluating them.',
  },
  {
    dist: 'networkx',
    source: 'runtime',
    blurb:
      'Graphs and network analysis, e.g. correlation networks across pairs.',
  },
]

/** `import x` line for a curated entry — what the Insert button types. */
export function curatedImportSnippet(library: CuratedLibrary): string {
  return `import ${library.module ?? library.dist}`
}

/**
 * Parse a pyodide lockfile into the browsable package list. Entries that are
 * not real installable packages are dropped: shared libraries (linked, never
 * imported) and the unvendored `*-tests` companions.
 */
export function parseRuntimePackages(lock: unknown): Array<RuntimePackage> {
  if (typeof lock !== 'object' || lock === null) return []
  const packages = (lock as { packages?: unknown }).packages
  if (typeof packages !== 'object' || packages === null) return []
  const result: Array<RuntimePackage> = []
  for (const value of Object.values(packages)) {
    if (typeof value !== 'object' || value === null) continue
    const entry = value as {
      name?: unknown
      version?: unknown
      imports?: unknown
      package_type?: unknown
    }
    if (typeof entry.name !== 'string' || typeof entry.version !== 'string') {
      continue
    }
    if (entry.package_type !== 'package') continue
    if (entry.name.endsWith('-tests')) continue
    const imports = Array.isArray(entry.imports)
      ? entry.imports.filter((i): i is string => typeof i === 'string')
      : []
    result.push({ name: entry.name, version: entry.version, imports })
  }
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

let runtimePackagesPromise: Promise<Array<RuntimePackage>> | null = null

/**
 * The full runtime-built package list, fetched once from the same lockfile
 * the Python worker boots from. A failed fetch is forgotten so a transient
 * network error does not pin the catalog empty for the session.
 */
export function fetchRuntimePackages(): Promise<Array<RuntimePackage>> {
  runtimePackagesPromise ??= fetch('/_pyodide/pyodide-lock.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`pyodide-lock.json: HTTP ${response.status}`)
      }
      return response.json()
    })
    .then(parseRuntimePackages)
    .catch((err: unknown) => {
      runtimePackagesPromise = null
      throw err instanceof Error ? err : new Error(String(err))
    })
  return runtimePackagesPromise
}
