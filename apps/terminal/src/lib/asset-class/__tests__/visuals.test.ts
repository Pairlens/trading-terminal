// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset-class table is a promise about colour: one hue per class, the same
 * one on every surface. These tests are what keep that promise checkable —
 * a sixth class added without a colour, or two classes sharing a token, would
 * otherwise only show up as two tabs that look alike.
 *
 * It also walks the translation keys the table names, because they are the
 * kind the i18n orphan audit can see but the static-usage audit cannot prove
 * resolve: they reach `t()` through a field, never as a literal argument.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { ASSET_CLASS_VISUALS, assetClassVisual } from '../visuals'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import { DISCOVERY_SECTIONS } from '@/lib/layout/workspaces/discovery-sections'

const EN = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '..',
      '..',
      '..',
      'locales',
      'en',
      'translation.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      EN,
    )
}

describe('asset-class visuals', () => {
  test('every instrument class has an entry', () => {
    for (const cls of INSTRUMENT_CLASSES) {
      expect(assetClassVisual(cls)).toBeDefined()
    }
    expect(Object.keys(ASSET_CLASS_VISUALS).sort()).toEqual(
      [...INSTRUMENT_CLASSES].sort(),
    )
  })

  test('no two classes share a colour', () => {
    const texts = Object.values(ASSET_CLASS_VISUALS).map((v) => v.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  test('every class paints itself with its own token', () => {
    for (const [cls, visual] of Object.entries(ASSET_CLASS_VISUALS)) {
      const token = `asset-${cls}`
      expect(visual.text).toBe(`text-${token}`)
      expect(visual.bg).toContain(`bg-${token}/`)
      expect(visual.border).toContain(`border-${token}/`)
      expect(visual.activeBg).toContain(`bg-${token}/`)
    }
  })

  test('every class names an icon and three real translation keys', () => {
    for (const visual of Object.values(ASSET_CLASS_VISUALS)) {
      expect(visual.icon.length).toBeGreaterThan(0)
      for (const key of [
        visual.labelKey,
        visual.nameKey,
        visual.descriptionKey,
      ]) {
        expect(typeof lookup(key)).toBe('string')
      }
    }
  })

  test('the detail strings the market badge derives are translated', () => {
    for (const key of [
      'assetClass.binary',
      'assetClass.multiOutcome',
      'session.statePre',
      'session.statePost',
      'session.stateClosed',
    ]) {
      expect(typeof lookup(key)).toBe('string')
    }
  })
})

/**
 * The hues themselves, read out of the stylesheet that declares them. A class
 * owning its own token is not the same promise as a class owning its own
 * COLOUR: memecoins and NFTs shipped 2 degrees apart, each with a token of its
 * own, and every existing test passed while the two newest classes were the
 * two nobody could tell apart at badge size.
 */
const STYLES = readFileSync(
  join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'packages',
    'ui',
    'src',
    'styles.css',
  ),
  'utf8',
)

/** Every `--asset-<class>: oklch(L C H)` declaration, in source order. */
function assetHues(): Array<Array<[InstrumentClass, number]>> {
  const blocks: Array<Array<[InstrumentClass, number]>> = []
  const pattern =
    /--asset-([a-z]+):\s*oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)\s*\)/g
  let current: Array<[InstrumentClass, number]> = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(STYLES))) {
    const cls = match[1] as InstrumentClass
    if (current.some(([seen]) => seen === cls)) {
      blocks.push(current)
      current = []
    }
    current.push([cls, Number(match[2])])
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

/** Shortest way round the colour wheel, in degrees. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/**
 * The floor the palette actually holds, not an aspiration: memecoin (118) to
 * stocks (158) is the tightest pair, and dropping below this means a new class
 * crowded an existing one rather than taking free space on the wheel.
 */
const MIN_HUE_SEPARATION = 40

/** What two hues owe each other when they sit adjacent in the Discovery strip. */
const MIN_NEIGHBOUR_SEPARATION = 50

describe('asset-class hues', () => {
  test('light and dark both declare a hue for every class', () => {
    const blocks = assetHues()
    expect(blocks.length).toBe(2)
    for (const block of blocks) {
      expect(block.map(([cls]) => cls).sort()).toEqual(
        [...INSTRUMENT_CLASSES].sort(),
      )
    }
  })

  test('no two classes read alike at badge size', () => {
    // Collected rather than asserted in the loop, so a failure names the pair
    // that collided instead of only the degree count that was too small.
    const crowded: Array<string> = []
    for (const block of assetHues()) {
      for (let i = 0; i < block.length; i++) {
        for (let j = i + 1; j < block.length; j++) {
          const [a, hueA] = block[i]
          const [b, hueB] = block[j]
          const gap = hueDistance(hueA, hueB)
          if (gap < MIN_HUE_SEPARATION) crowded.push(`${a}/${b}: ${gap}deg`)
        }
      }
    }
    expect(crowded).toEqual([])
  })

  test('a class keeps its hue between light and dark', () => {
    const [light, dark] = assetHues()
    const byClass = new Map(dark)
    for (const [cls, hue] of light) {
      expect(hueDistance(hue, byClass.get(cls) ?? 999)).toBeLessThanOrEqual(10)
    }
  })

  test('the tabs that ship side by side are not the closest hues', () => {
    // The Discovery strip is the one surface that reads all seven at once, so
    // neighbours there answer to a higher floor than the palette's own. This
    // is why equities ships second: lime beside emerald was legible in
    // isolation and muddy touching.
    const hues = new Map(assetHues()[0])
    const touching: Array<string> = []
    for (let i = 1; i < DISCOVERY_SECTIONS.length; i++) {
      const a = DISCOVERY_SECTIONS[i - 1].id
      const b = DISCOVERY_SECTIONS[i].id
      const gap = hueDistance(hues.get(a) ?? 0, hues.get(b) ?? 0)
      if (gap < MIN_NEIGHBOUR_SEPARATION) touching.push(`${a}/${b}: ${gap}deg`)
    }
    expect(touching).toEqual([])
  })
})
