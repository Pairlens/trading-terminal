// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/// <reference lib="webworker" />
/**
 * Plugin sandbox worker — evaluates one third-party plugin module in an
 * isolated realm and services capability calls over postMessage.
 *
 * Isolation properties:
 * - No DOM, no localStorage/cookies, no Tauri IPC (`__TAURI_INTERNALS__` is
 *   window-only) — the credential store and keychain are unreachable.
 * - The network guard is installed below, before ANY plugin code runs, with an
 *   empty allowlist. Module top-level code therefore gets zero network. After
 *   import, the allowlist is set to the module's own exported (signed)
 *   `manifest.network.hosts`.
 * - This worker is spawned inline from a Blob (`?worker&inline`) so it
 *   inherits the document CSP — remote dynamic `import()` inside the sandbox
 *   is blocked by `script-src` on desktop.
 *
 * IMPORTANT: keep this module dependency-light — everything it imports is
 * bundled into the inline worker.
 */
import { validateManifest } from '@pairlens/shared/plugin-manifest-schema'

import { installNetworkGuard } from './network-guard'
import { SANDBOX_IMPORT_ERROR_HINT } from './protocol'
import type { MutableAllowlist } from './network-guard'
import type { HostToWorkerMessage, WorkerToHostMessage } from './protocol'
import type { PluginManifest } from '@pairlens/shared/plugin-types'

type SandboxPluginInstance = {
  execute: (params: unknown) => Promise<unknown>
  subscribe?: (params: unknown, callback: (data: unknown) => void) => () => void
  initialize?: (config: Record<string, unknown>) => Promise<void>
  destroy?: () => Promise<void>
}

// ── Guard first — before any plugin code can possibly run ───────────

const allowlist: MutableAllowlist = { hosts: [] }
installNetworkGuard(globalThis, allowlist)

// ── State ────────────────────────────────────────────────────────────

let instance: SandboxPluginInstance | null = null
const subscriptions = new Map<string, () => void>()

function post(message: WorkerToHostMessage): void {
  self.postMessage(message)
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    // Bare-specifier imports (react, @pairlens/plugin-sdk) fail in workers —
    // give the host a recognizable hint to surface the full-trust requirement.
    if (/failed to (resolve|fetch)|import|specifier/i.test(err.message)) {
      return `${err.message} — ${SANDBOX_IMPORT_ERROR_HINT}`
    }
    return err.message
  }
  return String(err)
}

// ── Module loading ───────────────────────────────────────────────────

async function loadModule(
  moduleText: string,
  expected?: { id: string; version: string },
): Promise<void> {
  const blob = new Blob([moduleText], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  let mod: {
    manifest?: unknown
    createPlugin?: (manifest: PluginManifest) => SandboxPluginInstance
  }
  try {
    mod = (await import(/* @vite-ignore */ blobUrl)) as typeof mod
  } finally {
    URL.revokeObjectURL(blobUrl)
  }

  if (!mod.manifest || typeof mod.createPlugin !== 'function') {
    throw new Error('Plugin module must export `manifest` and `createPlugin`')
  }

  // JSON-normalize the exported manifest: strips getters/proxies so the hosts
  // we enforce and the manifest we report cannot change after this point.
  const cleanManifest = JSON.parse(JSON.stringify(mod.manifest)) as unknown
  const result = validateManifest(cleanManifest)
  if (!result.valid) {
    throw new Error(
      `Invalid plugin manifest:\n  - ${result.errors.join('\n  - ')}`,
    )
  }
  const manifest = result.manifest

  if (expected) {
    if (manifest.id !== expected.id) {
      throw new Error(
        `Plugin module declares id "${manifest.id}" but "${expected.id}" was expected`,
      )
    }
    if (manifest.version !== expected.version) {
      throw new Error(
        `Plugin module declares version "${manifest.version}" but "${expected.version}" was expected`,
      )
    }
  }

  // Enforce the module's own (signed) network declaration from here on.
  allowlist.hosts = [...(manifest.network?.hosts ?? [])]

  instance = mod.createPlugin(manifest)
  post({ type: 'loaded', manifest })
}

// ── Message handling ─────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<HostToWorkerMessage>) => {
  const msg = event.data
  switch (msg.type) {
    case 'load': {
      loadModule(msg.moduleText, msg.expected).catch((err: unknown) => {
        post({ type: 'load-error', error: errorText(err) })
      })
      break
    }
    case 'initialize': {
      Promise.resolve(instance?.initialize?.(msg.config))
        .then(() => post({ type: 'result', id: msg.id, ok: true, value: null }))
        .catch((err: unknown) =>
          post({
            type: 'result',
            id: msg.id,
            ok: false,
            error: errorText(err),
          }),
        )
      break
    }
    case 'execute': {
      if (!instance) {
        post({
          type: 'result',
          id: msg.id,
          ok: false,
          error: 'Plugin not loaded',
        })
        break
      }
      instance
        .execute(msg.params)
        .then((value) => post({ type: 'result', id: msg.id, ok: true, value }))
        .catch((err: unknown) =>
          post({
            type: 'result',
            id: msg.id,
            ok: false,
            error: errorText(err),
          }),
        )
      break
    }
    case 'subscribe': {
      if (!instance?.subscribe) {
        post({
          type: 'subscribe-error',
          subId: msg.subId,
          error: 'Plugin does not support streaming subscriptions',
        })
        break
      }
      try {
        const unsubscribe = instance.subscribe(msg.params, (data) => {
          post({ type: 'stream', subId: msg.subId, data })
        })
        subscriptions.set(msg.subId, unsubscribe)
      } catch (err) {
        post({
          type: 'subscribe-error',
          subId: msg.subId,
          error: errorText(err),
        })
      }
      break
    }
    case 'unsubscribe': {
      const unsubscribe = subscriptions.get(msg.subId)
      subscriptions.delete(msg.subId)
      try {
        unsubscribe?.()
      } catch {
        // Plugin unsubscribe failure is non-fatal
      }
      break
    }
    case 'destroy': {
      for (const [, unsubscribe] of subscriptions) {
        try {
          unsubscribe()
        } catch {
          // ignore
        }
      }
      subscriptions.clear()
      Promise.resolve(instance?.destroy?.())
        .catch(() => {})
        .finally(() =>
          post({ type: 'result', id: msg.id, ok: true, value: null }),
        )
      instance = null
      break
    }
  }
}
