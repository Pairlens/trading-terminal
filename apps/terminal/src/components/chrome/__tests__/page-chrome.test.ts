// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The page vocabulary is a copy of the board's geometry, and a copy drifts.
 *
 * `page-chrome.ts` exists so Bots, Indicators, Notifications and Workflows land
 * their columns on the same pixel a workspace lands its own. Nothing enforces
 * that at runtime: change the board's inset from 10px to 12px and the pages
 * keep their 10px, the two surfaces stop lining up, and the only symptom is
 * that the product looks slightly wrong in a way nobody can name.
 *
 * So the numbers are asserted against their source rather than restated. If
 * you are here because this failed, you changed one of the two and not the
 * other. Change both.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  PAGE_COLUMN,
  PAGE_COLUMN_FLUSH,
  PAGE_GROUND,
  PAGE_RULE,
} from '../page-chrome'
import {
  RAIL_ITEM,
  RAIL_ITEM_SLOT,
  RAIL_SEPARATOR,
  railSection,
} from '../rail-chrome'
import { HEADER_CHIP } from '../header-chrome'

const SRC = join(import.meta.dir, '..', '..', '..')
const read = (...parts: Array<string>) =>
  readFileSync(join(SRC, ...parts), 'utf8')

describe('page chrome tracks board chrome', () => {
  test('a page insets its ground exactly as a board does', () => {
    const shell = read('components', 'layout', 'layout-shell.tsx')
    const board = /const BOARD =\s*'([^']*)'/.exec(shell)?.[1]
    expect(board).toBeTruthy()

    // Three edges inset, none on top: the columns hang off the bar.
    for (const utility of ['px-2.5', 'pb-2.5', 'bg-background']) {
      expect(board).toContain(utility)
      expect(PAGE_GROUND).toContain(utility)
    }
    expect(board).not.toContain('pt-')
    expect(PAGE_GROUND).not.toContain('pt-')
  })

  test('a page column is the same surface as a board column', () => {
    const column = read('components', 'layout', 'layout-column.tsx')
    const surface = /const COLUMN_SURFACE =\s*'([^']*)'/.exec(column)?.[1]
    expect(surface).toBeTruthy()

    for (const utility of ['rounded-[14px]', 'bg-card', 'p-3']) {
      expect(surface).toContain(utility)
      expect(PAGE_COLUMN).toContain(utility)
    }
    // The flush variant is the same card without the padding, for content
    // that reaches its own edges.
    expect(PAGE_COLUMN_FLUSH).toContain('rounded-[14px]')
    expect(PAGE_COLUMN_FLUSH).toContain('bg-card')
    expect(PAGE_COLUMN_FLUSH).not.toContain('p-3')

    // Neither ever draws an edge of its own. The fill is the edge.
    expect(surface).not.toMatch(/\bborder\b/)
    expect(PAGE_COLUMN).not.toMatch(/\bborder\b/)
  })

  test('every line in the frame is the one line the board draws', () => {
    expect(PAGE_RULE).toContain('bg-(--pane-rule)')
    expect(RAIL_SEPARATOR).toContain('bg-(--pane-rule)')

    const handles = read('components', 'layout', 'layout-handles.tsx')
    expect(handles).toContain('--pane-rule')
  })

  test('a rail item is a top-bar chip', () => {
    // Same fill, same radius. The rail used to answer "you are here" with
    // `--sidebar-accent`, two steps brighter than anything else on screen.
    expect(HEADER_CHIP).toContain('bg-card')
    expect(HEADER_CHIP).toContain('rounded-[10px]')
    expect(RAIL_ITEM).toContain('data-active:bg-card')
    expect(RAIL_ITEM).toContain('rounded-[10px]')
    expect(RAIL_ITEM).not.toContain('sidebar-accent')
  })

  test('the current section is marked by a spine in its own hue', () => {
    // The spine hangs off the item's left edge, which is why it lives on the
    // `<li>`: the button is `overflow-hidden` and would clip it away.
    expect(RAIL_ITEM_SLOT).toContain('before:-left-1.5')
    expect(RAIL_ITEM_SLOT).toContain('has-data-active:before:opacity-100')
    expect(RAIL_ITEM_SLOT).toContain('before:bg-(--rail-spine)')

    // Every destination names a hue, and no two sections share one.
    const sections = [
      'pairs',
      'charts',
      'notifications',
      'workflows',
      'indicators',
      'bots',
      'accounts',
      'plugins',
      'workspaces',
      'workspace-store',
    ] as const
    const hues = sections.map((id) => {
      const cls = railSection(id)
      expect(cls).toContain(RAIL_ITEM_SLOT)
      return cls.replace(RAIL_ITEM_SLOT, '').trim()
    })
    expect(new Set(hues).size).toBe(sections.length)
    for (const id of sections) {
      expect(railSection(id)).toContain(`[--rail-spine:var(--section-${id})]`)
    }

    // An item that is not a destination draws nothing: no variable, no bar.
    expect(railSection()).toBe(RAIL_ITEM_SLOT)

    // The hues are declared once, out with the asset-class ones, so a theme
    // cannot repaint what the rail spent a session teaching.
    const tokens = readFileSync(
      join(SRC, '..', '..', '..', 'packages', 'ui', 'src', 'styles.css'),
      'utf8',
    )
    for (const id of sections) {
      expect(tokens).toContain(`--section-${id}:`)
    }
  })

  test('the rail spans its own width so the spine survives the clip', () => {
    // `SidebarContent` is the scroll container, and a scroll container clips
    // at its padding box. The spine sits left of an item that already lives
    // in that padding, so the element runs edge to edge and puts the inset
    // back as its own padding.
    const shell = read('routes', '_terminal.tsx')
    expect(shell).toContain('<SidebarContent className="-mx-2 px-4 py-2">')
  })
})
