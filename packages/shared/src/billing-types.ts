// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Pairlens Intelligence billing contract
//
// Pairlens accounts are always free. "Pairlens Intelligence" is a paid add-on
// subscription (billed via Stripe, managed by the App Server) that unlocks
// AI usage with Pairlens as the provider — the hosted inference proxy and the
// hosted web-research search. Bring-your-own-key AI provider plugins
// (Anthropic, OpenAI, DeepSeek, Groq, OpenRouter, Tavily, Exa, ...) are never gated.
//
// Usage is metered in CREDITS: 1 credit = $0.001 USD of underlying cost.
// Each plan grants a monthly credit budget of roughly 70% of the
// subscription price (~30% gross margin covers payment processing fees,
// sales tax handling, and profit), rounded to a friendly number. Credits
// reset every billing cycle and do NOT roll over. All hosted AI usage —
// inference (any model) and web research — draws from the same budget.
//
// The App Server owns all Stripe interaction (checkout, billing portal,
// webhooks) AND the usage ledger itself — credit grants and usage events
// live in its Postgres database, not with the payment processor. The
// terminal only consumes:
//   - GET /api/billing/state             → BillingState (below)
//   - POST /api/billing/checkout|portal  → hosted Stripe URLs
// and receives typed 402 errors from gated AI routes.
// ---------------------------------------------------------------------------

/** 1 credit = $0.001 USD of underlying usage cost. */
export const CREDITS_PER_USD = 1000

export type IntelligencePlanId = 'pro' | 'max'

export type IntelligencePlan = {
  id: IntelligencePlanId
  label: string
  priceUsdMonthly: number
  /** Monthly usage budget in credits (resets each cycle, no rollover). */
  monthlyCredits: number
  /** Short marketing line for plan cards. */
  tagline: string
}

/**
 * Plan catalog. `monthlyCredits` ≈ price × 70% in credits (≈30% margin),
 * rounded to a friendly number. The Stripe products/prices are provisioned
 * from this catalog (see the App Server's stripe setup script) — rerun it
 * after changing prices; credit budgets take effect from the next cycle
 * grant without touching Stripe at all (the ledger is ours).
 */
export const INTELLIGENCE_PLANS: Record<IntelligencePlanId, IntelligencePlan> =
  {
    pro: {
      id: 'pro',
      label: 'Intelligence Pro',
      priceUsdMonthly: 19,
      monthlyCredits: 13_000,
      tagline: 'Hosted AI assistant and research for active traders',
    },
    max: {
      id: 'max',
      label: 'Intelligence Max',
      priceUsdMonthly: 99,
      monthlyCredits: 70_000,
      tagline: 'Heavy research and automation workloads, 5× the budget',
    },
  }

// ---------------------------------------------------------------------------
// Credit packs — one-time top-ups (Intelligence Max subscribers only)
//
// Extra credits land on the same ledger as the monthly budget and are spent
// alongside it. They EXPIRE 30 days after purchase: the App Server enforces
// expiry by forfeiting each pack's unused remainder (pack credits are
// counted as consumed FIRST, so an actively-used pack forfeits little or
// nothing).
// ---------------------------------------------------------------------------

export type CreditPackId = 'pack-10' | 'pack-20' | 'pack-50' | 'pack-100'

export type CreditPack = {
  id: CreditPackId
  priceUsd: number
  credits: number
}

/** 500 credits per USD ($0.50 of usage per $1 — top-ups carry ~50% margin). */
export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  'pack-10': { id: 'pack-10', priceUsd: 10, credits: 5_000 },
  'pack-20': { id: 'pack-20', priceUsd: 20, credits: 10_000 },
  'pack-50': { id: 'pack-50', priceUsd: 50, credits: 25_000 },
  'pack-100': { id: 'pack-100', priceUsd: 100, credits: 50_000 },
}

export const CREDIT_PACK_IDS: ReadonlyArray<CreditPackId> = [
  'pack-10',
  'pack-20',
  'pack-50',
  'pack-100',
]

export function isCreditPackId(value: unknown): value is CreditPackId {
  return (
    typeof value === 'string' &&
    (CREDIT_PACK_IDS as ReadonlyArray<string>).includes(value)
  )
}

/** Days from purchase until a pack's unused credits are forfeited. */
export const CREDIT_PACK_EXPIRY_DAYS = 30

/** An active (unexpired) credit-pack purchase, reported in BillingState. */
export type ActiveCreditPack = {
  credits: number
  /**
   * Credits consumed against this pack so far (0..credits). Attribution
   * follows the expiry rule: consumption since the purchase counts against
   * the pack first. Absent when the usage lookup fails — display-only.
   */
  creditsUsed?: number
  /** ISO timestamps. */
  purchasedAt: string
  expiresAt: string
}

/**
 * Subscription status as the terminal needs it. `canceled` means the user
 * canceled but keeps access until `periodEnd`; `none` means no subscription.
 */
export type IntelligenceSubscriptionStatus = 'none' | 'active' | 'canceled'

/** Payload of GET /api/billing/state (auth required). */
export type BillingState = {
  /** False when the server has no Stripe configuration (self-hosted). */
  billingEnabled: boolean
  plan: IntelligencePlanId | null
  status: IntelligenceSubscriptionStatus
  /** Credits granted for the current billing cycle. */
  creditsGranted: number
  creditsUsed: number
  creditsRemaining: number
  /** ISO timestamp of the current cycle end (credit reset), null if none. */
  periodEnd: string | null
  /**
   * True for complimentary access (core contributors / testing, granted via
   * the App Server's BILLING_COMPLIMENTARY_EMAILS allowlist): full
   * Intelligence access, usage not metered against a subscription.
   */
  complimentary?: boolean
  /**
   * Active (unexpired) credit-pack purchases, newest first. Their credits
   * are already included in the credit totals above. Only Max subscribers
   * can buy packs; absent when packs aren't configured server-side.
   */
  packs?: Array<ActiveCreditPack>
}

/** Metered usage event types recorded in the ledger. Same budget. */
export type IntelligenceUsageEvent = 'ai_usage' | 'web_research'

/**
 * Flat per-search price for hosted web research, in credits.
 * Shown in the UI ("each web search uses N credits") and charged by the
 * App Server's research route per external search performed.
 */
export const WEB_RESEARCH_CREDITS_PER_SEARCH = 10

/**
 * Typed error codes carried on HTTP 402 responses from gated AI routes.
 * The terminal maps these to upgrade / usage UI instead of generic failures.
 */
export const BILLING_ERROR_CODES = [
  'intelligence_subscription_required',
  'intelligence_credits_exhausted',
] as const

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number]

export type BillingErrorBody = {
  error: BillingErrorCode
  message: string
  /** Present on credits_exhausted: when the budget resets. */
  periodEnd?: string
}

export function isBillingErrorCode(value: unknown): value is BillingErrorCode {
  return (
    typeof value === 'string' &&
    (BILLING_ERROR_CODES as ReadonlyArray<string>).includes(value)
  )
}

// ---------------------------------------------------------------------------
// Billing errors across Error boundaries
//
// AI calls cross layers that only carry `Error.message` (the AI SDK stream
// error channel, plugin execute() rejections). Encoding the code in the
// message lets the UI recover the typed error without the layers in between
// knowing about billing.
// ---------------------------------------------------------------------------

const BILLING_ERROR_MESSAGE_PREFIX = '[pairlens-billing:'

export function formatBillingErrorMessage(
  code: BillingErrorCode,
  message: string,
): string {
  return `${BILLING_ERROR_MESSAGE_PREFIX}${code}] ${message}`
}

/** Recover a billing error code from an Error message, if one is encoded. */
export function parseBillingErrorCode(
  message: string | undefined,
): BillingErrorCode | null {
  if (!message) return null
  const start = message.indexOf(BILLING_ERROR_MESSAGE_PREFIX)
  if (start === -1) return null
  const rest = message.slice(start + BILLING_ERROR_MESSAGE_PREFIX.length)
  const end = rest.indexOf(']')
  if (end === -1) return null
  const code = rest.slice(0, end)
  return isBillingErrorCode(code) ? code : null
}
