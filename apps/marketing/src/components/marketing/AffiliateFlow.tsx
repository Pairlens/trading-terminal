// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The claim flow, as a first-class product card on the graphite ground: four
// steps on the left, a live application receipt on the right. Styling is
// Tailwind + design-system tokens rather than the page's scoped CSS, which
// cannot reach inside a hydrated island.
import { useMemo, useState } from 'react'
import {
  AFFILIATE_TIER_LIMITS,
  AFFILIATE_VENUES,
  validateReferralParams,
} from '@pairlens/shared/affiliates'
import { Input } from '@pairlens/ui/components/ui/input'
import { Slider } from '@pairlens/ui/components/ui/slider'
import type { AffiliateTier } from '@pairlens/shared/affiliates'
import { SITE, VENUE_BRAND } from '@/lib/site'
import { VenueIcon } from '@/components/marketing/VenueIcon'
import { track } from '@/scripts/analytics-events'

const CLAIMABLE = AFFILIATE_VENUES.filter((v) => v.referral)
const brand = (id: string) =>
  VENUE_BRAND[id] ?? {
    mono: id.slice(0, 2).toUpperCase(),
    hue: 'oklch(0.7 0 0)',
  }

// The mono micro-label used across the card. Written out rather than reusing
// `.pl-eyebrow`: that class is unlayered, so it would beat any Tailwind size
// utility set alongside it.
const EYEBROW =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.18em]'

// —— Earnings model (illustrative) ————————————————————————————
const perRefMo = (venues: number) => 6 + 1.4 * venues
const monthly = (m: number, traders: number, venues: number) =>
  traders * m * perRefMo(venues)
const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(n))

// Loose client-side shape check — the server is the real validator.
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{3,}$/
function inferTier(code: string): AffiliateTier | null {
  const c = code.trim()
  if (!CODE_RE.test(c)) return null
  return /gold/i.test(c) ? 'gold' : 'silver'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PROVIDERS = [
  { name: 'Gmail', domains: ['gmail.com', 'googlemail.com'] },
  { name: 'Outlook', domains: ['outlook.com', 'hotmail.com', 'live.com'] },
  { name: 'Yahoo', domains: ['yahoo.com'] },
  { name: 'Proton', domains: ['proton.me', 'protonmail.com'] },
  { name: 'iCloud', domains: ['icloud.com', 'me.com'] },
]

type Draft = Record<string, Record<string, string>>

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[22px] border border-border"
      style={{ background: 'var(--pl-inset)' }}
    >
      {children}
    </div>
  )
}

export function AffiliateFlow() {
  const [tier, setTier] = useState<AffiliateTier>('bronze')
  const [codeInput, setCodeInput] = useState('')
  const [applied, setApplied] = useState<{
    code: string
    tier: AffiliateTier
  } | null>(null)
  const [codeError, setCodeError] = useState('')
  const [selected, setSelected] = useState<Array<string>>([])
  const [draft, setDraft] = useState<Draft>({})
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const cap = AFFILIATE_TIER_LIMITS[tier]

  const venueValid = (id: string) => {
    const v = AFFILIATE_VENUES.find((x) => x.id === id)
    if (!v?.referral) return false
    return validateReferralParams(id, draft[id] ?? {}).ok
  }

  const referralComplete = selected.length > 0 && selected.every(venueValid)
  const emailValid = EMAIL_RE.test(email)
  const canSubmit = selected.length > 0 && referralComplete && emailValid

  // —— Actions ————————————————————————————————————————
  const applyCode = () => {
    const inferred = inferTier(codeInput)
    // The tier it resolved to, never the code itself.
    track('affiliate_code_applied', {
      ok: inferred !== null,
      tier: inferred ?? 'none',
    })
    if (!inferred) {
      setCodeError('That code doesn’t look right. DM @pairlens on X for one.')
      return
    }
    setCodeError('')
    setApplied({ code: codeInput.trim(), tier: inferred })
    setTier(inferred)
  }

  const changeCode = () => {
    setApplied(null)
    setCodeInput('')
    setCodeError('')
    setTier('bronze')
    setSelected((s) => s.slice(0, AFFILIATE_TIER_LIMITS.bronze))
  }

  // Decided out here rather than inside a functional updater: `track` is a
  // side effect and an updater has to stay pure (StrictMode runs it twice).
  // The event and the new state are derived from the SAME snapshot, so they
  // can never disagree about whether this click added or removed a venue.
  const toggleVenue = (id: string) => {
    const wasSelected = selected.includes(id)
    // At the tier cap the click does nothing, so it is not a selection.
    if (!wasSelected && selected.length >= cap) return
    track('affiliate_venue_toggled', {
      venue: id,
      action: wasSelected ? 'removed' : 'added',
    })
    setSelected(
      wasSelected ? selected.filter((x) => x !== id) : [...selected, id],
    )
  }

  const setField = (venueId: string, key: string, value: string) =>
    setDraft((d) => ({ ...d, [venueId]: { ...d[venueId], [key]: value } }))

  const submit = () => {
    if (!canSubmit || submitting) return
    // Venue count and tier only. The email and the referral codes the visitor
    // pasted never leave this component.
    track('affiliate_claim_submitted', { tier, venue_count: selected.length })
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
    }, 1150)
  }

  if (submitted) {
    return (
      <Submitted
        email={email}
        venues={selected.length}
        onReset={() => {
          setSubmitted(false)
          setSelected([])
          setDraft({})
          setEmail('')
          changeCode()
        }}
      />
    )
  }

  return (
    <Card>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ——— Left: the form ——— */}
        <div className="min-w-0 px-6 py-8 sm:px-9 sm:py-10">
          {/* Step 1 — reach */}
          <Step n={1} done={true} title="Your reach">
            {applied ? (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] font-medium"
                  style={{
                    color: 'var(--pl-green)',
                    borderColor:
                      'color-mix(in oklch, var(--pl-green) 35%, transparent)',
                    background:
                      'color-mix(in oklch, var(--pl-green) 10%, transparent)',
                  }}
                >
                  ✓ Unlocked{' '}
                  {applied.tier[0].toUpperCase() + applied.tier.slice(1)} ·{' '}
                  {AFFILIATE_TIER_LIMITS[applied.tier]} venues
                </span>
                <button
                  onClick={changeCode}
                  className="text-[13px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <p className="max-w-[62ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                  You’re on{' '}
                  <span className="font-medium text-foreground">Bronze</span>: 2
                  venues, free, no code. Have a code from{' '}
                  <span className="font-medium text-foreground">@pairlens</span>{' '}
                  on X? Unlock{' '}
                  <span style={{ color: 'var(--pl-iris)' }}>Silver</span> (5) or{' '}
                  <span style={{ color: 'var(--pl-amber)' }}>Gold</span> (10,
                  100k+).
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="e.g. PL-SILVER-2K7X"
                    className="h-11 max-w-[280px] rounded-[12px] font-mono"
                    onKeyDown={(e) => e.key === 'Enter' && applyCode()}
                  />
                  <button
                    onClick={applyCode}
                    className="inline-flex h-11 items-center rounded-[12px] bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-100"
                  >
                    Apply code
                  </button>
                </div>
                {codeError && (
                  <p
                    className="mt-2.5 text-[13px]"
                    style={{ color: 'var(--pl-red)' }}
                  >
                    {codeError}
                  </p>
                )}
                <a
                  href={SITE.x}
                  target="_blank"
                  rel="noopener"
                  className="mt-3.5 inline-block text-[13.5px] font-semibold transition-opacity hover:opacity-80"
                  style={{ color: 'var(--pl-iris)' }}
                >
                  Request a code on X →
                </a>
              </>
            )}
          </Step>

          {/* Step 2 — venues */}
          <Step
            n={2}
            done={selected.length > 0}
            title="Choose venues"
            meta={
              <span className={`${EYEBROW} text-muted-foreground`}>
                {selected.length} / {cap}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {CLAIMABLE.map((v) => {
                const isSel = selected.includes(v.id)
                const atCap = !isSel && selected.length >= cap
                const b = brand(v.id)
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVenue(v.id)}
                    disabled={atCap}
                    className={`relative flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-all ${
                      isSel
                        ? 'border-primary/60 bg-primary/[0.08]'
                        : atCap
                          ? 'cursor-not-allowed border-border opacity-35'
                          : 'border-border hover:border-foreground/25 hover:bg-foreground/[0.03]'
                    }`}
                    style={
                      isSel
                        ? { boxShadow: 'inset 0 0 0 1px var(--primary)' }
                        : undefined
                    }
                  >
                    <VenueIcon
                      id={v.id}
                      name={v.label}
                      mono={b.mono}
                      hue={b.hue}
                      size={30}
                      radius={8}
                    />
                    <span className="truncate text-[14px] font-medium text-foreground">
                      {v.label}
                    </span>
                    {isSel && (
                      <span className="ml-auto grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Step>

          {/* Step 3 — referral codes */}
          <Step n={3} done={referralComplete} title="Your referral codes">
            {selected.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-border px-4 py-7 text-center text-[13px] text-muted-foreground/70">
                Pick venues above and their code fields appear here.
              </div>
            ) : (
              <div className="space-y-2.5">
                {selected.map((id) => {
                  const v = AFFILIATE_VENUES.find((x) => x.id === id)!
                  const b = brand(id)
                  return (
                    <div
                      key={id}
                      className="flex flex-col gap-2.5 rounded-[16px] border border-border p-3.5 sm:flex-row sm:items-center"
                      style={{
                        background:
                          'color-mix(in oklch, var(--background) 45%, transparent)',
                      }}
                    >
                      <div className="flex w-40 shrink-0 items-center gap-2.5">
                        <VenueIcon
                          id={id}
                          name={v.label}
                          mono={b.mono}
                          hue={b.hue}
                          size={28}
                          radius={8}
                        />
                        <span className="text-[14px] font-medium text-foreground">
                          {v.label}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-wrap gap-2">
                        {v.referral!.fields.map((f) => (
                          <Input
                            key={f.key}
                            value={draft[id]?.[f.key] ?? ''}
                            onChange={(e) =>
                              setField(id, f.key, e.target.value)
                            }
                            placeholder={`${f.label} · ${f.example}`}
                            aria-label={`${v.label} ${f.label}`}
                            className="h-10 flex-1 rounded-[11px] font-mono text-[13px]"
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Step>

          {/* Step 4 — email */}
          <Step n={4} done={emailValid} title="Where to send your link" last>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-11 max-w-[440px] rounded-[12px]"
            />
            <p className="mt-2.5 text-[13px] leading-[1.7] text-muted-foreground">
              We’ll email your ready-to-share Pairlens link and a monthly
              earnings summary. No spam.
            </p>
          </Step>
        </div>

        {/* ——— Right: the application receipt ——— */}
        <aside
          className="border-border max-lg:rounded-b-[21px] max-lg:border-t lg:rounded-r-[21px] lg:border-l"
          style={{
            background:
              'color-mix(in oklch, var(--background) 78%, transparent)',
          }}
        >
          <div className="px-6 py-8 sm:px-8 lg:sticky lg:top-[104px]">
            <p className={`${EYEBROW} text-muted-foreground/70`}>Application</p>
            <ul className="mt-4 space-y-3">
              <Check
                done
                label="Reach"
                meta={
                  applied
                    ? applied.tier[0].toUpperCase() + applied.tier.slice(1)
                    : 'Bronze'
                }
              />
              <Check
                done={selected.length > 0}
                label="Venues"
                meta={`${selected.length}/${cap}`}
              />
              <Check done={referralComplete} label="Referral codes" />
              <Check done={emailValid} label="Email" />
            </ul>

            <p className={`${EYEBROW} mt-9 text-muted-foreground/70`}>
              Earning potential
            </p>
            {selected.length > 0 ? (
              <div className="mt-3">
                <p
                  className="font-serif text-[34px] font-semibold leading-none tracking-[-0.03em]"
                  style={{ color: 'var(--pl-green)' }}
                >
                  {fmtUSD(monthly(12, 20, selected.length))}
                  <span className="ml-1.5 font-sans text-[13px] font-normal tracking-normal text-muted-foreground">
                    / yr est.
                  </span>
                </p>
                <Sparkline venues={selected.length} cap={cap} />
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-[1.7] text-muted-foreground/70">
                Add venues to see your projection climb.
              </p>
            )}

            <div className="mt-9">
              {!canSubmit && (
                <p className="mb-2.5 text-[12.5px] text-muted-foreground/70">
                  {selected.length === 0
                    ? 'Pick at least one venue.'
                    : !referralComplete
                      ? 'Fill in each venue’s referral code.'
                      : !emailValid
                        ? 'Add a valid email.'
                        : ''}
                </p>
              )}
              <button
                onClick={submit}
                disabled={!canSubmit || submitting}
                className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-semibold transition-all ${
                  canSubmit
                    ? 'pl-ring bg-primary text-primary-foreground hover:scale-[1.02] active:scale-100'
                    : 'cursor-not-allowed bg-muted text-muted-foreground'
                }`}
              >
                {submitting ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Building your share link…
                  </>
                ) : (
                  'Get my share link'
                )}
              </button>
              <p className="mt-3 text-[12px] leading-[1.6] text-muted-foreground/60">
                Codes are checked against each venue’s published format.
                Pairlens builds the link, you never hand over a URL.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </Card>
  )
}

// —— Sub-pieces ————————————————————————————————————————

function Step({
  n,
  done,
  title,
  meta,
  last,
  children,
}: {
  n: number
  done: boolean
  title: string
  meta?: React.ReactNode
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="relative flex gap-4 pt-9 first:pt-0">
      <div className="flex flex-col items-center">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold transition-colors ${
            done ? '' : 'border border-border text-muted-foreground'
          }`}
          style={
            done
              ? { background: 'var(--pl-green)', color: 'oklch(0.16 0.02 160)' }
              : undefined
          }
        >
          {done ? '✓' : n}
        </span>
        {!last && (
          <span
            className="mt-2 w-px flex-1"
            style={{ background: 'var(--border)' }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[19px] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h3>
          {meta}
        </div>
        <div className="mt-3.5">{children}</div>
      </div>
    </section>
  )
}

function Check({
  done,
  label,
  meta,
}: {
  done: boolean
  label: string
  meta?: string
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] transition-colors ${
          done ? '' : 'border border-border'
        }`}
        style={
          done
            ? { background: 'var(--pl-green)', color: 'oklch(0.16 0.02 160)' }
            : undefined
        }
      >
        {done ? '✓' : ''}
      </span>
      <span
        className={`flex-1 text-[13.5px] ${done ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </span>
      {meta && (
        <span className="font-mono text-[12px] text-muted-foreground/70">
          {meta}
        </span>
      )}
    </li>
  )
}

function Sparkline({ venues, cap }: { venues: number; cap: number }) {
  const bars = Array.from({ length: 12 }, (_, i) => monthly(i + 1, 20, venues))
  // Scale against the projection at the FULL tier cap, not this run's own
  // max — normalizing to itself keeps the bars' proportions identical no
  // matter how many venues are picked, so the chart never visibly grows.
  const max = monthly(12, 20, cap)
  return (
    <div className="mt-4 flex h-12 items-end gap-1">
      {bars.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(6, (v / max) * 100)}%`,
            background: 'color-mix(in oklch, var(--pl-green) 55%, transparent)',
          }}
        />
      ))}
    </div>
  )
}

// —— Submitted state ————————————————————————————————————
function Submitted({
  email,
  venues,
  onReset,
}: {
  email: string
  venues: number
  onReset: () => void
}) {
  const [traders, setTraders] = useState(20)
  const [horizon, setHorizon] = useState(12)
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  const providers = useMemo(() => {
    const withMatch = PROVIDERS.map((p) => ({
      ...p,
      yours: p.domains.includes(domain),
    }))
    return withMatch.sort((a, b) => Number(b.yours) - Number(a.yours))
  }, [domain])

  const v = Math.max(1, venues)
  const cumulative = Array.from({ length: horizon }, (_, i) =>
    monthly(i + 1, traders, v),
  ).reduce((a, b) => a + b, 0)
  const runRate = monthly(horizon, traders, v)
  const annualized = runRate * 12
  const chart = Array.from({ length: horizon }, (_, i) =>
    monthly(i + 1, traders, v),
  )
  const chartMax = Math.max(...chart)

  return (
    <Card>
      <div className="mx-auto w-full max-w-[680px] px-6 py-12 sm:px-9 sm:py-14">
        <div className="flex flex-col items-center text-center">
          <span
            className="pl-pop grid size-16 place-items-center rounded-full text-2xl"
            style={{
              background:
                'color-mix(in oklch, var(--pl-green) 18%, transparent)',
              color: 'var(--pl-green)',
            }}
          >
            ✓
          </span>
          <h3 className="mt-7 font-serif text-[38px] font-semibold leading-none tracking-[-0.034em] text-foreground">
            Check your inbox
          </h3>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-muted-foreground">
            Your Pairlens share link is on its way to{' '}
            <span className="font-medium text-foreground">{email}</span>
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {providers.map((p) => (
              <span
                key={p.name}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${
                  p.yours
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {p.name}
                {p.yours && (
                  <span className="rounded bg-primary/20 px-1 font-mono text-[9px] font-semibold tracking-[0.1em]">
                    YOURS
                  </span>
                )}
              </span>
            ))}
          </div>
          <button
            onClick={onReset}
            className="mt-6 text-[13px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Start over
          </button>
        </div>

        {/* Simulator */}
        <div className="mt-12 border-t border-border pt-11">
          <p className={`${EYEBROW} text-center text-muted-foreground/70`}>
            While you wait: see what you could earn
          </p>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <SliderRow
              label="New traders / month"
              value={traders}
              min={5}
              max={150}
              onChange={setTraders}
              suffix=""
            />
            <SliderRow
              label="Horizon"
              value={horizon}
              min={3}
              max={36}
              onChange={setHorizon}
              suffix=" mo"
            />
          </div>

          <div
            className="mt-8 rounded-[18px] border p-6"
            style={{
              borderColor:
                'color-mix(in oklch, var(--pl-green) 25%, transparent)',
              background:
                'color-mix(in oklch, var(--pl-green) 5%, transparent)',
            }}
          >
            <div className="grid grid-cols-3 gap-4 text-center">
              <Metric label="Cumulative" value={fmtUSD(cumulative)} big />
              <Metric label="Run-rate / mo" value={fmtUSD(runRate)} />
              <Metric label="Annualized" value={fmtUSD(annualized)} />
            </div>
            <div className="mt-7 flex h-20 items-end gap-1">
              {chart.map((val, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-[2px]"
                  style={{
                    height: `${Math.max(4, (val / chartMax) * 100)}%`,
                    background: 'var(--pl-green)',
                  }}
                />
              ))}
            </div>
            <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground/60">
              Illustrative estimate · {v} venue{v > 1 ? 's' : ''} · assumes
              steady sign-ups
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  suffix: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[14px] font-semibold text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <div className="mt-3">
        <Slider
          value={value}
          min={min}
          max={max}
          onValueChange={(v) =>
            onChange(Array.isArray(v) ? v[0] : (v as number))
          }
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  big,
}: {
  label: string
  value: string
  big?: boolean
}) {
  return (
    <div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
        {label}
      </p>
      <p
        className={`mt-1.5 font-serif font-semibold tracking-[-0.028em] ${big ? 'text-[28px]' : 'text-[20px]'}`}
        style={{ color: 'var(--pl-green)' }}
      >
        {value}
      </p>
    </div>
  )
}
