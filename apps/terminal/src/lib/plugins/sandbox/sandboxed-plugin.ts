// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Host side of the plugin sandbox: spawns the sandbox worker, evaluates the
 * plugin module inside it, and exposes a `PluginInstance`-shaped proxy whose
 * execute/subscribe/initialize/destroy calls travel over postMessage.
 *
 * The worker is created inline from a Blob (`?worker&inline`) so it inherits
 * the document CSP — see sandbox-worker.ts for the isolation rationale.
 */
import { validateManifest } from '@pairlens/shared/plugin-manifest-schema'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system'

import type { HostToWorkerMessage, WorkerToHostMessage } from './protocol'

/**
 * Lazily import the inlined worker constructor. Kept out of module top-level
 * so the SSR pass never evaluates Vite's `?worker&inline` transform — plugins
 * only ever load in the browser. Vite bundles the worker + its imports and
 * inlines it as a Blob URL, so the worker inherits the document CSP.
 */
async function getSandboxWorkerCtor(): Promise<
  new (options?: WorkerOptions) => Worker
> {
  const mod = await import('./sandbox-worker?worker&inline')
  return mod.default
}

const LOAD_TIMEOUT_MS = 15_000
const CALL_TIMEOUT_MS = 120_000
const DESTROY_TIMEOUT_MS = 5_000

export type SandboxedModule = {
  manifest: PluginManifest
  /** PluginFactory-compatible: returns the worker-backed instance. */
  factory: (manifest: PluginManifest) => PluginInstance
  /** Terminate the worker without installing (e.g. trust says main realm). */
  dispose: () => void
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Evaluate a plugin module inside a fresh sandbox worker.
 *
 * Resolves once the worker has imported the module, validated its manifest,
 * and armed the network allowlist. Rejects on load errors or timeout (the
 * worker is terminated in that case).
 */
export async function loadPluginInSandbox(
  moduleText: string,
  expected?: { id: string; version: string },
): Promise<SandboxedModule> {
  const SandboxWorker = await getSandboxWorkerCtor()
  return new Promise((resolve, reject) => {
    const worker: Worker = new SandboxWorker({
      name: expected ? `plugin-sandbox:${expected.id}` : 'plugin-sandbox',
    })

    let settledLoad = false
    let destroyed = false
    let nextCallId = 1
    let nextSubId = 1
    const pending = new Map<number, Pending>()
    const subscribers = new Map<string, (data: unknown) => void>()

    const send = (msg: HostToWorkerMessage): void => worker.postMessage(msg)

    const failAllPending = (reason: string): void => {
      for (const [, p] of pending) {
        clearTimeout(p.timer)
        p.reject(new Error(reason))
      }
      pending.clear()
    }

    const teardown = (reason: string): void => {
      if (destroyed) return
      destroyed = true
      failAllPending(reason)
      subscribers.clear()
      worker.terminate()
    }

    const loadTimer = setTimeout(() => {
      if (settledLoad) return
      settledLoad = true
      teardown('Plugin sandbox load timed out')
      reject(new Error('Plugin sandbox load timed out (15s)'))
    }, LOAD_TIMEOUT_MS)

    const call = (
      build: (id: number) => HostToWorkerMessage,
      timeoutMs = CALL_TIMEOUT_MS,
    ): Promise<unknown> => {
      if (destroyed) {
        return Promise.reject(new Error('Plugin sandbox has been terminated'))
      }
      const id = nextCallId++
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          rej(new Error('Plugin sandbox call timed out'))
        }, timeoutMs)
        pending.set(id, { resolve: res, reject: rej, timer })
        send(build(id))
      })
    }

    worker.onmessage = (event: MessageEvent<WorkerToHostMessage>) => {
      const msg = event.data
      switch (msg.type) {
        case 'loaded': {
          if (settledLoad) return
          settledLoad = true
          clearTimeout(loadTimer)

          // Defense in depth: re-validate the manifest host-side.
          const result = validateManifest(msg.manifest)
          if (!result.valid) {
            teardown('Invalid manifest from sandbox')
            reject(
              new Error(
                `Invalid plugin manifest:\n  - ${result.errors.join('\n  - ')}`,
              ),
            )
            return
          }
          const manifest = result.manifest

          const instance: PluginInstance = {
            manifest,
            status: 'installed',
            config: {},
            initialize: (config) =>
              call((id) => ({ type: 'initialize', id, config })).then(
                () => undefined,
              ),
            execute: (params: PluginExecuteParams) =>
              call((id) => ({ type: 'execute', id, params })),
            subscribe: (params: PluginExecuteParams, callback) => {
              if (destroyed) {
                throw new Error('Plugin sandbox has been terminated')
              }
              const subId = `sub-${nextSubId++}`
              subscribers.set(subId, callback)
              send({ type: 'subscribe', subId, params })
              return () => {
                if (!subscribers.delete(subId)) return
                if (!destroyed) send({ type: 'unsubscribe', subId })
              }
            },
            destroy: async () => {
              if (destroyed) return
              try {
                await call(
                  (id) => ({ type: 'destroy', id }),
                  DESTROY_TIMEOUT_MS,
                )
              } catch {
                // Worker unresponsive — terminate regardless.
              }
              teardown('Plugin destroyed')
            },
            // No getContributedComponents / executeCommand /
            // getStatusBarComponent / getSettingsComponent: React UI
            // contributions require main-realm code (full trust).
          }

          resolve({
            manifest,
            factory: () => instance,
            dispose: () => teardown('Sandbox disposed'),
          })
          break
        }
        case 'load-error': {
          if (settledLoad) return
          settledLoad = true
          clearTimeout(loadTimer)
          teardown('Plugin failed to load')
          reject(new Error(msg.error))
          break
        }
        case 'result': {
          const p = pending.get(msg.id)
          if (!p) return
          pending.delete(msg.id)
          clearTimeout(p.timer)
          if (msg.ok) p.resolve(msg.value)
          else p.reject(new Error(msg.error))
          break
        }
        case 'stream': {
          subscribers.get(msg.subId)?.(msg.data)
          break
        }
        case 'subscribe-error': {
          console.warn(
            `[plugin-sandbox] subscription ${msg.subId} failed: ${msg.error}`,
          )
          subscribers.delete(msg.subId)
          break
        }
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      const reason = `Plugin sandbox worker error: ${event.message || 'unknown'}`
      if (!settledLoad) {
        settledLoad = true
        clearTimeout(loadTimer)
        teardown(reason)
        reject(new Error(reason))
        return
      }
      teardown(reason)
    }

    send({ type: 'load', moduleText, expected })
  })
}
