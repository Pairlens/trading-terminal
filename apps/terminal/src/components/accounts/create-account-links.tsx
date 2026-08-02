// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'

import { AFFILIATE_VENUE_MAP } from '@pairlens/shared/affiliates'

import { Button } from '@pairlens/ui/components/ui/button'

import { PluginPosterArt } from '../plugins/plugin-icon'
import { POSTER_MORPH, SectionEyebrow, StoreAurora } from '../store/store-shell'
import { venueBrand, venuePluginId, venuePosterSrc } from './venue-art'
import { track } from '@/lib/analytics-events'
import { useAffiliateLinks } from '@/hooks/use-affiliate-links'

// ---------------------------------------------------------------------------
// "Create an account" affordances
//
// Helping users who don't yet have an exchange/broker account open one —
// framed as setup assistance, not advertising. Signup URLs are resolved at
// runtime from the App Server (Pairlens or referring-affiliate links, with
// untagged public pages as fallback), never baked into the build.
// ---------------------------------------------------------------------------

export type OpenableVenue = { market: string; url: string }

/** How many venues a section rail previews before "See all". */
export const RAIL_VENUE_COUNT = 4

/**
 * Venues the user could open an account with: connector-backed, affiliate
 * catalog members, minus venues they already hold credentials for.
 */
export function useOpenableVenues(
  markets: Array<string>,
  connectedMarkets?: ReadonlySet<string>,
): Array<OpenableVenue> {
  const { getSignupUrl } = useAffiliateLinks()
  return markets
    .filter((m) => m in AFFILIATE_VENUE_MAP && !connectedMarkets?.has(m))
    .map((market) => ({ market, url: getSignupUrl(market) }))
    .filter((v): v is OpenableVenue => Boolean(v.url))
}

/**
 * One-line helper inside the connect wizard's credentials step: the moment a
 * user realizes they don't have API keys is the moment they may not have an
 * account at all.
 */
export function CreateAccountHint({
  market,
  label,
}: {
  market: string
  label: string
}) {
  const { t } = useTranslation()
  const { getSignupUrl } = useAffiliateLinks()
  const url = getSignupUrl(market)
  if (!url) return null

  return (
    <p className="text-[11px] text-muted-foreground">
      {t('accounts.newTo', { exchange: label })}{' '}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('affiliate_link_clicked', { venue: market })}
        className="inline-flex items-center gap-0.5 font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
      >
        {t('accounts.createAccountLink')}
        <ArrowUpRight className="size-3" />
      </a>{' '}
      {t('accounts.createAccountThen')}
    </p>
  )
}

/**
 * Compact venue row for a section rail — brand tile, name, and the whole row
 * is the signup link. Morphs into the all-venues grid poster on "See all".
 */
function VenueRow({
  market,
  url,
  layoutId,
}: {
  market: string
  url: string
  layoutId?: string
}) {
  const venue = AFFILIATE_VENUE_MAP[market]
  const brand = venueBrand(market, venue.label)
  const poster = venuePosterSrc(market)

  return (
    <motion.a
      layoutId={layoutId}
      transition={POSTER_MORPH}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('affiliate_link_clicked', { venue: market })}
      className="group flex items-center gap-3 border border-border/70 p-2.5 transition-colors hover:border-primary/30"
      style={{
        borderRadius: 14,
        background: `linear-gradient(120deg, color-mix(in oklch, ${brand.tint} 16%, var(--card)) 0%, var(--card) 70%)`,
      }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/40 bg-background/85">
        {poster ? (
          <img
            src={poster}
            alt={venue.label}
            className="size-6 rounded-sm object-contain"
          />
        ) : (
          <span
            className="flex size-6 items-center justify-center rounded-sm font-mono text-[9px] font-bold"
            style={{ background: brand.tint, color: brand.fg }}
          >
            {brand.mono}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
        {venue.label}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.a>
  )
}

/**
 * Section rail: a taste of venues the user can open an account with for this
 * asset class, plus "See all" into the full venues page. Sits in the right
 * column next to the user's own keys.
 */
export function VenueRail({
  venues,
  kind,
  onSeeAll,
}: {
  venues: Array<OpenableVenue>
  /** Layout-id namespace — 'cex' or 'broker'. */
  kind: string
  onSeeAll: () => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  if (venues.length === 0) return null

  const preview = venues.slice(0, RAIL_VENUE_COUNT)

  return (
    <div className="rounded-[17px] border border-border/70 bg-card/50 p-4 backdrop-blur-sm">
      <SectionEyebrow className="text-[10px]">
        {t('accounts.openAccountShelfTitle', 'Open a new account')}
      </SectionEyebrow>
      <div className="mt-3 space-y-2">
        {preview.map(({ market, url }) => (
          <VenueRow
            key={market}
            market={market}
            url={url}
            layoutId={reduceMotion ? undefined : `venue-${kind}-${market}`}
          />
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={onSeeAll}
      >
        {t('accounts.seeAllVenues', 'See all venues')}
        <ChevronRight className="size-3.5" />
      </Button>
      <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
        {t('accounts.affiliateDisclosure')}
      </p>
    </div>
  )
}

/** Poster card for the all-venues grid — the whole card is the link. */
function VenuePosterCard({
  market,
  url,
  layoutId,
}: {
  market: string
  url: string
  layoutId?: string
}) {
  const venue = AFFILIATE_VENUE_MAP[market]
  const brand = venueBrand(market, venue.label)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('affiliate_link_clicked', { venue: market })}
      className="pl-store-lift group focus-visible:outline-none focus-visible:[&>div:first-child]:ring-2 focus-visible:[&>div:first-child]:ring-ring"
    >
      <motion.div
        layoutId={layoutId}
        transition={POSTER_MORPH}
        className="relative flex h-[150px] items-center justify-center overflow-hidden border border-border"
        style={{
          borderRadius: 17,
          background: `linear-gradient(160deg, color-mix(in oklch, ${brand.tint} 42%, var(--card)) 0%, var(--card) 78%)`,
        }}
      >
        <PluginPosterArt
          id={venuePluginId(market)}
          name={venue.label}
          src={venuePosterSrc(market)}
          iconSize={56}
          monoSize={52}
          scrim={false}
        />
        <span className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <ArrowUpRight className="size-3.5" />
        </span>
      </motion.div>
      <p className="mt-2 truncate text-[13px] font-semibold text-foreground">
        {venue.label}
      </p>
    </a>
  )
}

function VenueGrid({
  venues,
  kind,
  morphMarkets,
}: {
  venues: Array<OpenableVenue>
  kind: string
  /** Markets whose rail rows are mounted underneath — these morph. */
  morphMarkets: ReadonlySet<string>
}) {
  const reduceMotion = useReducedMotion() ?? false
  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
      {venues.map(({ market, url }) => (
        <VenuePosterCard
          key={market}
          market={market}
          url={url}
          layoutId={
            !reduceMotion && morphMarkets.has(market)
              ? `venue-${kind}-${market}`
              : undefined
          }
        />
      ))}
    </div>
  )
}

/**
 * Full-screen "all venues" page — the accounts sibling of the store product
 * pages. Opens over the accounts body with its own scroll; the rail rows it
 * was opened from morph into their grid posters.
 */
export function AllVenuesPage({
  cexVenues,
  brokerVenues,
  onBack,
}: {
  cexVenues: Array<OpenableVenue>
  brokerVenues: Array<OpenableVenue>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const morphCex = new Set(
    cexVenues.slice(0, RAIL_VENUE_COUNT).map((v) => v.market),
  )
  const morphBroker = new Set(
    brokerVenues.slice(0, RAIL_VENUE_COUNT).map((v) => v.market),
  )

  return (
    <motion.div
      className="absolute inset-0 z-40 overflow-y-auto bg-card"
      // Opacity only — a transform here would skew the shared-element morphs.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <StoreAurora className="fixed" />

      {/* Sticky sub-bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-card/70 px-5 py-2.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('accounts.pageTitle')}
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 mx-auto max-w-[1060px] px-11 pb-16 pt-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t('accounts.openAccountShelfTitle', 'Open a new account')}
          </span>
          <h1 className="mt-3 font-serif text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground">
            {t('accounts.venuesTitle', 'Pick your venue')}
          </h1>
          <p className="mt-3.5 max-w-[54ch] text-[14.5px] leading-[1.65] text-muted-foreground">
            {t(
              'accounts.openAccountShelfSub',
              'Venues you can connect to Pairlens in minutes',
            )}
            {' — '}
            {t('accounts.affiliateDisclosure')}
          </p>
        </motion.div>

        {cexVenues.length > 0 && (
          <section className="mt-10">
            <SectionEyebrow>
              {t('accounts.exchangeAccountsTitle')}
            </SectionEyebrow>
            <VenueGrid venues={cexVenues} kind="cex" morphMarkets={morphCex} />
          </section>
        )}

        {brokerVenues.length > 0 && (
          <section className="mt-10">
            <SectionEyebrow>{t('accounts.brokerAccountsTitle')}</SectionEyebrow>
            <VenueGrid
              venues={brokerVenues}
              kind="broker"
              morphMarkets={morphBroker}
            />
          </section>
        )}
      </div>
    </motion.div>
  )
}
