// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pinned plugin publisher public keys.
 *
 * The terminal only accepts registry plugin modules whose detached Ed25519
 * signature verifies against one of these keys (see plugin-signing.ts).
 * Pinning the keys in the app — rather than fetching them from the registry —
 * is the point: a compromised registry cannot mint a key the terminal trusts.
 *
 * Key format: base64 of the raw 32-byte Ed25519 public key, keyed by a stable
 * key id that publishers reference as `publisherKeyId`.
 */

/** Production publisher keys. Add new keys here as publishers are onboarded. */
export const OFFICIAL_PUBLISHER_KEYS: Readonly<Record<string, string>> = {
  // Pairlens' own publishing key. The private half lives only in the official
  // registry's deployment environment (REGISTRY_SIGNING_KEY) — never in git.
  'pairlens-official-2026': 'N4uEJoOX27yDpcdKcNcZBV+J+C+3VW/mEdzDk93TAHo=',
}

/**
 * Community publisher keys — a SEPARATE trust tier from the official keys.
 *
 * Community plugins live as source in `apps/registry/community/`, are built
 * and signed by the official registry at startup, and install with one click —
 * but the terminal treats anything signed by a community key as
 * **sandbox-only**: it never offers the full-trust grant, so community code
 * can never reach the main realm, credentials, or order routing.
 *
 * The private half lives only in the official registry's deployment
 * environment (REGISTRY_COMMUNITY_SIGNING_KEY) — never in git.
 */
export const COMMUNITY_PUBLISHER_KEYS: Readonly<Record<string, string>> = {
  'pairlens-community-2026': 'KuZU41kfotFyUtDVj08hrYcb7KCMVNmd3L/E0/TdiMk=',
}

/**
 * Development publisher key. The matching private key is COMMITTED at
 * apps/registry/keys/dev-publisher.key so any local registry can sign its
 * catalog — it must therefore never be trusted by production builds. The
 * terminal includes it in the pinned set only when running a dev build.
 */
export const DEV_PUBLISHER_KEY_ID = 'pairlens-dev'
export const DEV_PUBLISHER_PUBLIC_KEY =
  'm0XFQq+Ztj2LBHJ7tGa28ABdiuSmrswyVWQG701upQc='

/**
 * Development community key — same committed-on-purpose model as the dev
 * publisher key (apps/registry/keys/dev-community.key), but resolved to the
 * community tier so the sandbox-only restriction is exercised in dev too.
 */
export const DEV_COMMUNITY_PUBLISHER_KEY_ID = 'pairlens-community-dev'
export const DEV_COMMUNITY_PUBLISHER_PUBLIC_KEY =
  'UGsXgrJnlAT+U6CFydut2YCaiEjKsmic7AkbqIxNuJE='

// ── Trust tiers ─────────────────────────────────────────────────────

/**
 * Trust tier of a pinned publisher key.
 * - 'official'  — Pairlens keys, build-time extra keys, and runtime
 *   user-trusted keys. Eligible for an explicit full-trust grant.
 * - 'community' — keys that sign repo-submitted community plugins. Plugins
 *   signed by these keys are permanently sandbox-only.
 */
export type PublisherKeyTier = 'official' | 'community'

/**
 * Resolve the trust tier for a publisher key id. Anything not explicitly
 * registered as a community key is 'official' — the restriction attaches to
 * the community tier, so an unknown id must not accidentally land in it and
 * an unknown id is refused by signature verification anyway.
 */
export function publisherKeyTier(keyId: string): PublisherKeyTier {
  return keyId in COMMUNITY_PUBLISHER_KEYS ||
    keyId === DEV_COMMUNITY_PUBLISHER_KEY_ID
    ? 'community'
    : 'official'
}
