// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Network + storage guard installed inside a worker BEFORE any untrusted code
 * is evaluated.
 *
 * Two callers, and they differ only in where the allowlist comes from: the
 * plugin sandbox takes it from the plugin's signed manifest and mutates it
 * after import, while the Python indicator worker pins a fixed list of the
 * package registries the runtime itself needs. Both run code the user did not
 * necessarily write.
 *
 * - `fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource` are replaced with
 *   wrappers that enforce a host allowlist (the plugin manifest's signed
 *   `network.hosts`). The wrappers are defined non-configurable on both the
 *   global object and its prototype chain, so plugin code cannot delete them
 *   to recover the originals.
 * - Ambient storage and escape hatches are removed: `indexedDB` (blocks
 *   cross-plugin cache tampering), `caches`, `BroadcastChannel`, and nested
 *   `Worker` creation (a sub-worker would get fresh, unguarded globals).
 *
 * The allowlist is a mutable ref because the plugin sandbox needs it to be:
 * it installs the guard with an empty list (module top-level code gets zero
 * network), then sets the list from the module's own exported manifest after
 * import. A caller with a fixed list just passes a frozen one.
 */

export type MutableAllowlist = { hosts: ReadonlyArray<string> }

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])

/** Pure allowlist check — exact hostname or single leading `*.` wildcard. */
export function isUrlAllowed(
  rawUrl: string,
  hosts: ReadonlyArray<string>,
  base?: string,
): boolean {
  let url: URL
  try {
    url = new URL(rawUrl, base)
  } catch {
    return false
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false
  const hostname = url.hostname.toLowerCase()
  return hosts.some((pattern) => {
    const p = pattern.toLowerCase()
    if (p.startsWith('*.')) {
      const suffix = p.slice(1) // '.example.com'
      return hostname.endsWith(suffix) && hostname.length > suffix.length
    }
    return hostname === p
  })
}

/**
 * `reason` names the list that refused, because the reader has to know which
 * one to go and change. A plugin author edits `network.hosts` in a manifest; a
 * Python indicator author has no manifest at all, and sending them looking for
 * one is worse than saying nothing.
 */
export class PluginNetworkDeniedError extends Error {
  constructor(
    url: string,
    reason = "not in the plugin's declared network.hosts allowlist",
  ) {
    super(`[sandbox] Network access to "${url}" denied: ${reason}`)
    this.name = 'PluginNetworkDeniedError'
  }
}

/**
 * Define `value` under `key` on the object and everywhere the property exists
 * on its prototype chain, non-configurable and non-writable, so it cannot be
 * deleted or reassigned to recover an original.
 */
function hardDefine(target: object, key: string, value: unknown): void {
  const seen: Array<object> = []
  let obj: object | null = target
  while (obj) {
    seen.push(obj)
    obj = Object.getPrototypeOf(obj) as object | null
  }
  for (const o of seen) {
    const isTarget = o === target
    if (!isTarget && !Object.prototype.hasOwnProperty.call(o, key)) continue
    try {
      Object.defineProperty(o, key, {
        value,
        configurable: false,
        writable: false,
        enumerable: true,
      })
    } catch {
      // Non-configurable already — nothing more we can do here.
    }
  }
}

/** Globals removed outright inside the sandbox. */
const BLOCKED_GLOBALS = [
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'WebTransport',
  'WebSocketStream',
  'importScripts',
] as const

export function installNetworkGuard(
  scope: typeof globalThis,
  allowlist: MutableAllowlist,
  /** Names the list that refused, for the error the author reads. */
  denyReason?: string,
): void {
  const deny = (url: string): never => {
    throw new PluginNetworkDeniedError(url, denyReason)
  }

  // ── fetch ─────────────────────────────────────────────────────────
  const realFetch = scope.fetch.bind(scope)
  const guardedFetch: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (!isUrlAllowed(url, allowlist.hosts)) {
      return Promise.reject(new PluginNetworkDeniedError(url, denyReason))
    }
    return realFetch(input, init)
  }
  hardDefine(scope, 'fetch', guardedFetch)

  // ── XMLHttpRequest ────────────────────────────────────────────────
  // Patch the REAL prototype method (not a subclass): subclassing leaves the
  // unguarded `open` reachable via Object.getPrototypeOf(x).__proto__.open.
  // Patching XMLHttpRequest.prototype.open non-configurably means every XHR —
  // however it is constructed — routes through the check, with no unguarded
  // `open` anywhere in the chain. `realOpen` lives only in this closure.
  const RealXhr = (scope as { XMLHttpRequest?: typeof XMLHttpRequest })
    .XMLHttpRequest
  if (RealXhr?.prototype?.open) {
    const realOpen = RealXhr.prototype.open
    const guardedOpen = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: Array<unknown>
    ): void {
      const raw = typeof url === 'string' ? url : url.href
      if (!isUrlAllowed(raw, allowlist.hosts)) deny(raw)
      ;(realOpen as (...a: Array<unknown>) => void).call(
        this,
        method,
        url,
        ...rest,
      )
    }
    hardDefine(RealXhr.prototype, 'open', guardedOpen)
  }

  // ── WebSocket / EventSource ───────────────────────────────────────
  // These take their URL in the constructor, so we guard by subclassing. This
  // stops direct use (`new WebSocket('wss://evil')`) and yields a clear error,
  // but — unlike fetch/XHR above — it is NOT bypass-proof: a hostile plugin can
  // recover the native constructor via Object.getPrototypeOf(WebSocket) in a
  // shared realm. That is acceptable because the ENFORCING network boundary is
  // the CSP `connect-src` (browser-enforced at the network layer, no JS trick
  // bypasses it), which ships on desktop. This guard is defense-in-depth and
  // provides actionable errors.
  const RealWebSocket = scope.WebSocket
  if (RealWebSocket) {
    const GuardedWebSocket = class WebSocket extends RealWebSocket {
      constructor(url: string | URL, protocols?: string | Array<string>) {
        const raw = typeof url === 'string' ? url : url.href
        if (!isUrlAllowed(raw, allowlist.hosts)) deny(raw)
        super(url, protocols)
      }
    }
    hardDefine(scope, 'WebSocket', GuardedWebSocket)
  }

  const RealEventSource = (scope as { EventSource?: typeof EventSource })
    .EventSource
  if (RealEventSource) {
    const GuardedEventSource = class EventSource extends RealEventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        const raw = typeof url === 'string' ? url : url.href
        if (!isUrlAllowed(raw, allowlist.hosts)) deny(raw)
        super(url, init)
      }
    }
    hardDefine(scope, 'EventSource', GuardedEventSource)
  }

  // ── Remove ambient storage & escape hatches ───────────────────────
  for (const key of BLOCKED_GLOBALS) {
    if (key in scope) hardDefine(scope, key, undefined)
  }
  const nav = (scope as { navigator?: Navigator }).navigator
  if (nav) {
    if ('storage' in nav) hardDefine(nav, 'storage', undefined)
    if ('sendBeacon' in nav) hardDefine(nav, 'sendBeacon', undefined)
  }
}
