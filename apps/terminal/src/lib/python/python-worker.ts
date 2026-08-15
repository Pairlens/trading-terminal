// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/// <reference lib="webworker" />
/**
 * Pyodide worker — boots the Python runtime, registers the `pairlens` SDK
 * module, and services register/compute calls over postMessage.
 *
 * Spawned inline from a Blob (`?worker&inline`, see python-runtime.ts) so it
 * inherits the document CSP. The pyodide core assets (pyodide.asm.mjs, wasm,
 * stdlib, lockfile) are served same-origin from /_pyodide/ (copied from the
 * npm package by apps/terminal/scripts/copy-pyodide.ts); compiled scientific
 * packages (numpy, pandas, ...) are not shipped in the npm package, so
 * `packageBaseUrl` points package downloads at the official jsDelivr CDN for
 * this exact pyodide version. Pure-python wheels come from PyPI via micropip.
 *
 * The host serializes requests (one in flight at a time), so handlers here
 * can assume no interleaving beyond the background numpy preload.
 */
import { loadPyodide, version as pyodideVersion } from 'pyodide'

import { alignOutputs } from './align'
import { KNOWN_IMPORT_DISTS } from './libraries'
import {
  parseIndicatorMeta,
  resolveParams,
  resolveSourceKey,
  trimPythonTraceback,
} from './meta'
import { outputTransferables } from './protocol'
import pairlensSdkSource from './pairlens_sdk.py?raw'
import pairlensTaSource from './pairlens_ta.py?raw'
import type {
  CustomIndicatorMeta,
  CustomIndicatorModule,
} from '@pairlens/shared/plugin-types'
import type {
  CandleArrays,
  HostToPythonMessage,
  PythonLogLevel,
  PythonToHostMessage,
  RequestSeries,
} from './protocol'
import { installNetworkGuard } from '@/lib/plugins/sandbox/network-guard'

/**
 * Everything the runtime itself reaches for, and nothing else.
 *
 * This worker evaluates code the user did not necessarily write: the
 * `chart:indicator` capability lets an installed plugin contribute Python
 * scripts, and a script exported from the workbench travels as a plugin zip.
 * Pyodide hands that code the JS globals through its `js` module, so
 * `js.fetch(...)` from Python is an ordinary call — and until this guard the
 * worker had none installed, while the plugin sandbox next door strips storage
 * globals and enforces a per-plugin allowlist.
 *
 * The document CSP is not a substitute here, and it is worth being precise
 * about why: `connect-src` is one list for the whole webview, so it already
 * contains every exchange, the App Server, the AI providers and Telegram. It
 * bounds the app; it cannot bound one worker inside it. This list can.
 *
 * `self.location.hostname` is the terminal's own origin, needed for the
 * pyodide core assets under `/_pyodide/`. The other three are where compiled
 * wheels and pure-Python wheels come from, and they are the same three the
 * desktop CSP baseline carries for exactly this reason.
 */
const PYTHON_RUNTIME_HOSTS: ReadonlyArray<string> = Object.freeze([
  self.location.hostname,
  'cdn.jsdelivr.net',
  'pypi.org',
  'files.pythonhosted.org',
])

// Before `loadPyodide`, and before any Python is evaluated: a guard installed
// afterwards is a guard the first script can race.
installNetworkGuard(
  self as unknown as typeof globalThis,
  { hosts: PYTHON_RUNTIME_HOSTS },
  'Python indicators may only reach the package registries the runtime ' +
    'installs from. There is no way to widen this from a script.',
)

type Pyodide = Awaited<ReturnType<typeof loadPyodide>>

/** Minimal typings for the PyProxy surfaces this worker touches. */
type PyProxyDict = Iterable<string> & {
  get: (key: string) => unknown
  toJs: (options: {
    dict_converter: typeof Object.fromEntries
    create_pyproxies: boolean
  }) => unknown
  destroy: () => void
}

type PyBufferProxy = {
  getBuffer: (type: string) => { data: Float64Array; release: () => void }
  destroy: () => void
}

type SdkModule = {
  _register_script: (
    scriptId: string,
    source: string,
    /** {path: source} of the script's helper modules; a PyProxy dict. */
    modules: unknown,
  ) => PyProxyDict
  _compute: (
    scriptId: string,
    candles: CandleArrays,
    params: unknown,
    pair: string,
    timeframe: string,
    sourceKey: string,
    /** Extra `request.security(...)` series; a JS array read as a JsProxy. */
    extra: Array<RequestSeries>,
  ) => PyProxyDict
  /** Palettes built by the last _compute; draining clears them. */
  _take_palettes: () => PyProxyDict
  /** Reformat source with black (the host installs it first). */
  _format_source: (source: string) => string
  _dispose_script: (scriptId: string) => void
}

let pyodide: Pyodide | null = null
let sdk: SdkModule | null = null
/** Kicked off during init so numpy is (usually) warm before the first script. */
let numpyPreload: Promise<void> | null = null
let micropipReady: Promise<{
  install: (reqs: unknown) => Promise<void>
}> | null = null
const scripts = new Map<string, CustomIndicatorMeta>()
/** Script currently executing — tags its stdout/stderr lines for the UI. */
let activeScriptId: string | null = null

function post(
  message: PythonToHostMessage,
  transfer?: Array<ArrayBuffer>,
): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, transfer)
  } else {
    self.postMessage(message)
  }
}

/** Severities `log.*` can stamp on a line (see `_Log` in the SDK). */
const LOG_LEVELS = new Set<PythonLogLevel>(['info', 'warning', 'error'])

/**
 * Forward one stdout/stderr line to the host's console panel. `log.info(...)`
 * and friends wrap the severity in \x01 sentinels; bare print() has none and
 * keeps its stream as the level.
 */
function postLog(level: 'stdout' | 'stderr', text: string): void {
  let resolved: PythonLogLevel = level
  let body = text
  if (text.startsWith('\x01')) {
    const end = text.indexOf('\x01', 1)
    const tagged = end > 1 ? (text.slice(1, end) as PythonLogLevel) : null
    if (tagged && LOG_LEVELS.has(tagged)) {
      resolved = tagged
      body = text.slice(end + 1)
    }
  }
  post({
    type: 'log',
    level: resolved,
    text: body,
    ...(activeScriptId !== null ? { scriptId: activeScriptId } : {}),
  })
}

/** Run `fn` with `scriptId` marked active so its output is attributable. */
function withActiveScript<T>(scriptId: string, fn: () => T): T {
  const previous = activeScriptId
  activeScriptId = scriptId
  try {
    return fn()
  } finally {
    activeScriptId = previous
  }
}

function errorPayload(err: unknown): { error: string; traceback?: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (!message.includes('Traceback (most recent call last):')) {
    return { error: message }
  }
  const traceback = trimPythonTraceback(message)
  const lines = traceback.trimEnd().split('\n')
  return { error: lines[lines.length - 1].trim(), traceback }
}

/** `ModuleNotFoundError: No module named 'x'` → `x` (top-level dist name). */
function missingModuleName(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/ModuleNotFoundError: No module named '([^.']+)/)
  return match ? match[1] : null
}

async function ensurePyodide(indexURL: string): Promise<Pyodide> {
  if (pyodide) return pyodide
  const py = await loadPyodide({
    indexURL,
    // Compiled wheels are not hosted on our origin; resolve the lockfile's
    // relative file names against the official CDN for this pyodide version.
    packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
    // print() and friends stream to the editor's console panel — the only
    // way to debug a script that runs off the main thread.
    stdout: (text: string) => postLog('stdout', text),
    stderr: (text: string) => postLog('stderr', text),
  })
  // Install the pairlens SDK as an importable package: `pairlens` is the
  // declaration API and `pairlens.ta` the indicator standard library, so
  // `from pairlens.ta import ema` resolves like any installed package.
  const sitePackages = py.runPython(
    "import sysconfig; sysconfig.get_paths()['purelib']",
  ) as string
  py.FS.mkdirTree(`${sitePackages}/pairlens`)
  py.FS.writeFile(`${sitePackages}/pairlens/__init__.py`, pairlensSdkSource)
  py.FS.writeFile(`${sitePackages}/pairlens/ta.py`, pairlensTaSource)
  sdk = py.pyimport('pairlens') as SdkModule
  // Warm numpy in the background — nearly every script wants it. Failure is
  // non-fatal (offline desktop): the SDK degrades to plain python lists.
  numpyPreload = py.loadPackage('numpy').then(
    () => undefined,
    () => undefined,
  )
  pyodide = py
  return py
}

function requirePyodide(): { py: Pyodide; mod: SdkModule } {
  if (!pyodide || !sdk) {
    throw new Error('Python runtime not initialized')
  }
  return { py: pyodide, mod: sdk }
}

async function getMicropip(py: Pyodide): Promise<{
  install: (reqs: unknown) => Promise<void>
}> {
  micropipReady ??= (async () => {
    await py.loadPackage('micropip')
    return py.pyimport('micropip') as {
      install: (reqs: unknown) => Promise<void>
    }
  })()
  return micropipReady
}

async function installRequirements(
  py: Pyodide,
  requirements: Array<string>,
): Promise<void> {
  if (requirements.length === 0) return
  await numpyPreload
  const micropip = await getMicropip(py)
  const reqsPy = py.toPy(requirements) as { destroy: () => void }
  try {
    await micropip.install(reqsPy)
  } catch (err) {
    throw friendlyInstallError(err, requirements)
  } finally {
    reqsPy.destroy()
  }
}

/**
 * Translate micropip's failure modes into something a script author can act
 * on. The stock messages assume the reader knows what a wheel tag is; ours
 * name the boundary that actually matters here — only packages built into
 * the runtime or shipped as pure-Python wheels can install, because there is
 * no compiler in the browser.
 */
function friendlyInstallError(
  err: unknown,
  requirements: Array<string>,
): Error {
  const message = err instanceof Error ? err.message : String(err)
  const named = requirements.join(', ')
  if (/pure python 3 wheel/i.test(message)) {
    return new Error(
      `'${named}' ships compiled code and is not part of the Python runtime, ` +
        `so it cannot be installed. Only packages built into the runtime ` +
        `(see the Libraries catalog in the editor) or pure-Python wheels ` +
        `from PyPI are available.`,
    )
  }
  if (/can't fetch metadata|no known package/i.test(message)) {
    return new Error(
      `Could not resolve '${named}' on PyPI. Check the spelling — the name ` +
        `in packages=[...] must be the PyPI distribution name (for example ` +
        `'scikit-learn', not 'sklearn').`,
    )
  }
  return err instanceof Error ? err : new Error(message)
}

/**
 * Reformat Python source with black, installed from PyPI on first use.
 *
 * black is pure Python, so micropip can pull it and its dependencies at
 * runtime rather than us shipping a formatter nobody may ever press. The
 * whole thing is best-effort: a script black refuses to parse comes back as
 * a plain error and the editor leaves the buffer untouched.
 */
let blackInstalled: Promise<void> | null = null

async function handleFormat(id: number, source: string): Promise<void> {
  const { py, mod } = requirePyodide()
  blackInstalled ??= installRequirements(py, ['black'])
  try {
    await blackInstalled
  } catch (err) {
    // Let a failed install be retried rather than poisoning every attempt.
    blackInstalled = null
    throw err
  }
  post({ type: 'formatted', id, source: mod._format_source(source) })
}

/** Top-level module names a script's own files provide (`helpers.py` → `helpers`). */
function ownModuleNames(modules: Array<CustomIndicatorModule>): Set<string> {
  const names = new Set<string>(['main'])
  for (const module of modules) {
    const head = module.path.split('/')[0]
    names.add(head.endsWith('.py') ? head.slice(0, -3) : head)
  }
  return names
}

async function handleRegister(
  id: number,
  scriptId: string,
  source: string,
  modules: Array<CustomIndicatorModule>,
): Promise<void> {
  const { py, mod } = requirePyodide()
  await numpyPreload
  // Pull in any pyodide-built packages the script imports at module level —
  // helper modules import their own dependencies, so scan them all.
  const allSources = [source, ...modules.map((m) => m.source)].join('\n')
  await py.loadPackagesFromImports(allSources).catch(() => undefined)

  const moduleMap: Record<string, string> = {}
  for (const module of modules) moduleMap[module.path] = module.source

  const register = (): PyProxyDict =>
    withActiveScript(scriptId, () => {
      const modulesPy = py.toPy(moduleMap) as { destroy: () => void }
      try {
        return mod._register_script(scriptId, source, modulesPy)
      } finally {
        modulesPy.destroy()
      }
    })

  let metaProxy: PyProxyDict
  try {
    metaProxy = register()
  } catch (err) {
    // Second chance for pure-python PyPI imports: micropip-install the
    // missing module and retry once. A missing module the script itself was
    // supposed to provide is a typo, not a dependency — don't ask PyPI.
    // Import names that famously differ from their distribution are mapped
    // first (`dotenv` → `python-dotenv`), because installing the bare module
    // name would miss — or, for `sklearn`, hit a tombstone dist.
    const missing = missingModuleName(err)
    if (!missing || ownModuleNames(modules).has(missing)) throw err
    await installRequirements(py, [KNOWN_IMPORT_DISTS[missing] ?? missing])
    metaProxy = register()
  }
  const rawMeta = metaProxy.toJs({
    dict_converter: Object.fromEntries,
    create_pyproxies: false,
  })
  metaProxy.destroy()
  const meta = parseIndicatorMeta(rawMeta, scriptId)
  if (meta.packages && meta.packages.length > 0) {
    await installRequirements(py, meta.packages)
  }
  scripts.set(scriptId, meta)
  post({ type: 'registered', id, meta })
}

/** Drain the palettes the SDK folded per-bar colors into, as plain JSON. */
function takePalettes(mod: SdkModule): Record<string, Array<string>> {
  const proxy = mod._take_palettes()
  try {
    return proxy.toJs({
      dict_converter: Object.fromEntries,
      create_pyproxies: false,
    }) as Record<string, Array<string>>
  } finally {
    proxy.destroy()
  }
}

function handleCompute(
  id: number,
  scriptId: string,
  candles: CandleArrays,
  userParams: Record<string, unknown>,
  pair: string,
  timeframe: string,
  requestData: Array<RequestSeries>,
): void {
  const { py, mod } = requirePyodide()
  const meta = scripts.get(scriptId)
  if (!meta) {
    throw new Error(`Script '${scriptId}' is not registered`)
  }
  const params = resolveParams(meta.inputs, userParams)
  const sourceKey = resolveSourceKey(meta.inputs, params)
  const paramsPy = py.toPy(params) as { destroy: () => void }
  const startedAt = performance.now()
  let resultProxy: PyProxyDict
  try {
    resultProxy = withActiveScript(scriptId, () =>
      // Always an array, never null: JS `null` reaches Python as JsNull, which
      // is neither None nor iterable.
      mod._compute(
        scriptId,
        candles,
        paramsPy,
        pair,
        timeframe,
        sourceKey,
        requestData,
      ),
    )
  } finally {
    paramsPy.destroy()
  }
  const raw: Record<string, Float64Array | number> = {}
  try {
    for (const key of resultProxy) {
      const value = resultProxy.get(key)
      if (typeof value === 'number') {
        raw[key] = value
      } else {
        // Buffer-protocol object (numpy float64 array / array('d')).
        const proxy = value as PyBufferProxy
        const view = proxy.getBuffer('f64')
        try {
          raw[key] = view.data.slice()
        } finally {
          view.release()
          proxy.destroy()
        }
      }
    }
  } finally {
    resultProxy.destroy()
  }
  const palettes = takePalettes(mod)
  const durationMs = performance.now() - startedAt
  const outputs = alignOutputs(raw, candles.close.length)
  post(
    { type: 'computed', id, outputs, palettes, durationMs },
    outputTransferables(outputs),
  )
}

async function handle(msg: HostToPythonMessage): Promise<void> {
  try {
    switch (msg.type) {
      case 'init': {
        await ensurePyodide(msg.indexURL)
        post({ type: 'ready', id: msg.id })
        break
      }
      case 'install-packages': {
        const { py } = requirePyodide()
        await installRequirements(py, msg.requirements)
        post({ type: 'installed', id: msg.id })
        break
      }
      case 'register-script': {
        await handleRegister(
          msg.id,
          msg.scriptId,
          msg.source,
          msg.modules ?? [],
        )
        break
      }
      case 'compute': {
        handleCompute(
          msg.id,
          msg.scriptId,
          msg.candles,
          msg.params,
          msg.pair,
          msg.timeframe,
          msg.requestData ?? [],
        )
        break
      }
      case 'format-code': {
        await handleFormat(msg.id, msg.source)
        break
      }
      case 'dispose-script': {
        const { mod } = requirePyodide()
        mod._dispose_script(msg.scriptId)
        scripts.delete(msg.scriptId)
        post({ type: 'disposed', id: msg.id })
        break
      }
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, ...errorPayload(err) })
  }
}

self.onmessage = (event: MessageEvent<HostToPythonMessage>) => {
  void handle(event.data)
}
