// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The round-2 data layers, as tools ────────────────────────────────
//
// Round 2 gave the terminal ten reads it had no way to answer in a
// sentence: the macro and earnings calendars, company fundamentals,
// IPOs, insider filings, new listings, liquidation clusters, funding and
// open interest, pool state and bridge quotes. Every one of them was
// wired to exactly one pane, so "what is on the calendar this week"
// meant the user finding the pane. These tools are the same reads
// without the pane.
//
// Three rules hold the module together.
//
// Nothing throws. A throw ends the assistant's turn, so every failure
// leaves here as returned data the model can read and relay.
//
// Unavailability is an answer. A deployment with no App Server, a
// provider with no key, a collector that does not watch a venue: each is
// a different sentence to a user, and an empty array would collapse all
// three into "nothing happened this week". The reasons ride out on
// `unavailable` with a hint, mirroring what the panes render.
//
// Venue-addressed reads resolve the plugin by name. `pluginManager.execute`
// walks a fallback chain, which for a per-venue collector means some
// other plugin answering for a venue nobody tracks. The liquidation and
// funding tools address the instance directly, exactly as their panes do.

import { tool } from 'ai'
import { z } from 'zod'
import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
import type { ToolSet } from 'ai'

import type { PluginInstance } from '@pairlens/plugin-system/types'
import type {
  FundingRateEntry,
  FundingSnapshotResponse,
  InsiderTransaction,
  LiquidationClustersResponse,
  LiquidationsUnavailableResponse,
  NewListingsResponse,
  OpenInterestEntry,
  OpenInterestResponse,
  PoolListingResponse,
  PoolStats,
} from '@pairlens/shared/instrument-types'

import type { NewPoolRow } from '@/hooks/use-pool-stats'
import type { VenuePlugin } from '@/lib/venues/venue-plugins'
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import type { AssistantDeps } from './tool-deps'
import { api } from '@/lib/api'
import { hasAppServer } from '@/lib/auth-client'
import { reasonOf } from '@/hooks/use-equity-fundamentals'
import { fetchBridgeQuote } from '@/hooks/use-bridge'
import { isBridgeRefusal } from '@/lib/dex/bridge-types'
import { NEW_POOL_MARKETS } from '@/hooks/use-pool-stats'
import { mergeNewListings } from '@/lib/new-listings'
import {
  aggregateByPrice,
  dominantSide,
  liquidationTotals,
} from '@/lib/futures/liquidation-clusters'
import {
  insiderValue,
  summarizeInsiderActivity,
} from '@/lib/equities/insider-activity'
import { getCountrySetting } from '@/lib/region-settings'
import { futuresPluginsFor } from '@/lib/venues/venue-plugins'

// ── Caps ─────────────────────────────────────────────────────────────
//
// A tool result is context the model pays for on every subsequent step,
// so a venue-wide funding sweep or three months of IPOs is trimmed here
// rather than left to the model to skim. Every trim states the total it
// trimmed from, because "50 rows" and "50 of 812 rows" are different
// facts about the market.

const MAX_ROWS = 50
/** Price buckets survive aggregation better than rows, so they get more room. */
const MAX_BUCKETS = 200
/** Contracts per venue the open-interest second pass will ask about. */
const MAX_OI_PAIRS = 10

type Capped<T> = {
  rows: Array<T>
  /** Rows that existed before the cap. */
  total: number
  truncated: boolean
}

function capped<T>(rows: ReadonlyArray<T>, limit = MAX_ROWS): Capped<T> {
  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    truncated: rows.length > limit,
  }
}

/** Epoch ms as an ISO string, so the model never has to date-math a number. */
function isoOf(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

// ── Honest unavailability ────────────────────────────────────────────

type Unavailable = {
  unavailable: string
  /** What the user would have to do, when anything would help. */
  hint: string
}

/**
 * This build has no App Server, so none of the hosted reads exist here.
 *
 * Checked before the call rather than inferred from the failure: the api
 * layer answers standalone with `not_configured`, which is also what a
 * hosted server missing a provider key answers, and those are different
 * things to tell a user.
 */
const STANDALONE: Unavailable = {
  unavailable: 'standalone',
  hint: 'This build runs without an App Server, so the hosted calendars, fundamentals and listings feeds are not reachable. Charts, order books and trading are unaffected.',
}

/** A thrown fundamentals failure as the reason a pane would render. */
function fundamentalsUnavailable(error: unknown): Unavailable {
  const reason = reasonOf(error)
  if (reason === 'not_configured') {
    return {
      unavailable: 'not_configured',
      hint: 'This deployment has no fundamentals provider configured. Nothing the user does in the terminal will change that.',
    }
  }
  if (reason === 'rate_limited') {
    return {
      unavailable: 'rate_limited',
      hint: 'The data provider is throttling us. Worth asking again in a few minutes.',
    }
  }
  return {
    unavailable: 'upstream_error',
    hint: 'The data provider failed or answered with something unusable. This is our side or theirs, not anything the user can fix.',
  }
}

// ── Venue-addressed plugin resolution ────────────────────────────────

/**
 * The plugin that declares this venue BY NAME for `market-data:liquidations`.
 *
 * A wildcard declaration is a data source claiming every venue, which for
 * a per-venue collector is a claim it cannot keep: it would answer for a
 * venue nobody watches and the model would relay fabricated coverage. The
 * markets list settles it without spending a request, which is why this
 * never goes through `pluginManager.execute`.
 */
function liquidationProvider(
  plugins: Array<PluginInstance>,
  venue: string,
): PluginInstance | null {
  return (
    plugins.find((plugin) =>
      plugin.manifest.capabilities.some(
        (capability) =>
          capability.id === 'market-data:liquidations' &&
          capability.markets.includes(venue),
      ),
    ) ?? null
  )
}

/** Every venue any active plugin collects liquidations for, named. */
function trackedLiquidationVenues(
  plugins: Array<PluginInstance>,
): Array<string> {
  const venues = new Set<string>()
  for (const plugin of plugins) {
    for (const capability of plugin.manifest.capabilities) {
      if (capability.id !== 'market-data:liquidations') continue
      for (const market of capability.markets) {
        if (market !== '*') venues.add(market)
      }
    }
  }
  return [...venues].sort()
}

/** The context a directly-addressed connector call needs. */
function venueContext(market: string, pair = '') {
  return {
    pair,
    market,
    timeframe: '',
    mode: 'paper' as const,
    country: getCountrySetting(),
  }
}

/** A venue's refusal as the two facts a reader treats differently. */
function describeVenueFailure(error: unknown): {
  error: string | null
  desktopOnly: boolean
} {
  if (isPlatformRestrictedError(error)) {
    return { error: null, desktopOnly: true }
  }
  return {
    error: error instanceof Error ? error.message : String(error),
    desktopOnly: false,
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── The tools ────────────────────────────────────────────────────────

export function buildDataTools(deps: AssistantDeps): ToolSet {
  const activePlugins = () => deps.pluginManager.getActivePlugins()

  return {
    get_economic_calendar: tool({
      description:
        'Scheduled US macro releases (CPI, payrolls, FOMC, GDP) for the days ahead, compiled from the agencies\' own publication calendars, with consensus and prior figures where they are published. Prefer this over deep_research for any "what is coming this week" question: it is one call and the dates are authoritative.',
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(92)
          .optional()
          .describe('Forward window in days. Defaults to a fortnight.'),
      }),
      execute: async ({ days }) => {
        if (!hasAppServer) return STANDALONE
        try {
          const response = await api.getEconomicCalendar(days)
          const window = capped(response.entries)
          return {
            start: response.start,
            end: response.end,
            fetchedAt: response.fetchedAt,
            total: window.total,
            truncated: window.truncated,
            entries: window.rows.map((entry) => ({
              title: entry.title,
              source: entry.source,
              country: entry.country,
              importance: entry.importance,
              date: entry.date,
              // Day-level entries have no clock: FOMC minutes timing drifts,
              // and a fabricated 08:30 would be the one detail a trader acts on.
              releaseAt: isoOf(entry.releaseMs),
              actual: entry.actual ?? null,
              consensus: entry.consensus ?? null,
              prior: entry.prior ?? null,
              // Prediction-market pricing, not a survey. Say so if you cite it.
              implied: entry.implied ?? null,
              impliedSource: entry.impliedSource ?? null,
            })),
          }
        } catch (error) {
          return fundamentalsUnavailable(error)
        }
      },
    }),

    get_earnings_calendar: tool({
      description:
        'Which listed companies report inside a window, with the consensus EPS estimate and the before-open or after-close slot where a source commits to one. Pass symbols to ask about specific tickers rather than sweeping the whole market.',
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(92)
          .optional()
          .describe('Forward window in days. Defaults to the next week.'),
        symbols: z
          .array(z.string())
          .max(25)
          .optional()
          .describe(
            'Bare tickers, e.g. ["NVDA", "AAPL"]. Omit for the whole market.',
          ),
      }),
      execute: async ({ days, symbols }) => {
        if (!hasAppServer) return STANDALONE
        try {
          const response = await api.getEarningsCalendar({ days, symbols })
          const window = capped(response.entries)
          return {
            start: response.start,
            end: response.end,
            fetchedAt: response.fetchedAt,
            total: window.total,
            truncated: window.truncated,
            entries: window.rows.map((entry) => ({
              symbol: entry.symbol,
              name: entry.name,
              reportDate: entry.reportDate,
              // Absent means no source stated the slot, not "during the day".
              reportTime: entry.reportTime ?? null,
              fiscalDateEnding: entry.fiscalDateEnding,
              epsEstimate: entry.epsEstimate,
              currency: entry.currency,
            })),
          }
        } catch (error) {
          return fundamentalsUnavailable(error)
        }
      },
    }),

    get_company_fundamentals: tool({
      description:
        "One listed company as a business: market cap, margins, growth, valuation multiples, the 52-week range, analyst ratings and its next scheduled report. Read this before answering anything about an equity's size, profitability or valuation, rather than inferring from the chart.",
      inputSchema: z.object({
        symbol: z.string().describe('Bare ticker, e.g. "NVDA".'),
      }),
      execute: async ({ symbol }) => {
        const ticker = symbol.trim().toUpperCase()
        if (ticker.length === 0) {
          return { error: 'A ticker is required, e.g. "NVDA".' }
        }
        if (!hasAppServer) return STANDALONE
        try {
          const response = await api.getCompanyOverview(ticker)
          return {
            symbol: ticker,
            // Null here is coverage, not failure: the provider knows no such
            // symbol. Crypto and prediction tickers land here all the time.
            covered: response.fundamentals !== null,
            fundamentals: response.fundamentals,
            nextEarnings: response.nextEarnings,
            fetchedAt: response.fetchedAt,
            note: 'sharesOutstanding is the share count, not free float. No provider here publishes float or short interest.',
          }
        } catch (error) {
          return fundamentalsUnavailable(error)
        }
      },
    }),

    get_ipo_calendar: tool({
      description:
        'Upcoming US listings with expected date, exchange and price range. Nothing in here trades yet, so there is no chart or quote to read instead.',
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(180)
          .optional()
          .describe(
            "Forward window in days. Defaults to the provider's whole pipeline, roughly three months.",
          ),
      }),
      execute: async ({ days }) => {
        if (!hasAppServer) return STANDALONE
        try {
          const response = await api.getIpoCalendar({ days })
          const window = capped(response.entries)
          return {
            fetchedAt: response.fetchedAt,
            total: window.total,
            truncated: window.truncated,
            entries: window.rows.map((entry) => ({
              symbol: entry.symbol,
              name: entry.name,
              date: entry.date,
              exchange: entry.exchange,
              priceRangeLow: entry.priceRangeLow,
              priceRangeHigh: entry.priceRangeHigh,
              currency: entry.currency,
            })),
          }
        } catch (error) {
          return fundamentalsUnavailable(error)
        }
      },
    }),

    get_insider_activity: tool({
      description:
        "One company's recent Form 4 filings, newest first, with a buy against sell summary over the span actually on file. An empty list is a real answer: plenty of companies go a quarter without a filing, so say that rather than reporting the data as missing.",
      inputSchema: z.object({
        symbol: z.string().describe('Bare ticker, e.g. "NVDA".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_ROWS)
          .optional()
          .describe(
            'Filings to return. The summary always covers all of them.',
          ),
      }),
      execute: async ({ symbol, limit }) => {
        const ticker = symbol.trim().toUpperCase()
        if (ticker.length === 0) {
          return { error: 'A ticker is required, e.g. "NVDA".' }
        }
        if (!hasAppServer) return STANDALONE
        try {
          const response = await api.getInsiderTransactions(ticker)
          const transactions: Array<InsiderTransaction> =
            response.transactions ?? []
          // Summarized over everything on file, then the rows are capped. A
          // summary of the visible rows would report a different company.
          const summary = summarizeInsiderActivity(transactions)
          const window = capped(transactions, limit ?? MAX_ROWS)
          return {
            symbol: response.symbol,
            fetchedAt: response.fetchedAt,
            summary: {
              buys: summary.buys,
              sells: summary.sells,
              // Stating the span is what stops "2 buys, 40 sells" reading as
              // a month of selling when it is three years of it.
              spanDays: summary.spanDays,
            },
            total: window.total,
            truncated: window.truncated,
            transactions: window.rows.map((tx) => ({
              name: tx.name,
              title: tx.title,
              type: tx.type,
              date: tx.date,
              shares: tx.shares,
              sharePrice: tx.sharePrice,
              // Null unless both halves are filed. A grant has no price, and
              // valuing it at zero would read as a worthless transaction.
              valueUsd: insiderValue(tx.shares, tx.sharePrice),
              security: tx.security,
            })),
          }
        } catch (error) {
          return fundamentalsUnavailable(error)
        }
      },
    }),

    get_new_listings: tool({
      description:
        'Pairs that started trading recently, merging CEX listings our own sweeper first saw with newly created DEX pools above a liquidity floor. Use it for "what is new" questions; instrument search ranks by coverage and would bury a two-day-old listing.',
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe(
            'Lookback for the CEX half in days. Defaults to a fortnight.',
          ),
        chains: z
          .array(z.string())
          .max(8)
          .optional()
          .describe(
            'Pairlens market ids for the on-chain half, e.g. ["base", "jupiter"]. Defaults to the four the discovery tab sweeps.',
          ),
        limit: z.number().int().min(1).max(MAX_ROWS).optional(),
      }),
      execute: async (
        { days, chains, limit },
        options?: { abortSignal?: AbortSignal },
      ) => {
        const markets =
          chains && chains.length > 0 ? chains : [...NEW_POOL_MARKETS]
        const notes: Array<string> = []

        // The CEX half needs the App Server; the DEX half never did. A
        // standalone build still answers with pools rather than refusing
        // the whole question, which is what the discovery tab does.
        let cexEntries: NewListingsResponse['entries'] = []
        let trackingSince: number | null = null
        if (hasAppServer) {
          try {
            const response = await api.getNewListings(days)
            cexEntries = response.entries ?? []
            trackingSince = response.trackingSince
          } catch (error) {
            notes.push(
              `The venue-listings feed failed (${messageOf(error)}), so only on-chain pools are below.`,
            )
          }
        } else {
          notes.push(
            'This build has no App Server, so venue listings are unavailable and only on-chain pools are below.',
          )
        }

        const dexRows: Array<NewPoolRow> = []
        if (!options?.abortSignal?.aborted) {
          const settled = await Promise.allSettled(
            markets.map(async (market) => {
              const response = (await deps.pluginManager.execute(
                'market-data:pool-stats',
                // `market` explicitly on every call: the manager context
                // carries whatever pair is charted, which on a second chain
                // would resolve pools somewhere else entirely.
                { action: 'new-pools', market },
              )) as PoolListingResponse | null
              return (response?.pools ?? []).map(
                (pool): NewPoolRow => ({ market, pool }),
              )
            }),
          )
          const refused: Array<string> = []
          settled.forEach((result, index) => {
            if (result.status === 'fulfilled') dexRows.push(...result.value)
            else refused.push(markets[index])
          })
          if (refused.length > 0) {
            notes.push(`No pool data came back for: ${refused.join(', ')}.`)
          }
        }

        // Merged unbounded, then capped here, so `total` is the number of rows
        // that actually cleared the liquidity floor rather than the cap itself.
        const rows = mergeNewListings(
          cexEntries,
          dexRows,
          Number.MAX_SAFE_INTEGER,
        )
        const window = capped(rows, limit ?? MAX_ROWS)
        if (
          rows.length === 0 &&
          cexEntries.length === 0 &&
          dexRows.length === 0
        ) {
          return {
            listings: [],
            total: 0,
            truncated: false,
            trackingSince: isoOf(trackingSince),
            notes,
            unavailable: hasAppServer ? 'upstream_error' : 'standalone',
            hint: 'Neither source answered, so this is silence from the feeds rather than a quiet week.',
          }
        }

        return {
          total: window.total,
          truncated: window.truncated,
          // Nothing older than this can appear: it is when baseline stamping
          // began, not when the venues started listing things.
          trackingSince: isoOf(trackingSince),
          notes,
          listings: window.rows.map((row) => ({
            kind: row.kind,
            label: row.label,
            market: row.market,
            base: row.base,
            quote: row.quote,
            listedAt: isoOf(row.listedAt),
            listedAtMs: row.listedAt,
            priceUsd: row.priceUsd,
            liquidityUsd: row.liquidityUsd,
          })),
          note: "A CEX row timestamp is when our sweeper first saw the pair listed, accurate to the sweep interval. A DEX row carries the pool's own creation block and is exact.",
        }
      },
    }),

    get_liquidation_clusters: tool({
      description:
        'Where forced liquidations happened on one perpetual contract, collapsed onto price buckets over a chosen window, with long and short totals kept apart. Only venues the collector watches have this, and it names the ones that do rather than answering empty.',
      inputSchema: z.object({
        venue: z
          .string()
          .optional()
          .describe(
            'Futures venue market id, e.g. "binance-futures". Defaults to the charted venue.',
          ),
        pair: z
          .string()
          .optional()
          .describe(
            'Three-segment perp key, e.g. "BTC-USDT-USDT". Defaults to the charted pair.',
          ),
        hours: z
          .number()
          .int()
          .min(1)
          .max(72)
          .optional()
          .describe("Window in hours. 72 is the collector's full retention."),
      }),
      execute: async ({ venue, pair, hours }) => {
        const focus = deps.getFocus()
        const market = (venue ?? focus.market ?? '').trim()
        const pairKey = (pair ?? focus.pair ?? '').trim()
        const window = hours ?? 24
        const plugins = activePlugins()
        const tracked = trackedLiquidationVenues(plugins)

        if (!market || !pairKey) {
          return {
            error:
              'Name a venue and a perpetual pair, e.g. venue "binance-futures", pair "BTC-USDT-USDT".',
            trackedVenues: tracked,
          }
        }
        if (!hasAppServer)
          return { ...STANDALONE, venue: market, pair: pairKey }

        // Resolved by name, never through the manager: its fallback chain
        // would hand this to a plugin that does not collect the venue and
        // the answer would read as coverage we do not have.
        const provider = liquidationProvider(plugins, market)
        if (!provider) {
          return {
            venue: market,
            pair: pairKey,
            unavailable: 'not_tracked',
            hint:
              tracked.length > 0
                ? `No collector watches ${market}. Venues with liquidation data: ${tracked.join(', ')}.`
                : `No collector watches ${market}, and no installed plugin collects liquidations for any venue.`,
            trackedVenues: tracked,
          }
        }

        let answer:
          | LiquidationClustersResponse
          | LiquidationsUnavailableResponse
        try {
          answer = (await provider.execute({
            capability: 'market-data:liquidations',
            params: { venue: market, pair: pairKey, hours: window },
            context: venueContext(market, pairKey),
          })) as LiquidationClustersResponse | LiquidationsUnavailableResponse
        } catch (error) {
          return {
            venue: market,
            pair: pairKey,
            error: messageOf(error),
          }
        }

        if (
          answer &&
          'error' in answer &&
          answer.error === 'liquidations_unavailable'
        ) {
          return {
            venue: market,
            pair: pairKey,
            unavailable: answer.reason,
            trackedSince: isoOf(answer.trackedSince ?? null),
            hint:
              answer.reason === 'collecting'
                ? 'The collector watches this contract but has not held it long enough to draw a window yet.'
                : 'The collector does not watch this contract.',
            trackedVenues: tracked,
          }
        }

        const response = answer as LiquidationClustersResponse
        const buckets = response.buckets ?? []
        const totals = liquidationTotals(buckets)
        const clusters = aggregateByPrice(buckets)

        // Over the cap, keep the heaviest buckets and put them back in price
        // order. Slicing the price range instead would report liquidations
        // stopping at whatever price the cap landed on.
        const kept =
          clusters.length > MAX_BUCKETS
            ? [...clusters]
                .sort((a, b) => b.total - a.total)
                .slice(0, MAX_BUCKETS)
                .sort((a, b) => a.price - b.price)
            : clusters

        return {
          venue: response.venue,
          pair: response.pairKey,
          hours: window,
          bucketWidth: response.bucketWidth,
          retentionHours: Math.round(response.retentionMs / 3_600_000),
          trackedSince: isoOf(response.trackedSince),
          // 'sampled' means the venue stream drops prints during cascades, so
          // the magnitudes undercount exactly when they matter. Say so.
          completeness: response.completeness,
          totals: {
            longNotionalUsd: totals.long,
            shortNotionalUsd: totals.short,
            totalNotionalUsd: totals.total,
            events: totals.count,
          },
          total: clusters.length,
          truncated: clusters.length > MAX_BUCKETS,
          clusters: kept.map((cluster) => ({
            price: cluster.price,
            longNotionalUsd: cluster.longNotional,
            shortNotionalUsd: cluster.shortNotional,
            totalNotionalUsd: cluster.total,
            events: cluster.count,
            dominantSide: dominantSide(cluster),
          })),
          note: "'long' means longs were liquidated, which is forced selling. The two sides are never summed.",
        }
      },
    }),

    get_funding_rates: tool({
      description:
        'Current funding rates and open interest across the active perpetual venues, for named contracts or the whole board. This is the read behind carry, basis and "who is paying whom" questions. A venue that refuses is reported as refusing, never as zero.',
      inputSchema: z.object({
        venues: z
          .array(z.string())
          .max(8)
          .optional()
          .describe(
            'Venue market ids, e.g. ["binance-futures"]. Defaults to every active perpetual venue.',
          ),
        pairs: z
          .array(z.string())
          .max(25)
          .optional()
          .describe(
            'Exact perp keys, e.g. ["BTC-USDT-USDT"]. Cheapest path when you know the contract.',
          ),
        bases: z
          .array(z.string())
          .max(25)
          .optional()
          .describe(
            'Assets, e.g. ["BTC", "ETH"]. Resolved venue-side, so you never have to know a venue\'s own spelling.',
          ),
        openInterest: z
          .boolean()
          .optional()
          .describe(
            'Also read open interest for the returned contracts. On by default.',
          ),
      }),
      execute: async (
        { venues, pairs, bases, openInterest },
        options?: { abortSignal?: AbortSignal },
      ) => {
        const all = futuresPluginsFor(activePlugins(), 'market-data:funding')
        if (all.length === 0) {
          return {
            unavailable: 'no_futures_venue',
            hint: 'No perpetual-futures connector is installed and active, so there is no funding to read. The user can install one from the Plugin Store.',
          }
        }

        let scoped: Array<VenuePlugin> = all
        if (venues && venues.length > 0) {
          const wanted = new Set(venues.map((v) => v.trim().toLowerCase()))
          scoped = all.filter((venue) => wanted.has(venue.market.toLowerCase()))
          if (scoped.length === 0) {
            return {
              error: 'None of those venues is active here.',
              activeVenues: all.map((venue) => venue.market),
            }
          }
        }

        const named = pairs && pairs.length > 0
        const results = await Promise.all(
          scoped.map(async (venue) => {
            try {
              const response = (await venue.plugin.execute({
                capability: 'market-data:funding',
                params: {
                  action: 'funding-rates',
                  ...(named ? { pairs } : {}),
                  ...(bases && bases.length > 0 ? { bases } : {}),
                },
                context: venueContext(venue.market),
              })) as FundingSnapshotResponse
              const entries: Array<FundingRateEntry> = Array.isArray(
                response?.entries,
              )
                ? response.entries
                : []
              // A venue-wide sweep is hundreds of contracts and the model
              // wants the extremes, so an unscoped read is ranked by absolute
              // rate. A scoped one keeps the venue's own order.
              const ordered =
                named || (bases && bases.length > 0)
                  ? entries
                  : [...entries].sort(
                      (a, b) =>
                        Math.abs(b.fundingRate) - Math.abs(a.fundingRate),
                    )
              return {
                venue,
                entries: ordered,
                error: null,
                desktopOnly: false,
              }
            } catch (error) {
              return {
                venue,
                entries: [] as Array<FundingRateEntry>,
                ...describeVenueFailure(error),
              }
            }
          }),
        )

        // Open interest is a second call per contract on two of the three
        // venues, so it only ever covers the contracts already being returned.
        const oiByMarket = new Map<string, Array<OpenInterestEntry>>()
        const oiUnsupported = new Set<string>()
        if (openInterest !== false && !options?.abortSignal?.aborted) {
          await Promise.all(
            results.map(async (result) => {
              const wanted = result.entries
                .slice(0, MAX_OI_PAIRS)
                .map((entry) => entry.pair)
              if (wanted.length === 0) return
              try {
                const response = (await result.venue.plugin.execute({
                  capability: 'market-data:funding',
                  params: {
                    action: 'open-interest',
                    pairs: wanted,
                    history: false,
                  },
                  context: venueContext(result.venue.market),
                })) as OpenInterestResponse
                if (response?.supported === false) {
                  oiUnsupported.add(result.venue.market)
                  return
                }
                oiByMarket.set(
                  result.venue.market,
                  Array.isArray(response?.entries) ? response.entries : [],
                )
              } catch {
                // Funding is the answer; open interest is the garnish. A
                // venue that refuses the second call still reports its rates.
                oiUnsupported.add(result.venue.market)
              }
            }),
          )
        }

        return {
          venues: results.map((result) => {
            const window = capped(result.entries)
            const oi = oiByMarket.get(result.venue.market) ?? []
            const oiByPair = new Map(oi.map((entry) => [entry.pair, entry]))
            return {
              venue: result.venue.market,
              label: result.venue.label,
              // Desktop-only venues are a fact about this build, not an outage.
              desktopOnly: result.desktopOnly,
              error: result.error,
              openInterestSupported: !oiUnsupported.has(result.venue.market),
              total: window.total,
              truncated: window.truncated,
              rankedBy:
                named || (bases && bases.length > 0)
                  ? 'venue order'
                  : 'absolute funding rate, descending',
              rates: window.rows.map((entry) => {
                const oiEntry = oiByPair.get(entry.pair)
                return {
                  pair: entry.pair,
                  base: entry.base,
                  quote: entry.quote,
                  // One interval, signed the way every venue signs it:
                  // positive means longs pay shorts.
                  fundingRate: entry.fundingRate,
                  intervalHours: entry.intervalHours,
                  // False when the connector fell back to the venue's ordinary
                  // period rather than the venue stating it.
                  intervalKnown: entry.intervalKnown,
                  annualizedPct:
                    entry.intervalHours > 0
                      ? entry.fundingRate * (8760 / entry.intervalHours) * 100
                      : null,
                  nextFundingAt: isoOf(entry.nextFundingMs),
                  markPrice: entry.markPrice ?? null,
                  predictedRate: entry.predictedRate ?? null,
                  openInterest: oiEntry
                    ? {
                        contracts: oiEntry.amount ?? null,
                        // Not 1 everywhere: KuCoin's XBTUSDTM is 0.001 BTC, and
                        // ignoring it overstates open interest a thousandfold.
                        contractSize: oiEntry.contractSize ?? null,
                        valueQuote: oiEntry.value ?? null,
                      }
                    : null,
                }
              }),
            }
          }),
          note: 'Positive funding means longs pay shorts. Annualized is the interval rate scaled to a year and assumes the rate holds, which it does not.',
        }
      },
    }),

    get_pool_stats: tool({
      description:
        'On-chain state for one liquidity pool: price in USD and in the quote token, 1h and 24h moves, volume, value locked, fee tier and which provider measured it. Per-side token reserves are only published by some providers, and the result says when they are missing rather than reporting zero.',
      inputSchema: z.object({
        market: z
          .string()
          .optional()
          .describe(
            'Chain market id, e.g. "base", "jupiter". Defaults to the charted market.',
          ),
        pair: z
          .string()
          .optional()
          .describe(
            'Pair key as the terminal carries it. Defaults to the charted pair.',
          ),
      }),
      execute: async ({ market, pair }) => {
        const focus = deps.getFocus()
        const chain = (market ?? focus.market ?? '').trim()
        const pairKey = (pair ?? focus.pair ?? '').trim()
        if (!chain || !pairKey) {
          return {
            error:
              'Name a chain market and a pair, e.g. market "base", pair "0x…-USDC".',
          }
        }

        let stats: PoolStats | null
        try {
          stats = (await deps.pluginManager.execute('market-data:pool-stats', {
            action: 'stats',
            market: chain,
            pair: pairKey,
          })) as PoolStats | null
        } catch (error) {
          return { market: chain, pair: pairKey, error: messageOf(error) }
        }

        if (!stats) {
          return {
            market: chain,
            pair: pairKey,
            noPool: true,
            hint: 'The provider answered and there is no pool for this pair on this chain.',
          }
        }

        const reservesMissing =
          stats.baseReserve === null || stats.quoteReserve === null

        return {
          market: chain,
          pair: pairKey,
          network: stats.network,
          address: stats.address,
          name: stats.name,
          dexName: stats.dexName,
          baseSymbol: stats.baseSymbol,
          quoteSymbol: stats.quoteSymbol,
          priceUsd: stats.priceUsd,
          priceInQuote: stats.priceInQuote,
          change1hPct: stats.change1hPct,
          change24hPct: stats.change24hPct,
          volume1hUsd: stats.volume1hUsd,
          volume24hUsd: stats.volume24hUsd,
          reserveUsd: stats.reserveUsd,
          baseReserve: stats.baseReserve,
          quoteReserve: stats.quoteReserve,
          feeTier: stats.feeTier,
          fdvUsd: stats.fdvUsd,
          createdAt: stats.createdAt,
          source: stats.source,
          ...(reservesMissing
            ? {
                reservesNote:
                  'This provider publishes total value locked but not per-side token reserves, so pool depth on each side is unknown here. The Pool pane fills them from a second provider when one is installed.',
              }
            : {}),
        }
      },
    }),

    get_bridge_quote: tool({
      description:
        'Price a cross-chain transfer: what lands, the guaranteed floor, the bridge fee, source gas and time to land. Quote only. Executing a bridge is something the user does themselves in the Bridge pane, so give them the numbers and point them there.',
      inputSchema: z.object({
        fromMarket: z
          .string()
          .describe(
            'Source chain market id, e.g. "ethereum", "base", "arbitrum".',
          ),
        toMarket: z.string().describe('Destination chain market id.'),
        symbol: z.string().describe('Asset to move, e.g. "USDC".'),
        amount: z
          .string()
          .describe('Amount in symbol units, as a decimal string, e.g. "250".'),
        address: z
          .string()
          .optional()
          .describe(
            'Sender address when one is known. The connector falls back to a probe address, which changes nothing about the price.',
          ),
      }),
      execute: async ({ fromMarket, toMarket, symbol, amount, address }) => {
        // The same predicate the Bridge pane resolves with: any active plugin
        // declaring the read capability. A quote names two chains, so this is
        // never resolved through the manager, whose context knows only one chain.
        const plugin =
          activePlugins().find((candidate) =>
            candidate.manifest.capabilities.some(
              (capability) => capability.id === 'market-data:bridge',
            ),
          ) ?? null

        if (!plugin) {
          return {
            unavailable: 'no_bridge_plugin',
            hint: 'No bridge connector is installed and active, so no route can be priced. The user can install the LI.FI bridge connector from the Plugin Store.',
          }
        }

        const size = Number(amount)
        if (!Number.isFinite(size) || size <= 0) {
          return { error: 'Amount must be a positive number, e.g. "250".' }
        }

        try {
          const quote = await fetchBridgeQuote(plugin, {
            fromMarket,
            toMarket,
            symbol,
            amount,
            address: address ?? null,
          })
          if (!quote) {
            return {
              error:
                'The bridge connector returned nothing for that route. Check the two market ids.',
            }
          }
          if (isBridgeRefusal(quote)) {
            return {
              refused: true,
              reason: quote.reason,
              market: quote.market,
              symbol: quote.symbol,
              hint: 'Report the reason as-is. A refused route is a fact about the route, not a failure to retry.',
            }
          }
          return {
            fromMarket: quote.fromMarket,
            toMarket: quote.toMarket,
            symbol: quote.symbol,
            toSymbol: quote.toSymbol,
            amount: quote.amount,
            amountOut: quote.amountOut,
            // What execution is actually checked against.
            amountOutMin: quote.amountOutMin,
            // Two numbers on purpose: the bridge cut and the source chain
            // charge are different money and different things go wrong.
            feeUsd: quote.feeUsd,
            feeIncludedInAmountOut: quote.feeIncluded,
            gasUsd: quote.gasUsd,
            etaSeconds: quote.etaSeconds,
            bridge: quote.tool,
            provider: quote.provider,
            quotedAt: isoOf(quote.quotedAt),
            note: "A quote goes stale in about a minute. Executing the transfer is the user's own action in the Bridge pane; this tool cannot send anything.",
          }
        } catch (error) {
          return { error: messageOf(error) }
        }
      },
    }),
  }
}

/**
 * Chip labels for the reads above.
 *
 * Kept beside the tools rather than in the shared table so a tool and its
 * label are added in one edit. `ASSISTANT_ALL_TOOL_LABELS` spreads it.
 */
export const DATA_TOOL_LABELS = {
  get_economic_calendar: ['read', 'the economic calendar'],
  get_earnings_calendar: ['read', 'the earnings calendar'],
  get_company_fundamentals: ['read', 'the company fundamentals'],
  get_ipo_calendar: ['read', 'the IPO calendar'],
  get_insider_activity: ['read', 'the insider filings'],
  get_new_listings: ['read', 'the new listings'],
  get_liquidation_clusters: ['read', 'the liquidation clusters'],
  get_funding_rates: ['read', 'funding and open interest'],
  get_pool_stats: ['read', 'the pool stats'],
  get_bridge_quote: ['read', 'a bridge quote'],
} as const satisfies ToolLabelMap
