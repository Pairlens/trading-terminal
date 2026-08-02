// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Connector-switch reliability — OPT-IN, network-bound.
 *
 * Skipped unless PAIRLENS_LIVE_CONNECTORS=1. Run via:
 *   PAIRLENS_LIVE_CONNECTORS=1 bun test packages/plugins/src/__tests__/live/reliability.test.ts
 *
 * Each connector is cycled subscribe → teardown → resubscribe on a SINGLE
 * reused client (mirroring the plugin's singleton WsClient across market
 * switches). Fails if any channel stops delivering after a switch.
 */

import { afterAll, describe, expect, it } from 'bun:test'

import { LIVE_DRIVERS } from './drivers'
import { formatReliabilityMatrix, runReliabilityCheck } from './reliability'
import type { ReliabilityResult } from './reliability'

const LIVE = process.env.PAIRLENS_LIVE_CONNECTORS === '1'
const PER_CONNECTOR_TIMEOUT = 120_000

describe.skipIf(!LIVE)('connector switch reliability', () => {
  const rows: Array<ReliabilityResult> = []

  afterAll(() => {
    if (rows.length === 0) return

    console.log('\n' + formatReliabilityMatrix(rows) + '\n')
  })

  for (const driver of LIVE_DRIVERS) {
    it(
      `${driver.name} keeps streaming across resubscribe cycles`,
      async () => {
        const result = await runReliabilityCheck(driver, 4)
        rows.push(result)
        expect(
          result.ok,
          `${driver.name} dropped channels on switch — ${result.failureSummary}`,
        ).toBe(true)
      },
      PER_CONNECTOR_TIMEOUT,
    )
  }
})
