// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

/**
 * The public legal documents, served by the marketing site. Single source of
 * truth for every surface in the terminal that has to point at them (sign-in
 * consent, the analytics opt-in, Settings → Privacy, Intelligence checkout).
 *
 * These always open in the user's real browser via `openExternalUrl` — a bare
 * `target="_blank"` inside the Tauri webview risks navigating the app away
 * from itself.
 */
export const LEGAL_URLS = {
  privacy: 'https://pairlens.finance/privacy',
  terms: 'https://pairlens.finance/terms',
} as const

export type LegalDoc = keyof typeof LEGAL_URLS
