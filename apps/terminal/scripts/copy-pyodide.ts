// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Copy the pyodide core runtime assets from node_modules into
 * public/_pyodide/ so the Python worker can load them same-origin (CSP-safe
 * in the Tauri webview, no CDN dependency for the interpreter itself).
 * Compiled scientific packages are NOT shipped in the npm package — the
 * worker resolves those from jsDelivr via `packageBaseUrl`.
 *
 * Invoked from vite.config.ts on every dev-server boot and build; the version
 * marker makes re-runs a no-op until the pyodide dependency is bumped.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const ASSETS = [
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

export function copyPyodideAssets(appRoot: string): void {
  const require = createRequire(join(appRoot, 'package.json'))
  const pkgPath = require.resolve('pyodide/package.json')
  const pkgDir = dirname(pkgPath)
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    version: string
  }
  const outDir = join(appRoot, 'public', '_pyodide')
  const marker = join(outDir, '.version')
  const upToDate =
    existsSync(marker) &&
    readFileSync(marker, 'utf8') === version &&
    ASSETS.every((file) => existsSync(join(outDir, file)))
  if (upToDate) return
  mkdirSync(outDir, { recursive: true })
  for (const file of ASSETS) {
    copyFileSync(join(pkgDir, file), join(outDir, file))
  }
  writeFileSync(marker, version)
}
