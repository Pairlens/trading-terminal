// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { readSearchSources } from '../assistant-sources'
import type { NormalizedToolPart } from '@/components/copilot/tool-part'

const search = (output: unknown): NormalizedToolPart => ({
  toolName: 'web_search',
  toolCallId: 'search-1',
  state: 'output-available',
  input: { query: 'anything' },
  output: output as Record<string, unknown> | undefined,
  errorText: undefined,
})

describe('readSearchSources', () => {
  test('reads url and title out of a search result', () => {
    expect(
      readSearchSources([
        search({
          results: [
            { url: 'https://example.com/a', title: 'A' },
            { url: 'https://example.com/b', title: 'B' },
          ],
        }),
      ]),
    ).toEqual([
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/b', title: 'B' },
    ])
  })

  test('ignores tools that are not searches', () => {
    const snapshot: NormalizedToolPart = {
      ...search({ results: [{ url: 'https://example.com/a', title: 'A' }] }),
      toolName: 'get_market_snapshot',
    }
    expect(readSearchSources([snapshot])).toEqual([])
  })

  test('survives a half-streamed output', () => {
    // Output is undefined until the call settles, and a partial object is
    // the normal state of the world for most of a run.
    expect(readSearchSources([search(undefined)])).toEqual([])
    expect(readSearchSources([search({})])).toEqual([])
    expect(readSearchSources([search({ results: 'not-an-array' })])).toEqual([])
  })

  test('drops entries that are not usable links', () => {
    expect(
      readSearchSources([
        search({
          results: [
            null,
            'nope',
            { url: 'javascript:alert(1)', title: 'xss' },
            { url: 'ftp://example.com', title: 'wrong scheme' },
            { url: 'https://example.com/ok', title: 'ok' },
          ],
        }),
      ]),
    ).toEqual([{ url: 'https://example.com/ok', title: 'ok' }])
  })

  test('falls back to the url when a result has no title', () => {
    expect(
      readSearchSources([search({ results: [{ url: 'https://x.dev/a' }] })]),
    ).toEqual([{ url: 'https://x.dev/a', title: 'https://x.dev/a' }])
  })

  test('deduplicates across several searches in one turn', () => {
    const first = search({
      results: [{ url: 'https://example.com/a', title: 'A' }],
    })
    const second = search({
      results: [
        { url: 'https://example.com/a', title: 'A again' },
        { url: 'https://example.com/c', title: 'C' },
      ],
    })
    expect(readSearchSources([first, second])).toEqual([
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/c', title: 'C' },
    ])
  })
})
