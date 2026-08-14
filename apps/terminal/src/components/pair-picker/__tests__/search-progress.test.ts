// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { isSearchInFlight } from '../search-progress'
import type { SearchProgressInput } from '../search-progress'

/** Settled server search with results — the state "No pairs found" is for. */
const SETTLED: SearchProgressInput = {
  hasQuery: true,
  isSearchActive: true,
  hasSearchProvider: true,
  searchFetching: false,
  searchPending: false,
  catalogLoading: false,
}

const at = (patch: Partial<SearchProgressInput>) =>
  isSearchInFlight({ ...SETTLED, ...patch })

describe('isSearchInFlight', () => {
  it('is false for an empty field, whatever else is loading', () => {
    expect(
      at({
        hasQuery: false,
        searchFetching: true,
        searchPending: true,
        catalogLoading: true,
      }),
    ).toBe(false)
  })

  it('is true while the server search is on the wire', () => {
    expect(at({ searchFetching: true })).toBe(true)
  })

  it('is true before the deferred query reaches the hook', () => {
    // `enabled` is still false for the new key, so nothing is fetching yet and
    // the query has never resolved. Reporting "no results" here is the bug.
    expect(at({ searchFetching: false, searchPending: true })).toBe(true)
  })

  it('is false once the server search has settled', () => {
    expect(at({})).toBe(false)
  })

  it('never waits on a search no plugin can answer', () => {
    expect(
      at({
        hasSearchProvider: false,
        searchPending: true,
        searchFetching: true,
      }),
    ).toBe(false)
  })

  it('waits on the catalog for the one-character client filter', () => {
    expect(at({ isSearchActive: false, catalogLoading: true })).toBe(true)
    expect(at({ isSearchActive: false, catalogLoading: false })).toBe(false)
  })

  it('ignores the server query state for a one-character filter', () => {
    expect(
      at({
        isSearchActive: false,
        catalogLoading: false,
        searchPending: true,
        searchFetching: true,
      }),
    ).toBe(false)
  })
})
