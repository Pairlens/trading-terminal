// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cut a desktop release: bump the app version everywhere it lives, commit,
 * and create the `v*` tag that triggers .github/workflows/release.yml.
 *
 *   bun run release patch          # 0.1.0 → 0.1.1
 *   bun run release minor          # 0.1.0 → 0.2.0
 *   bun run release major          # 0.1.0 → 1.0.0
 *   bun run release 1.2.3          # explicit version
 *
 * Version lives in four files that must stay in lockstep (the release
 * workflow refuses tags that disagree with tauri.conf.json):
 *   apps/desktop/src-tauri/tauri.conf.json   (authoritative — the updater
 *                                             compares against this)
 *   apps/desktop/src-tauri/Cargo.toml
 *   apps/desktop/src-tauri/Cargo.lock
 *   apps/desktop/package.json
 *
 * Pushing is left to the human: `git push origin main --follow-tags`
 * (`origin` is Pairlens/trading-terminal).
 * See docs/RELEASING.md for the full pipeline.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONF = resolve(ROOT, 'apps/desktop/src-tauri/tauri.conf.json')
const CARGO_TOML = resolve(ROOT, 'apps/desktop/src-tauri/Cargo.toml')
const CARGO_LOCK = resolve(ROOT, 'apps/desktop/src-tauri/Cargo.lock')
const PKG = resolve(ROOT, 'apps/desktop/package.json')

function fail(message: string): never {
  console.error(`[release] ${message}`)
  process.exit(1)
}

function run(cmd: string, args: Array<string>): void {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} failed`)
}

const conf = JSON.parse(readFileSync(CONF, 'utf8')) as { version: string }
const current = conf.version
const arg = process.argv[2]
if (!arg) fail('Usage: bun run release <patch|minor|major|x.y.z>')

function bump(version: string, kind: string): string {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    fail(`Cannot parse current version: ${version}`)
  }
  const [major, minor, patch] = parts as [number, number, number]
  switch (kind) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      if (!/^\d+\.\d+\.\d+$/.test(kind)) {
        fail(`Not a bump type or x.y.z version: ${kind}`)
      }
      return kind
  }
}

const next = bump(current, arg)
if (next === current) fail(`Already at ${current}`)

// Refuse to tag on top of unrelated uncommitted work.
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT })
if (dirty.stdout.toString().trim() !== '') {
  fail('Working tree is not clean — commit or stash first.')
}

// tauri.conf.json — replace the version line textually to keep formatting.
writeFileSync(
  CONF,
  readFileSync(CONF, 'utf8').replace(
    `"version": "${current}"`,
    `"version": "${next}"`,
  ),
)

// Cargo.toml — the [package] version is the first `version = ...` line.
writeFileSync(
  CARGO_TOML,
  readFileSync(CARGO_TOML, 'utf8').replace(
    `version = "${current}"`,
    `version = "${next}"`,
  ),
)

// Cargo.lock — only the pairlens-desktop package entry.
writeFileSync(
  CARGO_LOCK,
  readFileSync(CARGO_LOCK, 'utf8').replace(
    `name = "pairlens-desktop"\nversion = "${current}"`,
    `name = "pairlens-desktop"\nversion = "${next}"`,
  ),
)

// apps/desktop/package.json
writeFileSync(
  PKG,
  readFileSync(PKG, 'utf8').replace(
    `"version": "${current}"`,
    `"version": "${next}"`,
  ),
)

for (const file of [CONF, CARGO_TOML, CARGO_LOCK, PKG]) {
  if (!readFileSync(file, 'utf8').includes(next)) {
    fail(`Version replacement failed in ${file}`)
  }
}

run('git', ['add', CONF, CARGO_TOML, CARGO_LOCK, PKG])
run('git', ['commit', '-m', `release: v${next}`])
run('git', ['tag', '-a', `v${next}`, '-m', `Pairlens v${next}`])

console.log(`
[release] v${next} committed and tagged.

Next steps:
  git push origin HEAD --follow-tags   # triggers the Release workflow
  # CI builds installers for macOS/Windows/Linux and attaches latest.json
  # to a DRAFT release on this repo. Publish the draft to ship the
  # update to users.
`)
