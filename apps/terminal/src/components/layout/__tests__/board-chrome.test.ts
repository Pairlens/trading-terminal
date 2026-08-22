// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Two invariants of the workspace board, kept honest by reading the source.
 *
 * A pane no longer sits on the app ground. Its column is one `--card` surface,
 * so a pane that pins a header with `bg-background` paints a band of the wrong
 * colour over its own rows, and only while scrolling — the kind of bug that
 * ships because nobody scrolled that pane in review. There is no runtime signal
 * for it either: both classes are valid, the result is simply wrong.
 *
 * The hairline between two stacked panes is the board's only line, and it is a
 * deliberate 45% mix rather than `--border` at full strength, which reads as a
 * table gridline at this density. It lives in one custom property, and the
 * utilities that reference it fail SILENTLY if it goes away: an undefined
 * custom property paints nothing, so the rules just vanish.
 *
 * If you are here because this failed: fix the class (`bg-card`), or, if the
 * element genuinely belongs on the app ground rather than on a board column,
 * add it to ON_THE_GROUND with a line saying why.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, test } from 'bun:test'

const SRC = join(import.meta.dir, '..', '..', '..')

/**
 * The directories whose files render inside a `--card` column.
 *
 * The bottom four are not boards. They are the master-detail pages, which
 * stopped being full-bleed sheets and became columns on the same ground (see
 * `components/chrome/page-chrome.ts`), so the same trap applies to them
 * verbatim.
 */
const PANE_DIRS = [
  join(SRC, 'components', 'terminal'),
  join(SRC, 'components', 'discovery'),
  join(SRC, 'components', 'predictions'),
  join(SRC, 'components', 'futures'),
  join(SRC, 'components', 'dex'),
  join(SRC, 'components', 'equities'),
  join(SRC, 'components', 'nft'),
  join(SRC, 'components', 'panes'),
  join(SRC, 'components', 'layout'),
  join(SRC, 'components', 'bots'),
  join(SRC, 'components', 'indicators'),
  join(SRC, 'components', 'notifications'),
  join(SRC, 'components', 'workflows'),
]

/**
 * Files whose pinned surface really is the app ground, not a column.
 *
 * All three are dialog or sheet content. A dialog is its own surface, painted
 * from the ground rather than from whatever column happened to open it, so a
 * header pinned inside one is correct where the same line inside a pane is a
 * bug.
 */
const ON_THE_GROUND = new Set<string>([
  'components/indicators/libraries-dialog.tsx',
  'components/indicators/version-history.tsx',
  'components/notifications/notification-history-sheet.tsx',
])

/**
 * A `className` string that pins an element and paints it with the app ground.
 * Scoped to one attribute value so a `sticky` in one element and a
 * `bg-background` in its neighbour do not read as a hit.
 */
const CLASS_ATTR = /class(?:Name)?=\{?["'`]([^"'`]*)["'`]/g

function collectFiles(dir: string, out: Array<string> = []): Array<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      collectFiles(full, out)
      continue
    }
    if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('workspace board chrome', () => {
  const files = PANE_DIRS.flatMap((dir) => collectFiles(dir))

  test('the scan actually reads the pane source tree', () => {
    // A broken path would make the assertion below vacuously true.
    expect(files.length).toBeGreaterThan(50)
  })

  test('nothing pins the app ground inside a board column', () => {
    const offenders: Array<string> = []

    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/')
      if (ON_THE_GROUND.has(rel)) continue

      const source = readFileSync(file, 'utf8')
      for (const [, classes] of source.matchAll(CLASS_ATTR)) {
        const pinned = /\bsticky\b/.test(classes)
        const ground = /\bbg-background(?:\/\d+)?\b/.test(classes)
        if (pinned && ground) offenders.push(`${rel}: ${classes.trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })

  test('the hairline every pane divider references is declared', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8')
    expect(css).toContain('--pane-rule:')
    expect(css).toContain('var(--border)')
  })
})
