// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { track } from '@/lib/analytics-events'

const COUNTRY_KEY = 'pairlens:country'

/** Get the user's selected country code (ISO 3166-1 alpha-2). */
export function getCountrySetting(): string {
  return localStorage.getItem(COUNTRY_KEY) ?? ''
}

/** Set the user's country code. */
export function setCountrySetting(country: string): void {
  localStorage.setItem(COUNTRY_KEY, country)
  track('region_changed', { country })
}

/** Whether the user has explicitly set a country. */
export function isCountrySet(): boolean {
  return Boolean(localStorage.getItem(COUNTRY_KEY))
}

/** Short display label for the connection indicator. */
export function getCountryLabel(code: string): string | null {
  if (!code) return null
  return code.toUpperCase()
}

// Legacy compat — old code references these
export const getRegionSetting = (_market: string) => ''
export const setRegionSetting = (_market: string, _region: string) => {}
export const markRegionExplicitlySet = () => {}
export const isRegionExplicitlySet = () => isCountrySet()
export const getActiveRegionHint = () => getCountrySetting() || null
export const getRegionLabel = getCountryLabel
export const setAllRegions = (region: string) => {
  const map: Record<string, string> = { us: 'US', eu: 'DE', global: '' }
  setCountrySetting(map[region] ?? '')
}
