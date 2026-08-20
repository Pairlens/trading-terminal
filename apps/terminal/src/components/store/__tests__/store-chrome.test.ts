// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The storefronts unstack their top bar, which means two numbers stop being
 * implied by the layout and start being written down: where the scroll starts
 * (`STORE_BAR_PAD`) and where a product sheet starts (`STORE_BAR_OFFSET`).
 * Both are the bar's own height. Change `HEADER_BAR` to `h-12` and nothing
 * breaks at runtime — the hero just slides four pixels under the title and
 * stays there, which is the kind of wrong nobody files a bug about.
 *
 * So the height is read from its source and the offsets are asserted against
 * it. If you are here because this failed, change all three.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { STORE_BAR_OFFSET, STORE_BAR_PAD } from '../store-shell'
import { HEADER_BAR } from '../../chrome/header-chrome'

const SRC = join(import.meta.dir, '..', '..', '..')
const read = (...parts: Array<string>) =>
  readFileSync(join(SRC, ...parts), 'utf8')

describe('the floating store bar', () => {
  test('reserves exactly the height the bar occupies', () => {
    const height = /\bh-(\d+)\b/.exec(HEADER_BAR)?.[1]
    expect(height).toBe('11')

    expect(STORE_BAR_PAD).toBe(`pt-${height}`)
    expect(STORE_BAR_OFFSET).toBe(`top-${height}`)
  })

  test('keeps the board inset under it', () => {
    const shell = read('components', 'store', 'store-shell.tsx')
    const canvas = shell.slice(shell.indexOf('export function StoreCanvas'))

    // Same three-edge inset a board uses, plus the bar's height on top.
    expect(canvas).toContain('px-2.5 pb-2.5')
    expect(canvas).toContain('STORE_BAR_PAD')
  })

  test('a product sheet stops at the bar rather than covering it', () => {
    for (const file of [
      ['components', 'plugins', 'plugin-product-page.tsx'],
      ['components', 'workspace-store', 'workspace-product-page.tsx'],
      // Accounts floats its bar over the same canvas, so its full-screen
      // venues page is a product sheet by every rule that matters here.
      ['components', 'accounts', 'create-account-links.tsx'],
    ]) {
      const source = read(...file)
      expect(source).toContain('STORE_BAR_OFFSET')
      // `inset-0` would put the sheet over search, the tabs and the back way
      // out of the store.
      expect(source).not.toContain('absolute inset-0 z-40')
    }
  })
})
