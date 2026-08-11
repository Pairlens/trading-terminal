// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

// Browser stand-in for the 'ws' package that ccxt's WsClient imports at module
// level. ccxt only reaches for this default export when running under Node —
// in browsers (and the Tauri webview) it picks `self.WebSocket` — so the shim
// just has to exist and not crash on import. See WsClient.js:
//   const WebSocketPlatform = isBun ? globalThis.WebSocket
//     : (isNode || !selfIsDefined() ? WebSocket : self.WebSocket)
export default typeof self !== 'undefined'
  ? self.WebSocket
  : (globalThis as { WebSocket?: unknown }).WebSocket

export const createWebSocketStream = (): never => {
  throw new Error(
    'ws.createWebSocketStream is Node-only and unused in the browser',
  )
}
