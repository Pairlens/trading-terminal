// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useBillingState } from '@/hooks/use-billing'

/**
 * Render-null global subscriber that keeps the Intelligence billing state
 * mounted for the whole terminal session. This is what makes returning from
 * a Stripe checkout (completed in the system browser) feel instant: the query
 * refetches on window focus, and its plan-transition effect re-syncs
 * entitlements and fires the activation toast — regardless of which panels
 * happen to be open. Signed-out / standalone sessions keep the query
 * disabled, so this costs nothing there.
 */
export function BillingStateSync() {
  useBillingState()
  return null
}
