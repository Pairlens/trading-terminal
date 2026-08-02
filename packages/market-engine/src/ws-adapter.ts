// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Thin WebSocket abstraction. Provides a unified interface.
 *
 * Browser: standard WebSocket.
 *
 * Tauri desktop: the webview's NATIVE WebSocket first, falling back to
 * @tauri-apps/plugin-websocket only if the native handshake fails. The plugin
 * (v2.x) has structural reliability flaws that produced desktop-only silent
 * stalls — sockets that open but never deliver data:
 *   1. Its Rust side keeps every connection's write-half in ONE
 *      Mutex<HashMap> and holds the guard across `write.send().await`, so a
 *      single slow/stuck write on ANY connection blocks sends for all
 *      connections AND blocks new connections' read loops from starting
 *      (the read loop's first step is inserting into that map).
 *   2. `connect` returns before the write-half is registered, so an
 *      immediate post-open send (every connector's SUBSCRIBE) can fail with
 *      "connection not found" (see confirmTauriWriterRegistered below).
 * The webview WebSocket (WKWebView/WebView2/WebKitGTK) is the same
 * battle-tested networking stack the browser build uses; exchange endpoints
 * accept it from Tauri origins (verified: all bundled exchanges accept
 * `Origin: tauri://localhost`). Note the desktop app DOES enforce a CSP
 * `connect-src` allowlist (apps/desktop/src-tauri/src/csp.rs) — a bundled
 * connector's hosts must be in that baseline or the native socket is blocked.
 */

import { isTauriRuntime } from './platform'

export type WsMessage = string | ArrayBuffer

export type WsAdapterEvents = {
  onMessage: (data: WsMessage) => void
  onOpen?: () => void
  onClose?: (code: number, reason: string) => void
  onError?: (error: unknown) => void
}

export interface WsConnection {
  send: (data: string) => void
  close: () => void
}

// Tauri detection — see ./platform for why it keys off __TAURI_INTERNALS__.
function isTauri(): boolean {
  return isTauriRuntime()
}

/**
 * Connect to a WebSocket. In Tauri, tries the webview's native WebSocket
 * first and falls back to the WS plugin if the native handshake fails.
 * In browser, uses standard WebSocket.
 */
export async function connectWs(
  url: string,
  events: WsAdapterEvents,
): Promise<WsConnection> {
  if (isTauri()) {
    try {
      return await connectBrowserWs(url, events)
    } catch {
      return connectTauriWs(url, events)
    }
  }
  return connectBrowserWs(url, events)
}

// ── Tauri plugin message mapping ─────────────────────────────────────
//
// @tauri-apps/plugin-websocket (v2.x) forwards every frame over a Channel as a
// serde externally-tagged object `{ type, data }` for Text/Binary/Ping/Pong/
// Close — EXCEPT a transport error (an abnormal/silent disconnect), which it
// serializes as a bare STRING. The previous adapter only matched Text/Binary/
// Close on `msg.type`, so on the desktop app:
//   - a transport drop (string) was ignored → onClose never fired → connectors
//     never reconnected; and
//   - Binary frames (sent as a JS number[], not an ArrayBuffer) were dropped →
//     binary connectors (HTX gzip, MEXC protobuf) received no data at all.
// This mapping is pure + exported so it can be unit-tested without the Tauri
// runtime (which can't run in the test environment).

export type TauriWsEvent =
  | { kind: 'message'; data: WsMessage }
  | { kind: 'close'; code: number; reason: string }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' }

export function mapTauriWsMessage(msg: unknown): TauriWsEvent {
  // Transport error: the plugin serializes read errors as a plain string.
  if (typeof msg === 'string') {
    return { kind: 'error', message: msg }
  }
  if (!msg || typeof msg !== 'object') return { kind: 'ignore' }

  const m = msg as { type?: string; data?: unknown }
  switch (m.type) {
    case 'Text':
      return typeof m.data === 'string'
        ? { kind: 'message', data: m.data }
        : { kind: 'ignore' }
    case 'Binary': {
      // Vec<u8> arrives as a JS number[]. Connectors expect an ArrayBuffer (the
      // browser path sets binaryType='arraybuffer'), so normalize it here.
      if (Array.isArray(m.data)) {
        return {
          kind: 'message',
          data: new Uint8Array(m.data as Array<number>).buffer,
        }
      }
      if (m.data instanceof ArrayBuffer) {
        return { kind: 'message', data: m.data }
      }
      return { kind: 'ignore' }
    }
    case 'Ping':
    case 'Pong':
      // Keepalive — tungstenite auto-responds to pings at the protocol level.
      return { kind: 'ignore' }
    case 'Close': {
      const frame = m.data as
        | { code?: number; reason?: string }
        | null
        | undefined
      return {
        kind: 'close',
        code: frame?.code ?? 1000,
        reason: frame?.reason ?? '',
      }
    }
    default:
      return { kind: 'ignore' }
  }
}

// ── Tauri writer-registration race ───────────────────────────────────
//
// The plugin's Rust `connect` command returns the connection id to JS BEFORE
// the task it spawns has inserted the socket's write-half into the plugin's
// connection map (and that insert also queues behind a mutex which other
// connections hold across slow `write.send().await`s). A send() issued right
// after connect() resolves — every connector's post-open SUBSCRIBE — can
// therefore fail with "connection not found". Combined with fire-and-forget
// send semantics this produced the desktop-only silent stall: the socket
// stayed open, the connector believed it was subscribed, and no data ever
// arrived. Probe with protocol-level Pings until one send succeeds: the map
// insert happens exactly once per connection, so after the first successful
// send the writer is permanently registered and later sends cannot lose this
// race. Exported for unit tests.

const WRITER_PROBE_ATTEMPTS = 40
const WRITER_PROBE_INTERVAL_MS = 50

export function isTauriConnectionNotFound(err: unknown): boolean {
  return String(err).toLowerCase().includes('connection not found')
}

export async function confirmTauriWriterRegistered(
  sendPing: () => Promise<void>,
  attempts = WRITER_PROBE_ATTEMPTS,
  intervalMs = WRITER_PROBE_INTERVAL_MS,
): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await sendPing()
      return
    } catch (err) {
      // Anything other than the registration race is a real transport
      // failure — fail the connect immediately so the caller's backoff runs.
      if (!isTauriConnectionNotFound(err)) throw err
      lastErr = err
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function connectTauriWs(
  url: string,
  events: WsAdapterEvents,
): Promise<WsConnection> {
  // Dynamic import — only executed in Tauri runtime (guarded by isTauri()).
  // In browser builds the package resolves to an empty module but this
  // code path is never reached.
  const { default: WebSocket } = await import('@tauri-apps/plugin-websocket')
  const ws = await WebSocket.connect(url)

  // Dedupe close: a transport error and a subsequent Close (or a client close)
  // must only surface onClose once, or a connector could reconnect twice.
  let closed = false
  const fireClose = (code: number, reason: string) => {
    if (closed) return
    closed = true
    events.onClose?.(code, reason)
  }

  // Register the listener BEFORE the registration probe below, so frames the
  // server sends right after the handshake (e.g. welcome/info messages) are
  // delivered to the connector instead of being dropped while we probe.
  ws.addListener((raw: unknown) => {
    const evt = mapTauriWsMessage(raw)
    switch (evt.kind) {
      case 'message':
        events.onMessage(evt.data)
        break
      case 'close':
        fireClose(evt.code, evt.reason)
        break
      case 'error':
        // The socket is gone; the plugin will not emit a separate Close after
        // an error. Surface it AND fire close (1006 = abnormal) so the
        // connector's onClose-driven reconnect runs.
        events.onError?.(new Error(evt.message))
        fireClose(1006, evt.message)
        break
      case 'ignore':
        break
    }
  })

  // Don't hand the connection to the caller until sends are guaranteed to
  // reach the wire (see writer-registration race above). On failure, surface
  // it as a failed connect so the connector's reconnect/backoff path runs.
  try {
    await confirmTauriWriterRegistered(() =>
      ws.send({ type: 'Ping', data: [] }),
    )
  } catch (err) {
    void ws.disconnect().catch(() => {})
    throw err
  }

  events.onOpen?.()

  return {
    send(data: string) {
      // The plugin's send is async. A rejection means the message never
      // reached the wire (socket dead, or writer evicted) — surfacing it as a
      // close makes the connector reconnect and resubscribe, instead of
      // silently running against a socket that dropped one of its control
      // messages.
      ws.send(data).catch((err: unknown) => {
        if (closed) return
        events.onError?.(err instanceof Error ? err : new Error(String(err)))
        fireClose(1006, 'send failed')
      })
    },
    close() {
      void ws.disconnect().catch(() => {})
      // Mirror browser semantics where close() ultimately fires onclose, so
      // connectors run their close cleanup. Deferred to a microtask to avoid
      // re-entering the caller synchronously mid-close.
      queueMicrotask(() => fireClose(1000, 'client closed'))
    },
  }
}

function connectBrowserWs(
  url: string,
  events: WsAdapterEvents,
): Promise<WsConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    // Events only flow to the connector once the socket has OPENED. A socket
    // that fails the handshake surfaces solely as a rejected promise — it must
    // not fire onClose/onError, because on Tauri a fallback transport may be
    // connected by the time the failed handshake's close event arrives, and a
    // leaked onClose would tear that healthy connection down.
    let opened = false

    const connection: WsConnection = {
      send(data: string) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      },
      close() {
        ws.close()
      },
    }

    ws.onopen = () => {
      opened = true
      events.onOpen?.()
      resolve(connection)
    }

    ws.onmessage = (evt) => {
      events.onMessage(evt.data)
    }

    ws.onclose = (evt) => {
      if (opened) {
        events.onClose?.(evt.code, evt.reason)
      } else {
        reject(new Error(`ws handshake failed (${evt.code} ${evt.reason})`))
      }
    }

    ws.onerror = (evt) => {
      if (opened) events.onError?.(evt)
      // Pre-open error: the browser always follows with a close event, which
      // rejects above with the close code.
    }
  })
}
