// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Favorites and recents are stored as bare tool keys, so the key function and
 * the catalog have to agree forever: a key that no longer resolves is a
 * pinned tool that silently vanishes from a user's rail.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  DRAWING_RECENTS_KEY,
  DRAWING_RECENTS_LIMIT,
  drawingToolKey,
  trackDrawingToolUse,
} from '../chart-drawing-tools'
import {
  TOOL_CATEGORIES,
  findDrawingTool,
  toolKey,
} from '@/components/terminal/drawing-tool-catalog'

// Minimal localStorage backing — the module reads/writes it directly.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

const readRecents = (): Array<string> =>
  JSON.parse(localStorage.getItem(`pairlens:${DRAWING_RECENTS_KEY}`) ?? '[]')

beforeEach(() => {
  localStorage.clear()
})

describe('drawingToolKey', () => {
  it('is the tool type on its own', () => {
    expect(drawingToolKey('hline')).toBe('hline')
    expect(drawingToolKey('hline', {})).toBe('hline')
    expect(drawingToolKey('hline', null)).toBe('hline')
  })

  it('separates path presets, which a user reads as different tools', () => {
    expect(drawingToolKey('path', { preset: 'star' })).toBe('path:star')
    expect(drawingToolKey('path', { preset: 'diamond' })).toBe('path:diamond')
  })

  it('ignores meta that carries no preset', () => {
    expect(drawingToolKey('path', { color: '#fff' })).toBe('path')
  })
})

describe('the catalog', () => {
  it('gives every tool a distinct key', () => {
    const keys = TOOL_CATEGORIES.flatMap((c) => c.tools.map(toolKey))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('resolves every one of its own keys back to the same tool', () => {
    for (const category of TOOL_CATEGORIES) {
      for (const option of category.tools) {
        expect(findDrawingTool(toolKey(option))).toBe(option)
      }
    }
  })

  it('returns nothing for a key this build no longer ships', () => {
    expect(findDrawingTool('gone-in-a-later-release')).toBeUndefined()
  })
})

describe('trackDrawingToolUse', () => {
  it('puts the newest first', () => {
    trackDrawingToolUse('hline')
    trackDrawingToolUse('rectangle')
    expect(readRecents()).toEqual(['rectangle', 'hline'])
  })

  it('moves a repeat use back to the front instead of duplicating it', () => {
    trackDrawingToolUse('hline')
    trackDrawingToolUse('rectangle')
    trackDrawingToolUse('hline')
    expect(readRecents()).toEqual(['hline', 'rectangle'])
  })

  it('does not rewrite storage when the tool is already the newest', () => {
    trackDrawingToolUse('hline')

    // Sticky mode re-arms the active tool after every drawing; that must not
    // churn storage (or the sync bus) on every stroke.
    const write = localStorage.setItem.bind(localStorage)
    let writes = 0
    localStorage.setItem = (key: string, value: string) => {
      writes += 1
      write(key, value)
    }
    try {
      trackDrawingToolUse('hline')
    } finally {
      localStorage.setItem = write
    }

    expect(writes).toBe(0)
    expect(readRecents()).toEqual(['hline'])
  })

  it('drops the oldest past the limit', () => {
    const used = TOOL_CATEGORIES[0].tools.slice(0, DRAWING_RECENTS_LIMIT + 2)
    expect(used.length).toBeGreaterThan(DRAWING_RECENTS_LIMIT)
    for (const option of used) trackDrawingToolUse(option.tool, option.meta)

    const recents = readRecents()
    expect(recents.length).toBe(DRAWING_RECENTS_LIMIT)
    expect(recents[0]).toBe(toolKey(used[used.length - 1]))
    expect(recents).not.toContain(toolKey(used[0]))
  })

  it('keys presets separately', () => {
    trackDrawingToolUse('path', { preset: 'star' })
    trackDrawingToolUse('path', { preset: 'diamond' })
    expect(readRecents()).toEqual(['path:diamond', 'path:star'])
  })
})
