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
 */

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

installOfflineGuard()
