// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AccountDeletionSummary } from '@pairlens/shared/account-types'
import type { SavedFile } from '@/lib/save-file'
import { api, clearSessionCache } from '@/lib/api'
import { authClient, clearStoredAuthToken } from '@/lib/auth-client'
import { identifyAnalyticsUser } from '@/lib/analytics'
import { saveToDownloads } from '@/lib/save-file'

// ---------------------------------------------------------------------------
// Account self-service — the in-app side of the GDPR rights the privacy
// policy promises: Art. 20 portability (export) and Art. 17 erasure (delete).
//
// Both only reach data the App Server holds. Local-only data — exchange API
// keys, wallet secrets, anything never synced — lives on this device and is
// untouched by either call; the UI says so.
// ---------------------------------------------------------------------------

function exportFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `pairlens-account-export-${stamp}.json`
}

/**
 * Download the account export as a JSON file. Resolves with where it landed
 * (an absolute path on desktop, `null` in the browser).
 */
export function useAccountExport() {
  return useMutation<SavedFile>({
    mutationFn: async () => {
      const json = await api.exportAccountData()
      const bytes = new TextEncoder().encode(json)
      return saveToDownloads(bytes, exportFileName(), 'application/json')
    },
  })
}

/**
 * Erase the account, then tear down the local session.
 *
 * The server has already revoked every session by the time this resolves, so
 * `signOut` is best-effort cleanup of client state — a 401 from it is the
 * expected outcome, not a failure worth surfacing.
 */
export function useAccountDeletion() {
  const queryClient = useQueryClient()

  return useMutation<AccountDeletionSummary>({
    mutationFn: async () => {
      const summary = await api.deleteAccount()
      clearSessionCache()
      clearStoredAuthToken()
      // Drop the device-side analytics identity. The server erased the person
      // in PostHog; without this the local SDK would keep capturing under the
      // deleted account's distinct id and rebuild it.
      identifyAnalyticsUser(null)
      await authClient.signOut().catch(() => undefined)
      queryClient.clear()
      return summary
    },
  })
}
