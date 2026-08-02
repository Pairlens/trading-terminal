// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Community-tier resolution for registry entries.
 *
 * Community plugins (repo-submitted, built + signed by the registry's
 * community key) are permanently sandbox-only — the terminal never offers
 * them the full-trust grant. Two signals mark an entry as community:
 *
 * - `publisherKeyId` resolving to the community tier — the SECURITY signal,
 *   because the loader verifies the module bytes against that exact pinned
 *   key before evaluating them (and clamps execution to the sandbox).
 * - the catalog's `tier` field — unsigned DISPLAY metadata.
 *
 * For gating we accept either (restriction can only get stricter); a registry
 * lying about either field can only deny privileges, never gain them.
 */
import { publisherKeyTier } from '@pairlens/shared/publisher-keys'

export function isCommunityEntry(entry: {
  tier?: 'official' | 'community'
  publisherKeyId?: string
}): boolean {
  if (entry.tier === 'community') return true
  return entry.publisherKeyId
    ? publisherKeyTier(entry.publisherKeyId) === 'community'
    : false
}
