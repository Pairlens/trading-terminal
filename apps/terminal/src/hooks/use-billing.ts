// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { INTELLIGENCE_PLANS } from '@pairlens/shared/billing-types'
import type {
  CreditPackId,
  IntelligencePlanId,
} from '@pairlens/shared/billing-types'
import { api, queryKeys } from '@/lib/api'
import { hasAppServer } from '@/lib/auth-client'
import { useOptimisticSession } from '@/lib/session'
import { openExternalUrl } from '@/lib/platform'

// ---------------------------------------------------------------------------
// Pairlens Intelligence billing state + checkout/portal actions.
//
// Checkout and the customer portal are hosted Polar pages opened in the
// system browser (never the app webview). While the user pays over there,
// nothing signals this window directly — so the state query refetches on
// window focus, and a plan/status transition re-syncs plugin entitlements via
// the 'pairlens:entitlements-changed' event (pairlens-provider listens).
// ---------------------------------------------------------------------------

export function useBillingState() {
  const { session } = useOptimisticSession()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.billingState(),
    queryFn: api.getBillingState,
    enabled: hasAppServer && !!session,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // Announce subscription transitions so the capability gates react without
  // a reload (e.g. the user comes back from Polar checkout) — and make the
  // payment moments visible: checkout happens in another browser, so these
  // toasts ARE the in-app payment confirmation (for both subscriptions and
  // one-time credit packs, which change the pack count, not the plan).
  const previousRef = useRef<{
    plan: string
    status: string
    packCount: number
  } | null>(null)
  const plan = query.data?.plan ?? null
  const status = query.data?.status ?? null
  const packCount = query.data?.packs?.length ?? 0
  useEffect(() => {
    if (!status) return
    const previous = previousRef.current
    previousRef.current = { plan: plan ?? 'none', status, packCount }
    if (!previous) return

    if (previous.plan !== (plan ?? 'none') || previous.status !== status) {
      window.dispatchEvent(new CustomEvent('pairlens:entitlements-changed'))
      void queryClient.invalidateQueries({ queryKey: queryKeys.entitlements() })
      if (previous.plan === 'none' && plan) {
        // Fixed id: several components use this hook — one toast, not three.
        toast.success(`${INTELLIGENCE_PLANS[plan].label} is active`, {
          id: 'intelligence-activated',
          description: `Welcome aboard — ${INTELLIGENCE_PLANS[
            plan
          ].monthlyCredits.toLocaleString()} credits are ready. Your copilot and research desk are unlocked.`,
          duration: 8000,
        })
      }
    } else if (packCount > previous.packCount) {
      toast.success('Extra credits added', {
        id: 'intelligence-pack-added',
        description:
          'Your credit pack is on the balance — pack credits expire 30 days after purchase.',
        duration: 8000,
      })
    }
  }, [plan, status, packCount, queryClient])

  return query
}

/** Open the hosted Polar checkout for a plan in the system browser. */
export function useIntelligenceCheckout() {
  return useMutation({
    mutationFn: async (plan: IntelligencePlanId) => {
      const { url } = await api.createBillingCheckout(plan)
      await openExternalUrl(url)
    },
  })
}

/** Open the hosted checkout for a one-time credit pack (Max plan only). */
export function usePackCheckout() {
  return useMutation({
    mutationFn: async (pack: CreditPackId) => {
      const { url } = await api.createBillingPackCheckout(pack)
      await openExternalUrl(url)
    },
  })
}

/** Open the pre-authenticated Polar customer portal in the system browser. */
export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await api.createBillingPortal()
      await openExternalUrl(url)
    },
  })
}
