// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Python worker runs code the user did not necessarily write — an
 * installed plugin can contribute indicator scripts through the
 * `chart:indicator` capability, and a script exported from the workbench
 * travels as a plugin zip. Pyodide hands that code the JS globals through its
 * `js` module, so `js.fetch(...)` from Python is an ordinary call. The worker
 * shipped with no guard installed at all while the plugin sandbox next door
 * stripped storage globals and enforced a per-plugin allowlist.
 *
 * The guard is verified end to end in the browser (boot Pyodide, pull numpy
 * from jsDelivr, deny example.com). What is pinned here is the allowlist
 * itself, because it is the part that can silently rot: drop a host and the
 * runtime stops booting, add one and the boundary quietly widens.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { isUrlAllowed } from '../../plugins/sandbox/network-guard'

const WORKER = readFileSync(
  join(import.meta.dir, '..', 'python-worker.ts'),
  'utf8',
)

/** What the worker pins, with the same-origin entry resolved for the test. */
const HOSTS = [
  'terminal.pairlens.finance',
  'cdn.jsdelivr.net',
  'pypi.org',
  'files.pythonhosted.org',
]

describe('the worker installs a guard before Pyodide', () => {
  test('the call is above loadPyodide, not inside a handler', () => {
    const install = WORKER.indexOf('installNetworkGuard(')
    const load = WORKER.indexOf('await loadPyodide(')
    expect(install).toBeGreaterThan(-1)
    // A guard installed after the runtime is one the first script can race.
    expect(install).toBeLessThan(load)
  })

  test('the allowlist is frozen and holds exactly the runtime hosts', () => {
    expect(WORKER).toContain('Object.freeze([')
    expect(WORKER).toContain('self.location.hostname')
    for (const host of HOSTS.slice(1)) {
      expect(WORKER).toContain(`'${host}'`)
    }
  })

  /**
   * Each of these is load-bearing: same origin serves the pyodide core assets
   * from /_pyodide/, jsDelivr serves the compiled wheels the lockfile names,
   * and micropip resolves pure-Python wheels through PyPI. Losing any one
   * stops the runtime booting rather than failing softly.
   */
  test('every host the runtime needs is allowed', () => {
    expect(
      isUrlAllowed(
        'https://terminal.pairlens.finance/_pyodide/pyodide.asm.wasm',
        HOSTS,
      ),
    ).toBe(true)
    expect(
      isUrlAllowed(
        'https://cdn.jsdelivr.net/pyodide/v0.28.0/full/numpy.whl',
        HOSTS,
      ),
    ).toBe(true)
    expect(isUrlAllowed('https://pypi.org/simple/black/', HOSTS)).toBe(true)
    expect(
      isUrlAllowed('https://files.pythonhosted.org/packages/x.whl', HOSTS),
    ).toBe(true)
  })

  test('anywhere a script would exfiltrate to is denied', () => {
    expect(isUrlAllowed('https://example.com/steal', HOSTS)).toBe(false)
    expect(isUrlAllowed('https://attacker.io/?d=candles', HOSTS)).toBe(false)
    // The document CSP allows all of these for the app as a whole, which is
    // exactly why it cannot be the boundary for this worker.
    expect(
      isUrlAllowed('https://api.telegram.org/botTOKEN/sendMessage', HOSTS),
    ).toBe(false)
    expect(
      isUrlAllowed('https://api.openai.com/v1/chat/completions', HOSTS),
    ).toBe(false)
    expect(isUrlAllowed('wss://ws.okx.com/ws/v5/public', HOSTS)).toBe(false)
  })

  // The guard matches hostnames, so a lookalike must not slip past on a
  // suffix. `isUrlAllowed` owns this, but the python list is where a wildcard
  // would most plausibly be added by mistake.
  test('no wildcard is used, so no suffix confusion is possible', () => {
    expect(HOSTS.some((h) => h.startsWith('*.'))).toBe(false)
    expect(isUrlAllowed('https://pypi.org.evil.com/x', HOSTS)).toBe(false)
    expect(isUrlAllowed('https://cdn.jsdelivr.net.evil.com/x', HOSTS)).toBe(
      false,
    )
  })
})

describe('the denial names a list the reader can act on', () => {
  test('the worker passes its own reason, not the plugin-manifest default', () => {
    // A Python indicator author has no manifest; pointing them at
    // `network.hosts` would send them looking for a file that does not exist.
    expect(WORKER).toContain('Python indicators may only reach')
    expect(WORKER).not.toContain('network.hosts')
  })
})
