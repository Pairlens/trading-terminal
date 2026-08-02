// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Copy and derived numbers for /affiliates. Everything countable is read off
// the shared affiliate catalog (the same module that validates codes and builds
// the links), so the page can never advertise a venue count or a tier cap that
// the routing code disagrees with.
import {
  AFFILIATE_TIER_LIMITS,
  AFFILIATE_VENUES,
} from '@pairlens/shared/affiliates'

/** Venues an affiliate can actually claim: the ones with a code-based program. */
export const CLAIMABLE_VENUES = AFFILIATE_VENUES.filter((v) => v.referral)

/** The rest. Named on the page so the gap is stated rather than glossed over. */
export const UNCLAIMABLE_VENUES = AFFILIATE_VENUES.filter((v) => !v.referral)

/**
 * The tier ladder. Each tier answers the same three questions in the same
 * order — who it's for, what it takes, how it switches on — so the conditions
 * read as a comparison, not three paragraphs of prose.
 */
export const TIERS = [
  {
    name: 'Bronze',
    cap: AFFILIATE_TIER_LIMITS.bronze,
    accent: 'var(--pl-orange)',
    badge: 'Free · no code',
    audience: 'Anyone with a link worth sharing.',
    requirement: 'Nothing. No code, no application, no follower count.',
    activation: 'Just pick your venues in the claim form below.',
  },
  {
    name: 'Silver',
    cap: AFFILIATE_TIER_LIMITS.silver,
    accent: 'var(--pl-cyan)',
    badge: 'Invite code',
    audience: 'Creators and communities already sending traders our way.',
    requirement: 'A Silver code. DM @pairlens on X and ask for one.',
    activation: 'Paste the code into step 1 of the claim form.',
  },
  {
    name: 'Gold',
    cap: AFFILIATE_TIER_LIMITS.gold,
    accent: 'var(--pl-amber)',
    badge: 'Invite code · 100k+',
    audience: 'Audiences big enough to move the whole board.',
    requirement: 'A Gold code, reserved for reaches of 100k+ followers.',
    activation: 'Paste the code into step 1 of the claim form.',
  },
] as const

/** The widest cap on the ladder — the slot meters render against this. */
export const MAX_CAP = Math.max(...TIERS.map((t) => t.cap))
