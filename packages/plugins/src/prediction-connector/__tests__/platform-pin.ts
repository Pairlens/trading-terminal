// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pin the CLI/desktop platform shape for a test file.
 *
 * Connector platform behavior is decided from `typeof window` at call time
 * (packages/market-engine/src/platform.ts), and these suites assert refusal
 * ORDERING — a leaked `window` from another package's suite (bun runs every
 * globbed file in one process) makes a desktop-only venue refuse with
 * "needs the desktop app" before the credential or timeframe check under
 * test ever runs. Call this at module scope; it deletes `window` before the
 * file's tests and puts back whatever was there once they finish.
 */
import { afterAll, beforeAll } from 'bun:test'

export function pinCliPlatform(): void {
  const g = globalThis as { window?: unknown }
  const hadWindow = 'window' in g
  const originalWindow = g.window
  beforeAll(() => {
    delete g.window
  })
  afterAll(() => {
    if (hadWindow) g.window = originalWindow
    else delete g.window
  })
}
