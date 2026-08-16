// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Ensures the terminal dev server is running before Tauri opens its window.
 *
 * If the terminal is already serving (e.g. via `bun run dev`), this script
 * stays alive without launching a second instance — avoiding port conflicts.
 *
 * If starting the terminal fresh, it resolves the App Server the same way
 * scripts/dev.ts does: explicit VITE_APP_SERVER_URL → locally-running App
 * Server on :4046 → Pairlens Cloud (https://api.pairlens.finance). Set
 * PAIRLENS_STANDALONE=1 to run fully offline (auth off, cloud panels hidden).
 *
 * Market data flows directly through connector plugins — no sidecar process.
 *
 * Used as Tauri's `beforeDevCommand`.
 */

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const DESKTOP_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const TERMINAL_DIR = resolve(DESKTOP_ROOT, '..', 'terminal')

const terminalPort = process.env.TERMINAL_PORT ?? '3000'
// An optional App Server (external to this repo) serves on :4046 by default.
const appServerPort = process.env.APP_SERVER_PORT ?? '4046'
const devUrl = `http://localhost:${terminalPort}`
const appServerUrl = `http://localhost:${appServerPort}`

async function isReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

if (await isReachable(devUrl)) {
  console.log(`[desktop] Terminal already running at ${devUrl}, skipping`)
  // Keep process alive so Tauri doesn't think beforeDevCommand crashed
  setInterval(() => {}, 1 << 30)
} else {
  // When launched from `bun run dev --desktop`, process.env already contains
  // VITE_APP_SERVER_URL (possibly explicitly empty = standalone). Otherwise
  // resolve the same way scripts/dev.ts does: local App Server → Pairlens
  // Cloud, with PAIRLENS_STANDALONE=1 as the offline switch.
  let effectiveAppServerUrl = process.env.VITE_APP_SERVER_URL ?? ''
  if (
    process.env.VITE_APP_SERVER_URL === undefined &&
    process.env.PAIRLENS_STANDALONE !== '1'
  ) {
    effectiveAppServerUrl = (await isReachable(`${appServerUrl}/health`))
      ? appServerUrl
      : 'https://api.pairlens.finance'
  }
  if (process.env.PAIRLENS_STANDALONE === '1') effectiveAppServerUrl = ''

  // This script never starts an App Server, it only points the terminal at
  // one that is already serving (or at Pairlens Cloud). Keep the wording on
  // "using" so the log can't be read as "the dev command spawned a backend".
  if (effectiveAppServerUrl) {
    console.log(
      effectiveAppServerUrl === appServerUrl
        ? `[desktop] Using the App Server already running at ${effectiveAppServerUrl}`
        : `[desktop] Using App Server ${effectiveAppServerUrl}`,
    )
    console.log('[desktop] Starting terminal (auth enabled)')
  } else {
    console.log('[desktop] No App Server configured')
    console.log('[desktop] Starting terminal (standalone, no auth)')
  }
  const child = spawn('bunx', ['vite', 'dev', '--port', terminalPort], {
    stdio: 'inherit',
    cwd: TERMINAL_DIR,
    env: {
      ...process.env,
      VITE_APP_SERVER_URL: effectiveAppServerUrl,
    },
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}
