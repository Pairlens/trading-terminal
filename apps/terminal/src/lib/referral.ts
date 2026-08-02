// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Referral attribution
//
// When a Pairlens affiliate shares the app (web link or deep link carrying
// `?ref=<code>`), we persist the code locally. The Accounts page then asks
// the App Server to resolve venue signup links with that code, so the
// affiliate's own referral URLs are honored for the venues they claimed.
// Purely additive: no code → Pairlens' own links → untagged defaults.
// ---------------------------------------------------------------------------

import { AFFILIATE_CODE_PATTERN } from '@pairlens/shared/affiliates'

const STORAGE_KEY = 'pairlens.referral-code'

export function getReferralCode(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const code = window.localStorage.getItem(STORAGE_KEY)
    return code && AFFILIATE_CODE_PATTERN.test(code) ? code : null
  } catch {
    return null
  }
}

export function setReferralCode(raw: string): boolean {
  const code = raw.trim().toLowerCase()
  if (!AFFILIATE_CODE_PATTERN.test(code)) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, code)
    return true
  } catch {
    return false
  }
}

/**
 * Captures `?ref=<code>` from the current URL (first-touch: an already-stored
 * code is kept). Call once on app mount.
 */
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (!ref || getReferralCode()) return
    setReferralCode(ref)
  } catch {
    // Attribution is best-effort — never let it interfere with startup
  }
}
