// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  TERMINAL_PAGES,
  TERMINAL_PAGE_IDS,
  pageForPath,
  pageLink,
  parseEntityId,
} from '../pages'

describe('parseEntityId', () => {
  test('accepts every id shape the terminal mints', () => {
    for (const id of [
      '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b', // crypto.randomUUID
      'k3n8x1qz', // base-36 script id
      'okx-market-connector',
      'template:prediction-discovery',
      'spot',
    ]) {
      expect(parseEntityId(id)).toBe(id)
    }
  })

  test('refuses anything that could smuggle a path or a query', () => {
    for (const bad of [
      '../accounts',
      'a/b',
      'a?b=c',
      'a b',
      '#hash',
      '',
      42,
      null,
      undefined,
      'x'.repeat(200),
    ]) {
      expect(parseEntityId(bad)).toBeUndefined()
    }
  })
})

describe('pageLink', () => {
  test('opens a page on the exact record the assistant named', () => {
    expect(pageLink('workflows', 'wf-1')).toBe('/workflows?workflow=wf-1')
    expect(pageLink('bots', 'b-1')).toBe('/bots?bot=b-1')
    expect(pageLink('notifications', 'r-1')).toBe('/notifications?alert=r-1')
    expect(pageLink('indicators', 's-1')).toBe('/indicators?script=s-1')
    expect(pageLink('discovery', 'prediction')).toBe('/?section=prediction')
  })

  test('falls back to the page when there is no usable target', () => {
    expect(pageLink('workflows')).toBe('/workflows')
    expect(pageLink('workflows', null)).toBe('/workflows')
    // A page that shows no single record ignores one entirely.
    expect(pageLink('accounts', 'okx')).toBe('/accounts')
    // Landing on the page beats encoding a target that cannot be real.
    expect(pageLink('workflows', '../../etc')).toBe('/workflows')
  })
})

describe('pageForPath', () => {
  test('reads an address back to the page it belongs to', () => {
    expect(pageForPath('/')).toBe('discovery')
    expect(pageForPath('/workflows')).toBe('workflows')
    expect(pageForPath('/bots')).toBe('bots')
  })

  test('longest prefix wins, so the workspace store is not a workspace', () => {
    expect(pageForPath('/workspace-store')).toBe('workspaceStore')
    expect(pageForPath('/workspace/abc')).toBe(null)
  })

  test('an unknown address is not forced into a page', () => {
    expect(pageForPath('/pair/BTC-USDT')).toBe(null)
    expect(pageForPath('/spot/okx/BTC-USDT')).toBe(null)
  })
})

describe('the page table itself', () => {
  test('every page has a target param iff it has a target label and noun', () => {
    for (const id of TERMINAL_PAGE_IDS) {
      const page = TERMINAL_PAGES[id]
      const parts = [page.targetParam, page.targetLabel, page.targetNoun]
      expect(parts.every(Boolean) || parts.every((p) => p === undefined)).toBe(
        true,
      )
    }
  })

  test('every page names a suggestion and a screen sentence', () => {
    for (const id of TERMINAL_PAGE_IDS) {
      expect(TERMINAL_PAGES[id].suggestion.length).toBeGreaterThan(0)
      expect(TERMINAL_PAGES[id].screen.length).toBeGreaterThan(0)
    }
  })
})
