// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Package the built plugin into a distributable `.zip` (manifest.json +
 * module.js + optional styles.css). Run after `bun run build`.
 *
 *   bun run build && bun run package   →  dist/dev-starter.zip
 *
 * The resulting zip can be installed via the terminal's "Import plugin" button,
 * dropped into the local plugins folder, or uploaded to a registry. A plugin
 * package is just a zip with these three entries — no Pairlens tooling required.
 */
import { strToU8, zipSync } from 'fflate'

const manifestText = await Bun.file('manifest.json').text()
const moduleText = await Bun.file('dist/dev-starter.js').text()

const files: Record<string, Uint8Array> = {
  'manifest.json': strToU8(manifestText),
  'module.js': strToU8(moduleText),
}

const styleFile = Bun.file('dist/styles.css')
if (await styleFile.exists()) {
  files['styles.css'] = strToU8(await styleFile.text())
}

const bytes = zipSync(files, { level: 6 })
await Bun.write('dist/dev-starter.zip', bytes)
console.log(`Packaged dist/dev-starter.zip (${bytes.length} bytes)`)
