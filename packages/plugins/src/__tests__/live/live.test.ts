// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Live connector conformance — OPT-IN, network-bound.
 *
 * Skipped unless `PAIRLENS_LIVE_CONNECTORS=1`, so it never runs in the normal
 * `bun test` / CI build (which would be flaky and rate-limited). Run it with:
 *
 *   bun run test:connectors:live
 *
 * It drives each connector's real WS + REST clients against the live exchange
 * and asserts the canonical contract, then prints a greppable pass/fail matrix
 * for the nightly job. Each connector is its own `it` so one exchange being
 * down doesn't mask the rest.
 */

import { afterAll, describe, expect, it } from 'bun:test'

import { SELECTED_DRIVERS, SKIPPED_DRIVER_NAMES } from './drivers'
import { formatMatrix, rowFailures, runConnectorChecks } from './harness'
import type { ConnectorResults } from './harness'

const LIVE = process.env.PAIRLENS_LIVE_CONNECTORS === '1'

// Generous ceiling: REST + three stream checks, each with its own timeout.
const PER_CONNECTOR_TIMEOUT = 150_000

describe.skipIf(!LIVE)('live connector conformance', () => {
  const rows: Array<ConnectorResults> = []

  afterAll(() => {
    if (rows.length === 0) return

    console.log('\n' + formatMatrix(rows) + '\n')
    // Named explicitly so a narrowed nightly cannot read as a full sweep.
    if (SKIPPED_DRIVER_NAMES.length > 0) {
      console.log(`not checked: ${SKIPPED_DRIVER_NAMES.join(', ')}\n`)
    }
  })

  for (const driver of SELECTED_DRIVERS) {
    it(
      `${driver.name} conforms on ${driver.pair}`,
      async () => {
        const result = await runConnectorChecks(driver)
        rows.push(result)

        const failures = rowFailures(result)
        expect(
          failures,
          `${driver.name} failed checks:\n  - ${failures.join('\n  - ')}`,
        ).toEqual([])
      },
      PER_CONNECTOR_TIMEOUT,
    )
  }
})
