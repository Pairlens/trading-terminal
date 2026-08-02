// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * First-run onboarding state. The `/onboarding` route owns the experience;
 * `_terminal`'s beforeLoad gates the app shell on completion. Section tours
 * (`use-section-tour.ts`) and the settings "replay" action share these keys.
 */

export const ONBOARDING_KEY = 'pairlens:onboarding-completed'
const SELECTIONS_KEY = 'pairlens:onboarding-selections'
const LEGAL_ACK_KEY = 'pairlens:legal-acknowledged'

/** Bump when the acknowledgment copy changes materially. */
export const LEGAL_VERSION = 1

export type OnboardingAssetClass = 'cex' | 'dex' | 'equities'
export type OnboardingExperience = 'beginner' | 'intermediate' | 'pro'
export type OnboardingRisk = 'conservative' | 'balanced' | 'aggressive'

export type OnboardingSelections = {
  language?: string
  /** ISO 3166-1 alpha-2; '' means explicitly global. See lib/countries.ts. */
  country?: string
  currency?: string
  assetClasses: Array<OnboardingAssetClass>
  venues: Array<string>
  experience?: OnboardingExperience
  risk?: OnboardingRisk
  theme: 'light' | 'dark'
  /** Opt-in product analytics; undefined = step never answered (off). */
  analytics?: 'enabled' | 'disabled'
}

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return true // storage unavailable — never trap the user on the onboarding page
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1')
  } catch {
    // Ignore storage errors (quota, private browsing).
  }
}

export function saveOnboardingSelections(
  selections: OnboardingSelections,
): void {
  try {
    localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selections))
  } catch {
    // Ignore storage errors.
  }
}

export function loadOnboardingSelections(): OnboardingSelections | null {
  try {
    const raw = localStorage.getItem(SELECTIONS_KEY)
    return raw ? (JSON.parse(raw) as OnboardingSelections) : null
  } catch {
    return null
  }
}

export function markLegalAcknowledged(): void {
  try {
    localStorage.setItem(
      LEGAL_ACK_KEY,
      JSON.stringify({ version: LEGAL_VERSION, at: new Date().toISOString() }),
    )
  } catch {
    // Ignore storage errors.
  }
}
