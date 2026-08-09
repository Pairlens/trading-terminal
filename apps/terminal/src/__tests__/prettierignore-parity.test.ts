// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The terminal has TWO ignore lists, and this test is why that is survivable.
 *
 * Prettier reads the `.prettierignore` in its own working directory and no
 * other — there is no inheritance and no `extends`. The repo root has a
 * `format` script and so does this workspace, so `bun run format` means two
 * different things depending on where you type it, and only the root one is
 * covered by the root's ignore list.
 *
 * That is not theoretical. `public/_sdk/plugin-sdk.js` is a MINIFIED bundle
 * checked into the repo; a format run started from `apps/terminal` expanded it
 * from one line into 216 and the change had to be backed out by hand. The fix
 * is `apps/terminal/.prettierignore`, which repeats what the root file already
 * says about this directory.
 *
 * Repetition rots. So: every root entry that points inside `apps/terminal/`
 * must appear in this workspace's own file with the prefix stripped. Add one
 * up there, add it down here.
 *
 * The check is deliberately limited to path-prefixed entries. A bare pattern
 * like `AGENTS.md` or `dist/` matches at any depth under gitignore semantics,
 * so the root file would apply it inside this workspace too — but demanding
 * that the local file restate every such pattern would fill it with rules for
 * files that do not exist here. `dist/` IS restated locally because this
 * workspace really does build into one; the rest are left alone.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

/** This file lives at apps/terminal/src/__tests__/ — up three, then up two. */
const TERMINAL_DIR = join(import.meta.dir, '..', '..')
const REPO_ROOT = join(TERMINAL_DIR, '..', '..')

const WORKSPACE_PREFIX = 'apps/terminal/'

function patternsOf(path: string): Array<string> {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

describe('.prettierignore parity', () => {
  const rootPatterns = patternsOf(join(REPO_ROOT, '.prettierignore'))
  const localPatterns = patternsOf(join(TERMINAL_DIR, '.prettierignore'))

  it('repeats every root entry that points inside apps/terminal', () => {
    const owed = rootPatterns
      .filter((pattern) => pattern.startsWith(WORKSPACE_PREFIX))
      .map((pattern) => pattern.slice(WORKSPACE_PREFIX.length))

    // Non-empty on purpose: if the root file stops naming anything in this
    // workspace, the local file's reason to exist deserves a second look.
    expect(owed.length).toBeGreaterThan(0)
    for (const pattern of owed) expect(localPatterns).toContain(pattern)
  })

  it('still ignores the artifact that caused this test to exist', () => {
    expect(rootPatterns).toContain('apps/terminal/public/_sdk/')
    expect(localPatterns).toContain('public/_sdk/')
  })
})
