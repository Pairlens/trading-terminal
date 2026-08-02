// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Publisher keys the terminal trusts for plugin signature verification.
 *
 * - Production keys are pinned in @pairlens/shared/publisher-keys.
 * - The committed dev key is trusted only in dev builds (`import.meta.env.DEV`)
 *   so a local registry can sign its catalog.
 * - Self-hosters can extend the set at build time with
 *   `VITE_EXTRA_PUBLISHER_KEYS="keyId:base64RawEd25519,..."`.
 * - Users can trust additional publishers at runtime via Settings → Plugins
 *   (consent-gated, local-only; see custom-publisher-keys.ts). Built-in and
 *   build-time keys always win — a runtime key can never shadow their ids.
 */
import {
  COMMUNITY_PUBLISHER_KEYS,
  DEV_COMMUNITY_PUBLISHER_KEY_ID,
  DEV_COMMUNITY_PUBLISHER_PUBLIC_KEY,
  DEV_PUBLISHER_KEY_ID,
  DEV_PUBLISHER_PUBLIC_KEY,
  OFFICIAL_PUBLISHER_KEYS,
} from '@pairlens/shared/publisher-keys'

import { getCustomPublisherKeys } from './custom-publisher-keys'

export function getPinnedPublisherKeys(): Record<string, string> {
  // Community keys are pinned alongside official ones but resolve to the
  // 'community' tier (publisherKeyTier), which the loader clamps to
  // sandbox-only execution.
  const keys: Record<string, string> = {
    ...OFFICIAL_PUBLISHER_KEYS,
    ...COMMUNITY_PUBLISHER_KEYS,
  }

  if (import.meta.env.DEV) {
    keys[DEV_PUBLISHER_KEY_ID] = DEV_PUBLISHER_PUBLIC_KEY
    keys[DEV_COMMUNITY_PUBLISHER_KEY_ID] = DEV_COMMUNITY_PUBLISHER_PUBLIC_KEY
  }

  const extra = import.meta.env.VITE_EXTRA_PUBLISHER_KEYS as string | undefined
  if (extra) {
    for (const part of extra.split(',')) {
      const idx = part.indexOf(':')
      if (idx <= 0) continue
      const id = part.slice(0, idx).trim()
      const key = part.slice(idx + 1).trim()
      if (id && key) keys[id] = key
    }
  }

  // Runtime-trusted keys last, and never overriding a built-in id.
  for (const entry of getCustomPublisherKeys()) {
    if (!(entry.id in keys)) keys[entry.id] = entry.publicKey
  }

  return keys
}
