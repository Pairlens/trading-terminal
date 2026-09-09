// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A test preload that refuses to let the suite talk to a real venue.
 *
 * Loaded by the package's `test` script, so it is installed before any test
 * file is imported. It replaces `globalThis.fetch` with one that throws.
 *
 * ## Why this is needed rather than merely tidy
 *
 * Every suite here believes it stubs its own network, and most do. What they
 * do not control is what happens AFTER them: a connector built in a test
 * schedules a markets refresh, the test ends, the stub is restored, and ccxt's
 * `loadMarkets` lands on the real venue a moment later. Measured across this
 * package, that was thirty live requests to seven exchanges per run, from
 * async continuations with no test frame left on the stack to blame.
 *
 * They were invisible for two reasons. The per-module suites were excluded
 * from CI entirely, and the calls happened after the test that caused them had
 * already passed. One of them was worse than invisible: a Bitget load escaping
 * into the NEXT file's fetch stub made an unrelated GeckoTerminal test count
 * three requests where it makes one, which read as a bug in the resolver.
 *
 * ## How it behaves
 *
 * A test that installs its own stub is unaffected: it assigns over this one
 * and restores it afterwards. What changes is the default. An unstubbed call
 * throws `OfflineTestError`, which the connector pipelines already treat as a
 * failed load (they are wrapped in `.catch`), so a leak degrades to a no-op
 * instead of a request. A test that genuinely forgot to stub now fails loudly,
 * which is the point: silence is how this got to thirty requests.
 *
 * The live suites under `src/__tests__/live/` are the deliberate exception and
 * gate themselves on `PAIRLENS_LIVE_*`. When any of those is set the guard
 * stands down, because those tests exist precisely to reach a real venue.
 *
 * ## The socket half
 *
 * `fetch` was only half the hole. A connector whose `subscribe` is never torn
 * down opens a real WebSocket to a real exchange, and that leak is nastier than
 * the REST one because of what ccxt does around it: `createConnection` arms a
 * ten-second connection timeout BEFORE it constructs the socket, and the
 * callback dereferences `this.connection` unconditionally. So a socket that
 * never comes up throws a bare `TypeError` ten seconds later, on a timer, with
 * no test frame on the stack: it lands in whatever file is running by then and
 * fails THAT one. It cost a green local run and a red CI to find (the whole
 * suite takes twelve seconds here, so the timer never got to fire), and the
 * file it took down had nothing to do with exchanges.
 *
 * So the same rule covers sockets. The patch is on ccxt's `createConnection`
 * rather than on the WebSocket constructor, and the ordering above is exactly
 * why: refusing later, from inside the constructor, would leave the timeout
 * already armed and reproduce the bug this prevents. It reports through
 * `client.onError`, which is how ccxt itself reports a connection failure, so
 * the connector's own error path handles it and no promise is left unsettled.
 */

import WsClient from 'ccxt/js/src/base/ws/WsClient.js'

/** Thrown in place of a request. Named so a stack trace explains itself. */
export class OfflineTestError extends Error {
  override readonly name = 'OfflineTestError'
  constructor(url: string) {
    super(
      `Blocked a network request to ${url}. Unit tests in this package make ` +
        `no requests: stub \`globalThis.fetch\` in the test that needs one. ` +
        `If this came from a connector the test never destroyed, destroy it ` +
        `(or await its teardown) so the load does not outlive the test.`,
    )
  }
}

/** Thrown in place of a socket, through ccxt's own connection-error path. */
export class OfflineSocketError extends Error {
  override readonly name = 'OfflineSocketError'
  constructor(url: string) {
    super(
      `Blocked a WebSocket connection to ${url}. Unit tests in this package ` +
        `open no sockets: a connector that streams must be torn down by the ` +
        `test that started it. Call the unsubscribe \`subscribe\` returned AND ` +
        `await the plugin's \`destroy()\`, or stub the exchange.`,
    )
  }
}

/** True when the run is one of the opt-in live suites. */
function liveRun(): boolean {
  return (
    process.env['PAIRLENS_LIVE_CONNECTORS'] === '1' ||
    process.env['PAIRLENS_LIVE_TESTNET'] === '1' ||
    (process.env['PAIRLENS_LIVE_MARKETS'] ?? '') !== ''
  )
}

export function installOfflineGuard(): void {
  if (liveRun()) return
  globalThis.fetch = ((input: unknown) => {
    const url =
      typeof input === 'string'
        ? input
        : ((input as { url?: string })?.url ?? String(input))
    return Promise.reject(new OfflineTestError(url))
  }) as typeof fetch
}

/**
 * Refuse a socket before ccxt arms anything.
 *
 * Deep import, never the barrel: this is the base client every pro exchange
 * builds on, and it costs nothing to load.
 */
export function installOfflineSocketGuard(): void {
  if (liveRun()) return
  const proto = WsClient.prototype as unknown as {
    createConnection: () => void
    onError: (error: Error) => void
    url?: string
  }
  proto.createConnection = function (this: typeof proto): void {
    // Not `throw`: `connect()` defers this behind a `sleep().then(...)` when it
    // is backing off, where a throw becomes an unhandled rejection instead of
    // something the connector can see. `onError` rejects the connection future
    // and every request waiting on it, which is the contract ccxt documents.
    this.onError(new OfflineSocketError(this.url ?? 'an exchange'))
  }
}

installOfflineGuard()
installOfflineSocketGuard()
