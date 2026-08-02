// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Finalizes the terminal production bundle for embedding in the desktop app.
 *
 * The terminal's Vite build emits `_shell.html` (the SPA shell) but Tauri's
 * static file server expects `index.html` at the frontendDist root. This is
 * a bun script (not `cp`) so it also runs on Windows CI runners.
 *
 * Used as part of Tauri's `beforeBuildCommand`, with cwd = apps/desktop.
 */

import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_DIST = resolve(DESKTOP_ROOT, '..', 'terminal', 'dist', 'client')

const shell = resolve(CLIENT_DIST, '_shell.html')
if (!existsSync(shell)) {
  console.error(
    `[desktop] Missing ${shell} — did the terminal build run? (bun run --cwd apps/terminal build)`,
  )
  process.exit(1)
}

copyFileSync(shell, resolve(CLIENT_DIST, 'index.html'))
console.log('[desktop] Terminal bundle ready: _shell.html → index.html')
