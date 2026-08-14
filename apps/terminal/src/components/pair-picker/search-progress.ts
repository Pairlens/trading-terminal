// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Is the pair search still running?
 *
 * Shared by both pair pickers — the desktop top-bar switcher and the phone's
 * pair screen — because the claim they make is the same one.
 *
 * "No pairs found" is a claim about the whole market, and the picker used to
 * make it the instant a query had no results yet — which is most of the time a
 * search is running, because the server search fans out across the catalog and
 * every DEX connector before it resolves. This is the predicate that keeps the
 * claim honest, kept out of the component so the cases can be enumerated.
 *
 * Three signals, because the picker has two different searches behind one
 * field:
 *
 *   - Two characters or more goes to the server (`isSearchActive`). It is in
 *     flight while react-query is fetching, and also while it is `pending` —
 *     which covers the beat where `useDeferredValue` has not yet handed the
 *     new query to the hook, so nothing has been requested for what the user
 *     can already see themselves typing.
 *   - One character is filtered client-side out of the instrument catalog, so
 *     what it waits on is that catalog's own first load.
 *   - No provider for `market-data:discovery:search` means the server query is
 *     never enabled and never leaves `pending`. Without this term the
 *     placeholder would stay up forever on such a build.
 */
export type SearchProgressInput = {
  /** The field has something in it. Nothing is in flight for an empty field. */
  hasQuery: boolean
  /** Query is long enough for the server search (≥ 2 chars). */
  isSearchActive: boolean
  /** A plugin answers `market-data:discovery:search`. */
  hasSearchProvider: boolean
  /** react-query: a request for the search is on the wire. */
  searchFetching: boolean
  /** react-query: the search has never resolved for this key. */
  searchPending: boolean
  /** The instrument catalog's first page has not landed. */
  catalogLoading: boolean
}

export function isSearchInFlight({
  hasQuery,
  isSearchActive,
  hasSearchProvider,
  searchFetching,
  searchPending,
  catalogLoading,
}: SearchProgressInput): boolean {
  if (!hasQuery) return false
  if (!isSearchActive) return catalogLoading
  return hasSearchProvider && (searchFetching || searchPending)
}
