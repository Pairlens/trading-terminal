// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  CREDIT_PACKS,
  CREDIT_PACK_EXPIRY_DAYS,
  INTELLIGENCE_PLANS,
  isCreditPackId,
} from '@pairlens/shared/billing-types'
import type {
  CreditPackId,
  IntelligencePlanId,
} from '@pairlens/shared/billing-types'

// Post-checkout landing — where Stripe redirects after a successful payment.
//
// Standalone on purpose: checkout usually completes in the system browser
// (the desktop app opens Stripe externally), so this page may load in a
// browser with no Pairlens state at all. It must NOT sit inside the
// _terminal layout, whose first-run gate would bounce a fresh profile to
// /onboarding — turning the "you just paid" moment into a setup wizard.
//
// The page only celebrates and points back to the app; activation itself is
// pull-based (the terminal refetches billing state on window focus).

type CheckoutSuccessSearch = {
  plan?: IntelligencePlanId
  pack?: CreditPackId
}

export const Route = createFileRoute('/checkout/success')({
  validateSearch: (search): CheckoutSuccessSearch => {
    const plan = search['plan']
    if (plan === 'pro' || plan === 'max') return { plan }
    const pack = search['pack']
    if (isCreditPackId(pack)) return { pack }
    return {}
  },
  component: CheckoutSuccessPage,
})

function CheckoutSuccessPage() {
  const { t } = useTranslation()
  const { plan: planId, pack: packId } = Route.useSearch()
  const plan = planId ? INTELLIGENCE_PLANS[planId] : null
  const pack = packId ? CREDIT_PACKS[packId] : null

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6">
      {/* The one magic surface — same seam the copilot wears. */}
      <div className="magic-gradient pointer-events-none absolute inset-x-0 top-0 h-[3px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 0%, color-mix(in oklch, var(--magic-1) 14%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <div className="relative mb-6">
          <AiOrb size="96px" />
          <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Check className="size-4.5" strokeWidth={3} />
          </span>
        </div>

        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {t('routes.checkoutSuccess.paymentComplete')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {pack
            ? t('routes.checkoutSuccess.titlePack', {
                credits: pack.credits.toLocaleString('en-US'),
              })
            : plan
              ? t('routes.checkoutSuccess.titlePlan', { label: plan.label })
              : t('routes.checkoutSuccess.titleDefault')}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {pack
            ? t('routes.checkoutSuccess.bodyPack', {
                days: CREDIT_PACK_EXPIRY_DAYS,
              })
            : plan
              ? t('routes.checkoutSuccess.bodyPlanWithCredits', {
                  credits: plan.monthlyCredits.toLocaleString('en-US'),
                })
              : t('routes.checkoutSuccess.bodyPlanNoCredits')}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="gap-2"
            nativeButton={false}
            render={<Link to="/" />}
          >
            {t('routes.checkoutSuccess.openTerminal')}
            <ArrowRight className="size-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('routes.checkoutSuccess.closeTabHint')}
          </p>
        </div>

        <p className="mt-10 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          {t('routes.checkoutSuccess.receiptHint')}
        </p>
      </div>
    </div>
  )
}
