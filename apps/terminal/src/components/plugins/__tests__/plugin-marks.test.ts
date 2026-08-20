// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { BUNDLED_POSTERS } from '../plugin-posters'
import { pluginBrand } from '../plugin-brand'
import { DEX_CHAINS } from '@/lib/dex/chain-catalog'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

/**
 * Every bundled plugin has to arrive at a real brand mark, and every mark the
 * map names has to be a file the terminal actually serves.
 *
 * Both halves have failed in production. `plugin-posters.ts` is generated from
 * live CDNs, so when Clearbit's logo host was retired a bare regeneration
 * dropped four entries while their PNGs stayed in `public/posters/` — the
 * store fell back to monogram tiles for plugins whose art was sitting right
 * there. And a manifest that named a lucide icon instead of an image URL
 * ('SquareFunction', 'Users') issued a request that could only 404.
 *
 * A theme is the one exception: it ships `theme.previewColors` and the store
 * renders that palette as the icon on purpose, which reads better than any
 * mark would.
 */

const PUBLIC_DIR = join(import.meta.dir, '..', '..', '..', '..', 'public')

/** A lucide name, not an image: no scheme, no extension, no leading slash. */
function looksLikeIconName(src: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(src)
}

describe('bundled plugin marks', () => {
  test('every non-theme plugin resolves a poster or an icon', () => {
    const missing = BOOTSTRAP_PLUGINS.filter(({ manifest }) => {
      if (manifest.theme?.previewColors) return false
      return !BUNDLED_POSTERS[manifest.id] && !manifest.icon
    }).map(({ manifest }) => manifest.id)

    expect(missing).toEqual([])
  })

  test('no manifest icon is a lucide name', () => {
    const named = BOOTSTRAP_PLUGINS.filter(
      ({ manifest }) => manifest.icon && looksLikeIconName(manifest.icon),
    ).map(({ manifest }) => `${manifest.id}: ${manifest.icon}`)

    expect(named).toEqual([])
  })

  test('no bundled mark is fetched from the public internet', () => {
    // A bundled plugin's mark must be in the bundle. A remote favicon is a
    // request on every store render, it is dead under the desktop CSP and
    // offline, and it tells the venue when the store was opened.
    const remote = BOOTSTRAP_PLUGINS.flatMap(({ manifest }) =>
      [manifest.icon, manifest.metadata?.logoUrl]
        .filter((src): src is string => typeof src === 'string')
        .filter((src) => /^https?:/.test(src))
        .map((src) => `${manifest.id}: ${src}`),
    )

    expect(remote).toEqual([])
  })

  test('every DEX chain mark is a file the terminal serves', () => {
    // The chain rail draws chains, not plugins: EVM entries read their mark off
    // the connector's poster, Solana has its own under /chains/. Same rule
    // either way — in the bundle, never fetched from a logo CDN.
    const bad = DEX_CHAINS.filter(
      (chain) =>
        !chain.iconUrl.startsWith('/') ||
        !existsSync(join(PUBLIC_DIR, chain.iconUrl)),
    ).map((chain) => `${chain.market}: ${chain.iconUrl}`)

    expect(bad).toEqual([])
  })

  test('every mark a manifest names is a file the terminal serves', () => {
    const dangling = BOOTSTRAP_PLUGINS.filter(
      ({ manifest }) =>
        manifest.icon?.startsWith('/') &&
        !existsSync(join(PUBLIC_DIR, manifest.icon)),
    ).map(({ manifest }) => `${manifest.id}: ${manifest.icon}`)

    expect(dangling).toEqual([])
  })

  test('every poster path is a file the terminal serves', () => {
    const dangling = Object.entries(BUNDLED_POSTERS)
      .filter(([, path]) => !existsSync(join(PUBLIC_DIR, path)))
      .map(([id, path]) => `${id} → ${path}`)

    expect(dangling).toEqual([])
  })

  test('every bundled poster is claimed by a plugin', () => {
    // The reverse of the check above: art nobody points at is dead weight in
    // the bundle, and usually means an id was renamed without regenerating.
    const claimed = new Set(Object.values(BUNDLED_POSTERS))
    const orphans = [
      ...new Bun.Glob('*.png').scanSync(join(PUBLIC_DIR, 'posters')),
    ]
      .map((file) => `/posters/${file}`)
      .filter((path) => !claimed.has(path))

    expect(orphans).toEqual([])
  })

  test('a futures venue wears its spot venue tint', () => {
    expect(
      pluginBrand('binance-futures-market-connector', 'Binance Futures'),
    ).toMatchObject({ mono: 'BN', tint: '#f0b90b' })
  })

  test('a Pairlens family plugin wears the product tint', () => {
    expect(
      pluginBrand('pairlens-predictions', 'Prediction Markets'),
    ).toMatchObject({
      mono: 'PRD',
      tint: '#3b6fed',
    })
  })
})
