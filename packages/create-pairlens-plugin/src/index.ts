#!/usr/bin/env bun
// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * create-pairlens-plugin — scaffold a new Pairlens plugin.
 *
 *   npx create-pairlens-plugin <name>      (once published)
 *   bun run create:plugin <name>           (from this monorepo)
 *
 * Generates a ready-to-build plugin folder: manifest.json + a sample panel that
 * uses @pairlens/ui + @pairlens/plugin-sdk, plus `build` and `package` scripts.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const rawName = process.argv[2]
if (!rawName) {
  console.error('Usage: create-pairlens-plugin <name>')
  process.exit(1)
}

const id = slugify(rawName)
if (id.length < 2) {
  console.error(`Invalid plugin name: "${rawName}"`)
  process.exit(1)
}
const name = titleCase(id)
const targetDir = join(process.cwd(), id)

if (existsSync(targetDir)) {
  console.error(`Directory already exists: ${targetDir}`)
  process.exit(1)
}

// ── File templates ──────────────────────────────────────────────────

const manifestJson =
  JSON.stringify(
    {
      id,
      name,
      version: '0.1.0',
      author: 'You',
      description: `${name} — a Pairlens plugin`,
      capabilities: [],
      config: {},
      contributes: {
        panels: [
          {
            id: 'main',
            label: name,
            icon: 'Puzzle',
            category: 'discovery',
            description: `${name} panel`,
          },
        ],
      },
    },
    null,
    2,
  ) + '\n'

const indexTs = `import { lazy } from 'react'

import type {
  PluginManifest,
  PluginInstance,
  PluginExecuteParams,
} from '@pairlens/plugin-sdk'
import { MainPanel } from './panels/main'
import manifestJson from '../manifest.json'

export const manifest = manifestJson as PluginManifest

export function createPlugin(m: PluginManifest): PluginInstance {
  return {
    manifest: m,
    status: 'installed',
    config: {},
    execute: async (_params: PluginExecuteParams) => null,
    getContributedComponents: () => ({
      main: lazy(() => Promise.resolve({ default: MainPanel })),
    }),
  }
}
`

const panelTsx = `import { useState } from 'react'
import { usePanePair, useNotify } from '@pairlens/plugin-sdk'
// Import the design system from the ROOT specifier only.
import { Badge, Button } from '@pairlens/ui'

export function MainPanel() {
  const pair = usePanePair()
  const notify = useNotify()
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>${name}</span>
        <Badge variant="secondary">v0.1.0</Badge>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        Active pair:{' '}
        <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
          {pair ? pair.pairKey : 'none'}
        </span>
      </div>
      <div>
        <Button
          size="sm"
          onClick={() => {
            setCount((c) => c + 1)
            notify('Clicked ' + (count + 1) + ' times', { type: 'success' })
          }}
        >
          Click me ({count})
        </Button>
      </div>
    </div>
  )
}
`

const buildCmd =
  'bun build src/index.ts --outfile dist/module.js --format esm ' +
  "--external react --external 'react/jsx-runtime' " +
  '--external @pairlens/plugin-sdk --external @pairlens/ui ' +
  '--external fast-financial-charts --external fast-financial-charts/react ' +
  '--target browser --minify'

const pkgJson =
  JSON.stringify(
    {
      name: id,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: buildCmd,
        package: 'bun run scripts/package.ts',
      },
      devDependencies: {
        '@pairlens/plugin-sdk': 'workspace:*',
        '@pairlens/ui': 'workspace:*',
        '@types/react': '^19.0.0',
        fflate: '^0.8.3',
        react: '^19.0.0',
        typescript: '^5.9.3',
      },
    },
    null,
    2,
  ) + '\n'

const packageScript = `import { strToU8, zipSync } from 'fflate'

const manifestText = await Bun.file('manifest.json').text()
const moduleText = await Bun.file('dist/module.js').text()

const files: Record<string, Uint8Array> = {
  'manifest.json': strToU8(manifestText),
  'module.js': strToU8(moduleText),
}

const styleFile = Bun.file('dist/styles.css')
if (await styleFile.exists()) {
  files['styles.css'] = strToU8(await styleFile.text())
}

const bytes = zipSync(files, { level: 6 })
await Bun.write('dist/${id}.zip', bytes)
console.log('Packaged dist/${id}.zip (' + bytes.length + ' bytes)')
`

const tsconfig =
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        resolveJsonModule: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src', 'manifest.json'],
    },
    null,
    2,
  ) + '\n'

const readme = `# ${name}

A Pairlens plugin. Build it into a single-file ESM module and package it as a
\`.zip\` you can drop into the local plugins folder, Import from the terminal, or
upload to a registry.

\`\`\`bash
bun install
bun run build      # → dist/module.js
bun run package    # → dist/${id}.zip
\`\`\`

Install it: open the terminal → Plugins → Installed → **Import plugin**, pick
\`dist/${id}.zip\`. On desktop you can also drop the unzipped folder into the
plugins directory ("Open folder").

## Runtime contract

React, \`@pairlens/plugin-sdk\`, \`@pairlens/ui\` (design system, import from the
**root**), and \`fast-financial-charts\` are provided by the host at runtime — they are
marked \`--external\` in the build. Design-system components are styled by the
host; for ad-hoc CSS ship your own \`styles.css\`.
`

const gitignore = 'node_modules\ndist\n'

// ── Write ───────────────────────────────────────────────────────────

mkdirSync(join(targetDir, 'src', 'panels'), { recursive: true })
mkdirSync(join(targetDir, 'scripts'), { recursive: true })

writeFileSync(join(targetDir, 'manifest.json'), manifestJson)
writeFileSync(join(targetDir, 'src', 'index.ts'), indexTs)
writeFileSync(join(targetDir, 'src', 'panels', 'main.tsx'), panelTsx)
writeFileSync(join(targetDir, 'package.json'), pkgJson)
writeFileSync(join(targetDir, 'scripts', 'package.ts'), packageScript)
writeFileSync(join(targetDir, 'tsconfig.json'), tsconfig)
writeFileSync(join(targetDir, 'README.md'), readme)
writeFileSync(join(targetDir, '.gitignore'), gitignore)

console.log(`\n✓ Created plugin "${name}" at ${targetDir}\n`)
console.log('Next steps:')
console.log(`  cd ${id}`)
console.log('  bun install')
console.log('  bun run build && bun run package')
console.log(`  → install dist/${id}.zip via Plugins → Import plugin\n`)
