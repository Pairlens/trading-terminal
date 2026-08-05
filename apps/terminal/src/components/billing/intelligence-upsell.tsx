// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Trans, useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { Check, ExternalLink, Sparkles } from 'lucide-react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import {
  CREDIT_PACKS,
  CREDIT_PACK_IDS,
  INTELLIGENCE_PLANS,
} from '@pairlens/shared/billing-types'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'

import type {
  BillingErrorCode,
  IntelligencePlanId,
} from '@pairlens/shared/billing-types'
import { track } from '@/lib/analytics-events'
import { LegalNotice } from '@/components/legal-links'
import {
  useBillingPortal,
  useBillingState,
  useIntelligenceCheckout,
  usePackCheckout,
} from '@/hooks/use-billing'

// ---------------------------------------------------------------------------
// Pairlens Intelligence upsell surfaces
//
// Shown wherever hosted AI is gated: the copilot/research panes when the
// signed-in user has no Intelligence subscription, and inline when a request
// comes back with a typed billing 402. Checkout opens in the system browser;
// the billing state query picks the new subscription up on window focus.
// ---------------------------------------------------------------------------

const PLAN_ORDER: Array<IntelligencePlanId> = ['pro', 'max']

function formatCredits(credits: number): string {
  return credits.toLocaleString('en-US')
}

export function IntelligencePlanButtons({
  size = 'default',
}: {
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation()
  const checkout = useIntelligenceCheckout()

  const subscribe = (plan: IntelligencePlanId) => {
    checkout.mutate(plan, {
      onSuccess: () => {
        toast.info(t('intelligence.upsell.checkoutOpenedTitle'), {
          description: t('intelligence.upsell.checkoutActivates'),
        })
      },
      onError: () => {
        toast.error(t('intelligence.upsell.checkoutStartError'))
      },
    })
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {PLAN_ORDER.map((planId, index) => {
        const plan = INTELLIGENCE_PLANS[planId]
        return (
          <Button
            key={planId}
            size={size}
            variant={index === 0 ? 'default' : 'outline'}
            className="w-full justify-between gap-3"
            disabled={checkout.isPending}
            onClick={() => subscribe(planId)}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" />
              {plan.label}
            </span>
            <span className="tabular-nums">
              {t('intelligence.upsell.priceMonthly', {
                price: plan.priceUsdMonthly,
              })}
            </span>
          </Button>
        )
      })}
      <p className="text-center text-[10px] text-muted-foreground">
        {t('intelligence.upsell.taxNotice')}
      </p>
      <LegalNotice kind="checkout" className="text-center text-[10px]" />
    </div>
  )
}

/**
 * Pane-scale gate for signed-in users without an Intelligence subscription
 * (the copilot / research panels' 'upgrade-required' state).
 */
export function IntelligenceUpgradePrompt({
  title,
  description,
}: {
  title?: string
  description?: string
}) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('intelligence.upsell.defaultTitle')
  const resolvedDescription =
    description ?? t('intelligence.upsell.defaultDescription')

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
      <Empty className="max-w-[300px]">
        <EmptyHeader className="gap-3">
          <AiOrb size="72px" className="mb-2" />
          <EmptyTitle className="text-base">{resolvedTitle}</EmptyTitle>
          <EmptyDescription className="leading-relaxed">
            {resolvedDescription}
          </EmptyDescription>
        </EmptyHeader>
        <div className="mt-6 w-full">
          <IntelligencePlanButtons />
        </div>
        <p className="mt-4 text-center text-[11px] leading-snug text-muted-foreground">
          <Trans
            i18nKey="intelligence.upsell.byokNote"
            components={{
              plugins: (
                <Link to="/plugins" className="underline underline-offset-2" />
              ),
            }}
          />
        </p>
      </Empty>
    </div>
  )
}

/**
 * Inline notice for typed billing 402s surfaced mid-session (e.g. the
 * monthly budget runs out while chatting).
 */
export function BillingErrorNotice({ code }: { code: BillingErrorCode }) {
  const { t } = useTranslation()
  const billing = useBillingState()
  const portal = useBillingPortal()

  // Conversion funnel: how often users hit the Intelligence billing gate.
  useEffect(() => {
    track('ai_billing_gate_shown', { code })
  }, [code])

  if (code === 'intelligence_subscription_required') {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="text-sm font-medium">
            {t('intelligence.upsell.subscriptionRequiredTitle')}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('intelligence.upsell.subscriptionRequiredBody')}
        </p>
        <div className="mt-3">
          <IntelligencePlanButtons size="sm" />
        </div>
      </div>
    )
  }

  const periodEnd = billing.data?.periodEnd
  const resetsOn = periodEnd
    ? new Date(periodEnd).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null
  const onMax = billing.data?.plan === 'max'

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-medium">
          {t('intelligence.upsell.budgetUsedUpTitle')}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('intelligence.upsell.budgetUsedBody')}
        {resetsOn
          ? ' ' + t('intelligence.upsell.budgetResetsOn', { date: resetsOn })
          : ''}
        {onMax
          ? ' ' + t('intelligence.upsell.topUpHint')
          : ' ' +
            t('intelligence.upsell.upgradeToMaxHint', {
              label: INTELLIGENCE_PLANS.max.label,
              credits: formatCredits(INTELLIGENCE_PLANS.max.monthlyCredits),
            })}
      </p>
      {onMax && (
        <div className="mt-3">
          <CreditPackButtons />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!onMax && <UpgradeToMaxButton />}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={portal.isPending}
          onClick={() =>
            portal.mutate(undefined, {
              onError: () => toast.error(t('intelligence.upsell.portalError')),
            })
          }
        >
          <ExternalLink className="size-3.5" />
          {t('intelligence.upsell.manageSubscription')}
        </Button>
      </div>
    </div>
  )
}

/**
 * One-time credit-pack buttons (Intelligence Max only — the server rejects
 * everyone else). Rendered in the exhausted-budget card and in Settings.
 */
export function CreditPackButtons({
  size = 'sm',
}: {
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation()
  const checkout = usePackCheckout()
  return (
    <div className="grid grid-cols-2 gap-2">
      {CREDIT_PACK_IDS.map((packId) => {
        const pack = CREDIT_PACKS[packId]
        return (
          <Button
            key={packId}
            size={size}
            variant="outline"
            className="justify-between gap-2 tabular-nums"
            disabled={checkout.isPending}
            onClick={() =>
              checkout.mutate(packId, {
                onSuccess: () => {
                  toast.info(t('intelligence.upsell.checkoutOpenedTitle'), {
                    description: t(
                      'intelligence.upsell.creditsLandDescription',
                    ),
                  })
                },
                onError: () =>
                  toast.error(t('intelligence.upsell.checkoutError')),
              })
            }
          >
            <span>+{formatCredits(pack.credits)}</span>
            <span className="text-muted-foreground">${pack.priceUsd}</span>
          </Button>
        )
      })}
    </div>
  )
}

function UpgradeToMaxButton() {
  const { t } = useTranslation()
  const checkout = useIntelligenceCheckout()
  return (
    <Button
      size="sm"
      className="gap-1.5"
      disabled={checkout.isPending}
      onClick={() =>
        checkout.mutate('max', {
          onError: () => toast.error(t('intelligence.upsell.checkoutError')),
        })
      }
    >
      <Check className="size-3.5" />
      {t('intelligence.upsell.upgradeToMax')}
    </Button>
  )
}
