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
 *   bun run release auto           # minor if a feat landed, else patch
 *   bun run release patch --push   # push the commit and tag too
 *
 * Shorthands: `bun run release:patch` / `:minor` / `:major`, and
 * `bun run release:check` to see whether one is overdue at all.
 *
 * Version lives in four files that must stay in lockstep (the release
 * workflow refuses tags that disagree with tauri.conf.json):
 *   apps/desktop/src-tauri/tauri.conf.json   (authoritative — the updater
 *                                             compares against this)
 *   apps/desktop/src-tauri/Cargo.toml
 *   apps/desktop/src-tauri/Cargo.lock
 *   apps/desktop/package.json
 *
 * Pushing is left to the human unless `--push` is passed:
 * `git push origin HEAD --follow-tags` (`origin` is
 * Pairlens/trading-terminal). See docs/RELEASING.md for the full pipeline.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDecision } from './release/due'
import { bumpVersion } from './release/version'

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
const argv = process.argv.slice(2)
const push = argv.includes('--push')
const arg = argv.find((value) => !value.startsWith('-'))
if (!arg) fail('Usage: bun run release <patch|minor|major|auto|x.y.z> [--push]')

// `auto` reads the same conventional commits the daily check reads, with the
// soak window switched off — asking for auto means "pick the bump for what
// has landed", not "tell me whether it is time yet".
function resolveKind(kind: string): string {
  if (kind !== 'auto') return kind
  const decision = resolveDecision({ soakDays: 0, bumpOverride: 'auto' })
  if (!decision.bump) {
    fail(`Nothing to release: ${decision.detail}`)
  }
  console.log(`[release] auto → ${decision.bump} (${decision.detail})`)
  return decision.bump
}

function resolveNext(kind: string): string {
  try {
    return bumpVersion(current, kind)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

const next = resolveNext(resolveKind(arg))
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

if (push) {
  // --atomic so a rejected branch push (main moved under us) cannot leave the
  // tag behind on its own, pointing at a commit nothing can reach.
  run('git', ['push', 'origin', 'HEAD', '--follow-tags', '--atomic'])
  console.log(`
[release] v${next} pushed. The Release workflow is building installers for
macOS/Windows/Linux and will attach latest.json to a DRAFT release on this
repo. Publish the draft to ship the update to users.
`)
} else {
  console.log(`
[release] v${next} committed and tagged.

Next steps:
  git push origin HEAD --follow-tags   # triggers the Release workflow
  # CI builds installers for macOS/Windows/Linux and attaches latest.json
  # to a DRAFT release on this repo. Publish the draft to ship the
  # update to users.
`)
}
