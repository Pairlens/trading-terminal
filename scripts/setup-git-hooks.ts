// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Point git at the committed `.githooks/` directory (pre-commit license
 * header gate + pre-push quality gate).
 *
 * Wired to `postinstall` so every fresh clone/worktree gets the hook after
 * `bun install` — no husky/lefthook dependency needed. Safe to run
 * repeatedly, never throws out to the caller (a failing postinstall must not
 * break `bun install`), and no-ops in CI / cloud builds and non-git contexts
 * (e.g. production Docker installs).
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'

function main(): void {
  if (process.env.CI || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT)
    return

  const inRepo = spawnSync('git', ['rev-parse', '--git-dir'], {
    stdio: 'ignore',
  })
  if (inRepo.status !== 0) return

  const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'ignore',
  })
  if (result.status !== 0) {
    console.warn('[setup-git-hooks] could not set core.hooksPath (skipped)')
    return
  }

  // Committed file modes can be lost on some filesystems; re-assert.
  for (const name of ['pre-commit', 'pre-push']) {
    const hook = path.join(process.cwd(), '.githooks', name)
    if (existsSync(hook)) chmodSync(hook, 0o755)
  }
}

try {
  main()
} catch (err) {
  console.warn('[setup-git-hooks] skipped:', err)
}
