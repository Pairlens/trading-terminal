// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'bun:test'

/**
 * Turbo has to be able to see every file whose contents `vite build` bakes
 * into the bundle, or it will replay a stale build in its place.
 *
 * A task's default inputs are the files of its own package, and the version
 * the terminal reports is read out of the desktop bundle's manifest — another
 * package, with no dependency edge to this one. So `bun run release` changed
 * nothing turbo could see: the release commit hit a cache hit, and the web
 * terminal shipped the previous release's bundle under the new number. It sat
 * on 0.1.4 for the whole of v0.2.0 that way.
 *
 * The fix is one `$TURBO_ROOT$` input in turbo.json, which is easy to drop on
 * the next edit and impossible to notice when it goes: a stale build is a
 * successful build. So derive the requirement from the vite config itself —
 * point it at another file outside the package and this fails until turbo.json
 * names it too.
 */

const TERMINAL_DIR = fileURLToPath(new URL('../../../', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

/** turbo.json is JSONC — drop `//` comments that are not inside a string. */
function parseJsonc(source: string): unknown {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += char
  }
  return JSON.parse(out) as unknown
}

const viteConfig = readFileSync(resolve(TERMINAL_DIR, 'vite.config.ts'), 'utf8')

const turboConfig = parseJsonc(
  readFileSync(resolve(TERMINAL_DIR, 'turbo.json'), 'utf8'),
) as { tasks?: { build?: { inputs?: Array<string> } } }

/** Every `readFileSync(new URL('…', import.meta.url))` in the vite config. */
const bakedFiles = [
  ...viteConfig.matchAll(/readFileSync\(\s*new URL\(\s*'([^']+)'/g),
].map((match) => match[1])

/** Of those, the ones that live outside apps/terminal. */
const outOfPackage = bakedFiles.filter((path) => path.startsWith('../'))

describe('terminal build inputs', () => {
  it('finds the files the vite config bakes in', () => {
    // Guards the guard: a rewritten vite config that no longer matches the
    // pattern above would leave every assertion below vacuously true.
    expect(bakedFiles.length).toBeGreaterThan(0)
    expect(outOfPackage).toContain('../desktop/src-tauri/tauri.conf.json')
  })

  it('keeps the package its own inputs', () => {
    // Naming inputs REPLACES the default set — without this the terminal's own
    // source would stop busting its cache, which is the far worse failure.
    expect(turboConfig.tasks?.build?.inputs).toContain('$TURBO_DEFAULT$')
  })

  it('declares every out-of-package file it reads', () => {
    const inputs = turboConfig.tasks?.build?.inputs ?? []
    for (const path of outOfPackage) {
      const fromRoot = relative(REPO_ROOT, resolve(TERMINAL_DIR, path))
      expect(inputs).toContain(`$TURBO_ROOT$/${fromRoot}`)
    }
  })
})
