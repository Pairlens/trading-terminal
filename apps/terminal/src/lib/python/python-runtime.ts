// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Host side of the local Python indicator runtime: lazily spawns the Pyodide
 * worker, correlates request/response messages, and serializes calls (one
 * compute at a time). A hung worker (Python is synchronous — a busy loop
 * blocks its message loop) is terminated on timeout and respawned on the next
 * call; registered scripts are re-registered transparently from their kept
 * sources.
 */
import { candleTransferables } from './protocol'
import type {
  CustomIndicatorMeta,
  CustomIndicatorModule,
} from '@pairlens/shared/plugin-types'
import type {
  CandleArrays,
  HostToPythonMessage,
  PythonLogMessage,
  PythonToHostMessage,
  RequestSeries,
} from './protocol'

export type {
  CandleArrays,
  CustomIndicatorModule,
  PythonLogMessage,
  RequestSeries,
}

/** Everything one compute() call produced. */
export type PythonComputeResult = {
  /** One array per output key, aligned to the input candles. */
  outputs: Record<string, Float64Array>
  /** Palettes that `<key>:c` index arrays refer to. */
  palettes: Record<string, Array<string>>
  /** How long the Python call itself took. */
  durationMs: number
}

export type PythonRuntimeStatus =
  | 'idle'
  | 'booting'
  | 'ready'
  | 'installing'
  | 'error'

/** Error raised for failures inside script code; carries the Python traceback. */
export class PythonScriptError extends Error {
  readonly traceback?: string

  constructor(message: string, traceback?: string) {
    super(message)
    this.name = 'PythonScriptError'
    this.traceback = traceback
  }
}

const INIT_TIMEOUT_MS = 60_000
const INSTALL_TIMEOUT_MS = 60_000
// Registration may download numpy/micropip wheels on first use.
const REGISTER_TIMEOUT_MS = 60_000
const COMPUTE_TIMEOUT_MS = 10_000

/**
 * Lazily import the inlined worker constructor. Kept out of module top-level
 * so the SSR pass never evaluates Vite's `?worker&inline` transform — the
 * runtime only ever boots in the browser. Vite bundles the worker + its
 * imports and inlines it as a Blob URL, so the worker inherits the document
 * CSP (same pattern as the plugin sandbox worker).
 */
async function getPythonWorkerCtor(): Promise<
  new (options?: WorkerOptions) => Worker
> {
  const mod = await import('./python-worker?worker&inline')
  return mod.default
}

type Pending = {
  resolve: (msg: PythonToHostMessage) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class PythonRuntime {
  private worker: Worker | null = null
  private initPromise: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private queue: Promise<unknown> = Promise.resolve()
  private currentStatus: PythonRuntimeStatus = 'idle'
  private readonly listeners = new Set<(status: PythonRuntimeStatus) => void>()
  private readonly logListeners = new Set<(log: PythonLogMessage) => void>()
  /** Kept sources so scripts survive a terminate+respawn cycle. */
  private readonly sources = new Map<
    string,
    { source: string; modules: Array<CustomIndicatorModule> }
  >()
  /** Script ids registered in the CURRENT worker instance. */
  private readonly registered = new Set<string>()
  private disposed = false

  get status(): PythonRuntimeStatus {
    return this.currentStatus
  }

  subscribe(listener: (status: PythonRuntimeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Listen to everything scripts write to stdout/stderr. Lines arrive as the
   * Python call runs, tagged with the script that produced them.
   */
  subscribeLogs(listener: (log: PythonLogMessage) => void): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  /** Boot the worker + pyodide if needed. Resolves when the runtime is ready. */
  ensureReady(): Promise<void> {
    return this.enqueue(() => this.spawnIfNeeded())
  }

  installPackages(requirements: Array<string>): Promise<void> {
    return this.enqueue(async () => {
      await this.spawnIfNeeded()
      this.setStatus('installing')
      try {
        await this.request(
          { type: 'install-packages', id: 0, requirements },
          INSTALL_TIMEOUT_MS,
        )
      } finally {
        if (this.worker) this.setStatus('ready')
      }
    })
  }

  /**
   * Register (or re-register) a script. `modules` are helper files written
   * next to the entry so the script can `import` them.
   */
  registerScript(
    id: string,
    source: string,
    modules: Array<CustomIndicatorModule> = [],
  ): Promise<CustomIndicatorMeta> {
    return this.enqueue(async () => {
      await this.spawnIfNeeded()
      // Registration can pull wheels (numpy, meta.packages) on first use.
      this.setStatus('installing')
      try {
        const meta = await this.sendRegister(id, source, modules)
        this.sources.set(id, { source, modules })
        return meta
      } finally {
        if (this.worker) this.setStatus('ready')
      }
    })
  }

  /**
   * Run a script's compute() over a candle window. NOTE: the candle buffers
   * (including any `requestData` series) are TRANSFERRED to the worker — the
   * caller's arrays are detached after this call. Pass freshly-built arrays.
   */
  compute(
    id: string,
    candles: CandleArrays,
    params: Record<string, unknown>,
    pair: string,
    timeframe: string,
    requestData: Array<RequestSeries> = [],
  ): Promise<PythonComputeResult> {
    return this.enqueue(async () => {
      await this.spawnIfNeeded()
      // Transparent re-registration after a respawn.
      if (!this.registered.has(id)) {
        const kept = this.sources.get(id)
        if (kept === undefined) {
          throw new PythonScriptError(`Script '${id}' is not registered`)
        }
        await this.sendRegister(id, kept.source, kept.modules)
      }
      const transfer = candleTransferables(candles)
      for (const series of requestData) {
        transfer.push(...candleTransferables(series.candles))
      }
      const response = await this.request(
        {
          type: 'compute',
          id: 0,
          scriptId: id,
          candles,
          params,
          pair,
          timeframe,
          requestData,
        },
        COMPUTE_TIMEOUT_MS,
        transfer,
      )
      if (response.type !== 'computed') {
        throw new PythonScriptError(`Unexpected response '${response.type}'`)
      }
      return {
        outputs: response.outputs,
        palettes: response.palettes ?? {},
        durationMs: response.durationMs ?? 0,
      }
    })
  }

  /**
   * Reformat Python source. The first call downloads the formatter, so this
   * is slow once and fast after; callers should show progress.
   */
  formatCode(source: string): Promise<string> {
    return this.enqueue(async () => {
      await this.spawnIfNeeded()
      this.setStatus('installing')
      try {
        const response = await this.request(
          { type: 'format-code', id: 0, source },
          INSTALL_TIMEOUT_MS,
        )
        if (response.type !== 'formatted') {
          throw new PythonScriptError(`Unexpected response '${response.type}'`)
        }
        return response.source
      } finally {
        if (this.worker) this.setStatus('ready')
      }
    })
  }

  disposeScript(id: string): Promise<void> {
    return this.enqueue(async () => {
      this.sources.delete(id)
      if (!this.worker || !this.registered.has(id)) return
      this.registered.delete(id)
      await this.request(
        { type: 'dispose-script', id: 0, scriptId: id },
        INSTALL_TIMEOUT_MS,
      )
    })
  }

  /** Terminate the worker and reject anything in flight. */
  dispose(): void {
    this.disposed = true
    this.teardown(new Error('Python runtime disposed'))
    this.sources.clear()
    this.setStatus('idle')
  }

  // ── internals ──────────────────────────────────────────────────────

  private setStatus(status: PythonRuntimeStatus): void {
    if (this.currentStatus === status) return
    this.currentStatus = status
    for (const listener of this.listeners) listener(status)
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.disposed) {
        throw new Error('Python runtime disposed')
      }
      return task()
    })
    // Keep the chain alive on failures; callers see the rejection via `run`.
    this.queue = run.catch(() => undefined)
    return run
  }

  private async spawnIfNeeded(): Promise<void> {
    if (this.worker && this.initPromise) return this.initPromise
    if (typeof Worker === 'undefined') {
      throw new Error('Python runtime requires a browser environment')
    }
    this.setStatus('booting')
    const PythonWorker = await getPythonWorkerCtor()
    const worker = new PythonWorker({ name: 'pairlens-python' })
    worker.onmessage = (event: MessageEvent<PythonToHostMessage>) => {
      this.onWorkerMessage(event.data)
    }
    worker.onerror = (event) => {
      this.teardown(new Error(`Python worker crashed: ${event.message}`))
      this.setStatus('error')
    }
    this.worker = worker
    this.registered.clear()
    this.initPromise = this.request(
      {
        type: 'init',
        id: 0,
        indexURL: `${self.location.origin}/_pyodide/`,
      },
      INIT_TIMEOUT_MS,
    ).then(() => {
      this.setStatus('ready')
    })
    try {
      await this.initPromise
    } catch (err) {
      this.teardown(err instanceof Error ? err : new Error(String(err)))
      this.setStatus('error')
      throw err
    }
  }

  private async sendRegister(
    id: string,
    source: string,
    modules: Array<CustomIndicatorModule>,
  ): Promise<CustomIndicatorMeta> {
    const response = await this.request(
      { type: 'register-script', id: 0, scriptId: id, source, modules },
      REGISTER_TIMEOUT_MS,
    )
    if (response.type !== 'registered') {
      throw new PythonScriptError(`Unexpected response '${response.type}'`)
    }
    this.registered.add(id)
    return response.meta
  }

  private request(
    message: HostToPythonMessage,
    timeoutMs: number,
    transfer?: Array<ArrayBuffer>,
  ): Promise<PythonToHostMessage> {
    const worker = this.worker
    if (!worker) {
      return Promise.reject(new Error('Python worker is not running'))
    }
    const id = this.nextId++
    return new Promise<PythonToHostMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        // A stuck synchronous Python call never yields — kill and respawn
        // lazily on the next call.
        this.teardown(
          new Error(`Python runtime timed out after ${timeoutMs}ms`),
        )
        this.setStatus('error')
        reject(new Error(`Python runtime timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const outgoing = { ...message, id }
      if (transfer && transfer.length > 0) {
        worker.postMessage(outgoing, transfer)
      } else {
        worker.postMessage(outgoing)
      }
    })
  }

  private onWorkerMessage(msg: PythonToHostMessage): void {
    // Log lines are unsolicited — they carry no request id.
    if (msg.type === 'log') {
      for (const listener of this.logListeners) listener(msg)
      return
    }
    const entry = this.pending.get(msg.id)
    if (!entry) return
    this.pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (msg.type === 'error') {
      entry.reject(new PythonScriptError(msg.error, msg.traceback))
    } else {
      entry.resolve(msg)
    }
  }

  private teardown(reason: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(reason)
    }
    this.pending.clear()
    this.registered.clear()
    this.worker?.terminate()
    this.worker = null
    this.initPromise = null
  }
}

let singleton: PythonRuntime | null = null

/** Shared runtime instance — one Pyodide worker per window. */
export function getPythonRuntime(): PythonRuntime {
  singleton ??= new PythonRuntime()
  return singleton
}
