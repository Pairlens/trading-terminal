// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mobile terminal is separable, and this test is what keeps it that way.
 *
 * `src/mobile/` imports freely *into* the app — hooks, stores, dialogs, pure
 * helpers — but almost nothing imports back out of it. That one-way edge is
 * the reason a native shell or a browser extension can re-host the mobile
 * surface by lifting one directory plus its dependency closure, instead of
 * untangling it from the desktop tree. Every new importer is a strand that has
 * to be cut later, so each one is a deliberate decision, taken here.
 *
 * The allowlist below is the complete set of sanctioned importers, verified by
 * reading each one:
 *
 * - `routes/_terminal.tsx`     the viewport branch itself — it is what mounts
 *                              `MobileTerminalRoot` instead of the desktop
 *                              shell, so it necessarily knows the module.
 * - `components/onboarding/spotlight/onboarding-spotlight.tsx`
 *                              onboarding lives outside `_terminal`, so the
 *                              branch does not cover it; it reads the same
 *                              `useViewportMode()` gate to pick its portrait
 *                              layout presets rather than inventing a second
 *                              breakpoint source of truth.
 * - `styles.css`               one `@import './mobile/mobile.css'`, because
 *                              Tailwind needs a single stylesheet entry.
 *
 * If you are here because this test failed: adding a fourth importer is not
 * forbidden, it is a decision. Make it on purpose, and add the file to
 * SANCTIONED_IMPORTERS with a line saying why it has to know about mobile.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, test } from 'bun:test'

const SRC = join(import.meta.dir, '..', '..')
const MOBILE_DIR = join(SRC, 'mobile') + sep

/** Files outside `src/mobile/` that are allowed to reach into it. */
const SANCTIONED_IMPORTERS = new Set([
  'routes/_terminal.tsx',
  'components/onboarding/spotlight/onboarding-spotlight.tsx',
  'styles.css',
])

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css']

/**
 * Matches the three ways a module reaches `src/mobile`: the `@/mobile` alias,
 * a relative path that walks into a `mobile/` directory, and a CSS `@import`.
 * Deliberately broad — a false positive costs one allowlist entry, a false
 * negative costs the guarantee.
 */
const MOBILE_IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]*)['"]/g

function isMobileSpecifier(specifier: string): boolean {
  if (specifier === '@/mobile' || specifier.startsWith('@/mobile/')) return true
  // Relative walks: './mobile/…', '../mobile/…', '../../mobile/…'
  return /(^|\/)\.{1,2}\/(?:\.\.\/)*mobile(?:\/|$)/.test(`/${specifier}`)
}

function collectFiles(dir: string, out: Array<string> = []): Array<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      collectFiles(full, out)
      continue
    }
    if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
      out.push(full)
  }
  return out
}

describe('mobile separability', () => {
  const files = collectFiles(SRC).filter((file) => !file.startsWith(MOBILE_DIR))

  test('the scan actually reads the terminal source tree', () => {
    // A broken path would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(200)
  })

  test('nothing outside src/mobile imports from src/mobile', () => {
    const offenders: Array<string> = []

    for (const file of files) {
      const rel = relative(SRC, file)
      if (SANCTIONED_IMPORTERS.has(rel)) continue
      const source = readFileSync(file, 'utf8')
      MOBILE_IMPORT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = MOBILE_IMPORT.exec(source)) !== null) {
        const specifier = match[1]
        if (specifier && isMobileSpecifier(specifier)) {
          offenders.push(`${rel} → ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('every sanctioned importer still exists and still imports mobile', () => {
    // A stale allowlist is a silent hole: an entry that no longer imports
    // mobile would keep the door open for whatever lands in that file next.
    for (const rel of SANCTIONED_IMPORTERS) {
      const source = readFileSync(join(SRC, rel), 'utf8')
      MOBILE_IMPORT.lastIndex = 0
      const specifiers: Array<string> = []
      let match: RegExpExecArray | null
      while ((match = MOBILE_IMPORT.exec(source)) !== null) {
        if (match[1] && isMobileSpecifier(match[1])) specifiers.push(match[1])
      }
      expect({ file: rel, importsMobile: specifiers.length > 0 }).toEqual({
        file: rel,
        importsMobile: true,
      })
    }
  })
})
