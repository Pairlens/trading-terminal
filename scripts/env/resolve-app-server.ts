// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Resolve which App Server the terminal dev server should target.
 *
 * Order:
 *   1. explicit VITE_APP_SERVER_URL (shell or .env.local)
 *   2. a locally-running App Server on :4046 (auto-detected)
 *   3. Pairlens Cloud — the same hosted API the shipped app uses, so dev
 *      behaves like the real product (sign-in, news, top coins, logos)
 *      without running any server
 *
 * PAIRLENS_STANDALONE=1 short-circuits to null: fully offline dev with auth
 * off, cloud panels hidden, and local persistence only.
 */

export const LOCAL_APP_SERVER_URL = 'http://localhost:4046'
export const CLOUD_APP_SERVER_URL = 'https://api.pairlens.finance'

export async function resolveAppServerUrl(
  explicit: string | undefined,
): Promise<string | null> {
  if (process.env['PAIRLENS_STANDALONE'] === '1') return null
  if (explicit) return explicit
  try {
    await fetch(`${LOCAL_APP_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(1500),
    })
    return LOCAL_APP_SERVER_URL
  } catch {
    return CLOUD_APP_SERVER_URL
  }
}
