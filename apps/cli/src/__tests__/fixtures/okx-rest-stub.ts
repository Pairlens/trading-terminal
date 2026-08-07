// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Deterministic OKX REST for the CLI integration tests.
 *
 * Preloaded into the CLI's own process (`bun --preload <this> <cli> …`) so the
 * tests still drive the real binary end to end — argument parsing, plugin
 * install and activation, connector selection, the OKX REST client and its
 * parser, the strategy engine, output formatting — with only the socket to the
 * venue replaced. Preloading rather than a module mock is what keeps that
 * true: the CLI is a child process, so there is nothing in it for the test to
 * patch, and the alternative is a network round trip in a required check.
 *
 * `restFetch` hands non-Tauri callers straight to `globalThis.fetch`, so
 * replacing that here is the whole intercept — for REST.
 *
 * IT DOES NOT COVER WEBSOCKETS, and that limit is worth knowing before you
 * reach for it. `candles`, `history` and `signals` are REST reads and land
 * here; `ticker` and `orderbook` go out over `manager.subscribe(...)`, open a
 * real socket to the venue, and pass straight through this file as though it
 * were not loaded. Wiring one of those to the fixture and calling it
 * deterministic would put the flake back exactly where it was, with a comment
 * claiming otherwise. Stubbing the socket is a separate job.
 *
 * Within REST, unknown URLs throw by design. A silent fall-through to the real
 * internet is how a test goes back to being flaky without anyone editing it,
 * so a connector that starts calling a new endpoint fails loudly here instead
 * of quietly resuming its dependency on the network.
 */

const DAY_MS = 86_400_000
/** Fixed so a run's output never depends on the day it runs. */
const NEWEST_TS = 1_785_920_400_000

/**
 * A steady climb with a constant bar range.
 *
 * The point is a KNOWN answer, so the assertions can name the regime instead
 * of accepting whichever of three values today's market happens to produce.
 * That answer is `chop`, and deliberately so: regime here is a volatility
 * judgement, not a directional one (`detectRegime` calls it a trend only when
 * the latest ATR exceeds 1.5x its own 20-bar average), and a constant range
 * holds ATR flat however far the price climbs. A monotonic ramp reading as
 * `chop` is the detector working, not the fixture being wrong.
 */
function candleRows(count: number): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  for (let i = 0; i < count; i++) {
    // OKX returns newest first; index 0 is the newest bar.
    const stepsFromOldest = count - 1 - i
    const open = 100 + stepsFromOldest * 0.5
    const close = open + 0.4
    rows.push([
      String(NEWEST_TS - i * DAY_MS),
      open.toFixed(2),
      (close + 0.3).toFixed(2),
      (open - 0.3).toFixed(2),
      close.toFixed(2),
      '10',
      '1000',
      '1000',
      // `confirm: 1` — every bar closed. A forming last bar would make the
      // signal output depend on where in the day the suite runs.
      '1',
    ])
  }
  return rows
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const realFetch = globalThis.fetch

// `_init` is ignored: every call the fixture answers is a plain GET, so there
// are no headers or body worth honouring, and dropping the parameter would
// hide that the real signature carries one.
globalThis.fetch = ((input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

  if (
    url.includes('/api/v5/market/candles') ||
    url.includes('history-candles')
  ) {
    const limit = Number(new URL(url).searchParams.get('limit') ?? '100')
    return Promise.resolve(jsonResponse({ code: '0', data: candleRows(limit) }))
  }

  // Not a URL this fixture knows. Loud on purpose — see the module note.
  throw new Error(
    `[okx-rest-stub] unexpected request to ${url}. Add it to the fixture rather than letting the suite reach the network.`,
  )
}) as typeof globalThis.fetch

// Kept reachable so a future fixture case can proxy a real call deliberately.
export { realFetch }
