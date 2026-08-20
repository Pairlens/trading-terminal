// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Prediction markets, as tools ─────────────────────────────────────
//
// The one asset class the assistant could not read. Every other class
// had a path to its numbers — candles and books for spot, funding and
// liquidations for perps, pool state for DEX, fundamentals and calendars
// for equities — while an event's outcomes, the only prices a prediction
// market has, were reachable from exactly one place: the pane.
//
// Two tools, matching the two questions. `get_prediction_event` reads one
// event by id, which is what "these" means when the user is looking at a
// board. `search_prediction_events` fans across the active venues, which
// is what "is there a market on X" means anywhere else.
//
// Venues are addressed DIRECTLY rather than through `pluginManager.execute`,
// for the reasons the events browser states: the manager's market context
// is shared mutable state that concurrent calls fight over, its resolver
// picks one winner per capability where a fan-out wants all of them, and a
// venue's own refusal ("Kalshi needs the desktop app") is a fact the user
// has to be told rather than one to hide behind a fallback.
//
// Nothing throws. A throw ends the turn, so every failure leaves as data.

import { tool } from 'ai'
import { z } from 'zod'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
import { PREDICTION_CATEGORY_IDS } from '@pairlens/plugins/prediction-connector/categories'
import { parseMarketRefPath } from '@pairlens/shared/market-ref'
import type { ToolSet } from 'ai'
import type {
  PredictionEventSummary,
  PredictionEventsResponse,
} from '@pairlens/shared/instrument-types'

import type { VenuePlugin } from '@/lib/venues/venue-plugins'
import type { AssistantDeps } from './tool-deps'
import { predictionPluginsFor } from '@/lib/venues/venue-plugins'
import { getCountrySetting } from '@/lib/region-settings'
import {
  TOOL_RUNNERS,
  readPredictionEvent,
} from '@/lib/predictions/assistant-summary'

/**
 * The categories the model may filter by, as a closed enum.
 *
 * Free text here used to reach the venues verbatim, so a model that guessed
 * "Finance" or "World" got an empty board from one venue and a throw from the
 * other. The taxonomy is the same one the rail draws, and the connector
 * translates each id into the venue's own word — see `prediction-connector/
 * categories`.
 */
const PREDICTION_CATEGORY_ENUM = PREDICTION_CATEGORY_IDS as unknown as [
  string,
  ...Array<string>,
]

/** Events per venue a search will pull. The venues serve a page in one call. */
const SEARCH_LIMIT = 40
/** Events per venue the model gets back, ranked by volume. */
const MAX_SEARCH_ROWS = 15

const NO_VENUE = {
  unavailable: 'no_prediction_venue',
  hint: 'No prediction-market connector (Kalshi, Polymarket) is installed and active, so there are no events to read. The user can install one from the Plugin Store.',
} as const

/**
 * The event the user has open, read off the address.
 *
 * Not off the focus: on a prediction board the focus is the selected LEG,
 * because that is what has a book and takes an order, and a leg key is not
 * an event id. The address is the event — that is the whole shape of the
 * prediction route — so it is the honest default here.
 */
function eventOnScreen(): { venue: string; eventId: string } | null {
  // Belt and braces around the host, not just around SSR: a tool that
  // throws ends the assistant's whole turn, and "where is the user" is
  // never worth that. A window with no location is a real shape (a bare
  // global stub, an embedding host), so the read is guarded rather than
  // gated on `typeof window`.
  let pathname: string | undefined
  try {
    pathname = globalThis.window?.location?.pathname
  } catch {
    return null
  }
  if (typeof pathname !== 'string') return null
  const ref = parseMarketRefPath(pathname)
  if (!ref || ref.cls !== 'prediction') return null
  return { venue: ref.market, eventId: ref.id }
}

function venueContext(market: string) {
  return {
    pair: '',
    market,
    timeframe: '',
    mode: 'paper' as const,
    country: getCountrySetting(),
  }
}

/** A venue's answer, or the reason it did not give one. */
type VenueAnswer = {
  venue: string
  label: string
  events: Array<PredictionEventSummary>
  error: string | null
  desktopOnly: boolean
}

async function askVenue(
  venue: VenuePlugin,
  params: Record<string, unknown>,
): Promise<VenueAnswer> {
  try {
    const response = (await venue.plugin.execute({
      capability: 'market-data:events',
      params,
      context: venueContext(venue.market),
    })) as PredictionEventsResponse
    return {
      venue: venue.market,
      label: venue.label,
      events: Array.isArray(response?.events) ? response.events : [],
      error: null,
      desktopOnly: false,
    }
  } catch (error) {
    return {
      venue: venue.market,
      label: venue.label,
      events: [],
      error: isPlatformRestrictedError(error)
        ? null
        : error instanceof Error
          ? error.message
          : String(error),
      desktopOnly: isPlatformRestrictedError(error),
    }
  }
}

/** Refusals, kept alongside the rows so a thin answer is never read as a thin market. */
function refusalsOf(answers: Array<VenueAnswer>) {
  return answers
    .filter((answer) => answer.desktopOnly || answer.error)
    .map((answer) => ({
      venue: answer.venue,
      reason: answer.desktopOnly
        ? 'This venue refuses browser origins and only answers in the desktop app.'
        : answer.error,
    }))
}

export function buildPredictionTools(deps: AssistantDeps): ToolSet {
  const venues = () =>
    predictionPluginsFor(
      deps.pluginManager.getActivePlugins(),
      'market-data:events',
    )

  return {
    get_prediction_event: tool({
      description:
        'Read one prediction-market event in full: its question, category, resolution date and criteria, volume and liquidity, and EVERY tradeable outcome with its probability, bid, ask and 24h move. On a race it also returns the sum of all Yes prices, which is what says whether buying the whole field wins or loses. This is the ONLY way to see prediction prices: candles and order books address one outcome, not the event. Defaults to the event on screen.',
      inputSchema: z.object({
        eventId: z
          .string()
          .optional()
          .describe(
            'Venue-native event id (Kalshi event ticker, Polymarket event id). Defaults to the event the user is looking at.',
          ),
        venue: z
          .string()
          .optional()
          .describe(
            'Venue market id: kalshi or polymarket. Defaults to the venue on screen, else every active one is tried.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(TOOL_RUNNERS)
          .optional()
          .describe(
            `Outcomes to return, favourite first. Defaults to ${TOOL_RUNNERS}; the total is always reported.`,
          ),
      }),
      execute: async ({ eventId, venue, limit }) => {
        const all = venues()
        if (all.length === 0) return NO_VENUE

        const onScreen = eventOnScreen()
        const wantedEvent = eventId?.trim() || (onScreen?.eventId ?? '')
        const wantedVenue = (
          venue ??
          (eventId?.trim() ? '' : (onScreen?.venue ?? '')) ??
          ''
        ).toLowerCase()

        if (wantedEvent === '') {
          return {
            error:
              'No event id given and the user is not on a prediction board. Use search_prediction_events to find one.',
            activeVenues: all.map((entry) => entry.market),
          }
        }

        let scoped = all
        if (wantedVenue !== '') {
          const match = all.filter((entry) => entry.market === wantedVenue)
          if (match.length > 0) scoped = match
        }

        const answers = await Promise.all(
          scoped.map((entry) =>
            askVenue(entry, { eventId: wantedEvent, limit: 1 }),
          ),
        )
        const found = answers
          .flatMap((answer) => answer.events)
          .find((event) => event.markets.length > 0)

        if (!found) {
          const refusals = refusalsOf(answers)
          return {
            eventId: wantedEvent,
            notFound: true,
            // A venue that refused is not a venue that said no. Kalshi in a
            // browser is the case this exists for: the event may be perfectly
            // real and simply unreadable from here.
            ...(refusals.length > 0
              ? {
                  refusals,
                  hint: 'A venue refused rather than answering, so this event may exist and simply be unreadable from this build.',
                }
              : {
                  hint: 'No active venue lists this event. It may have resolved, been delisted, or belong to a venue that is not installed.',
                }),
            venuesTried: scoped.map((entry) => entry.market),
          }
        }

        return {
          ...readPredictionEvent(found, limit ?? TOOL_RUNNERS),
          note: 'Prices are probabilities in collateral units (0 to 1); the UI shows them as cents. `pairKey` is what get_ticker, get_orderbook and place_order take. An event id is not tradeable; a leg is.',
        }
      },
    }),

    search_prediction_events: tool({
      description:
        'Search prediction-market events across every active venue (Kalshi, Polymarket) by free text or category. Returns each event with its id, resolution date, volume and its leading outcomes, so you can answer straight away or drill in with get_prediction_event. Use it for "is there a market on X" and "what are the odds on X".',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Free text, e.g. "fed rate cut". Matched on event titles.'),
        category: z
          .enum(PREDICTION_CATEGORY_ENUM)
          .optional()
          .describe(
            'Category filter, from the terminal own taxonomy. Each venue is sent its own word for it. Either this or query is required by the venues.',
          ),
        venues: z
          .array(z.string())
          .max(4)
          .optional()
          .describe('Venue market ids. Defaults to every active one.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_ROWS)
          .optional()
          .describe(`Events per venue. Defaults to ${MAX_SEARCH_ROWS}.`),
      }),
      execute: async ({ query, category, venues: wanted, limit }) => {
        const all = venues()
        if (all.length === 0) return NO_VENUE

        let scoped = all
        if (wanted && wanted.length > 0) {
          const names = new Set(wanted.map((name) => name.trim().toLowerCase()))
          scoped = all.filter((entry) => names.has(entry.market))
          if (scoped.length === 0) {
            return {
              error: 'None of those venues is active here.',
              activeVenues: all.map((entry) => entry.market),
            }
          }
        }

        if (!query?.trim() && !category?.trim()) {
          return {
            error:
              'Give a query or a category. The venues will not serve an unfiltered event list.',
            activeVenues: scoped.map((entry) => entry.market),
          }
        }

        const answers = await Promise.all(
          scoped.map((entry) =>
            askVenue(entry, {
              ...(query?.trim() ? { query: query.trim() } : {}),
              ...(category?.trim() ? { category: category.trim() } : {}),
              limit: SEARCH_LIMIT,
            }),
          ),
        )

        const cap = limit ?? MAX_SEARCH_ROWS
        const results = answers.map((answer) => {
          // Ranked by volume rather than by the venue's own order: a search
          // that returns forty events and shows fifteen should show the
          // fifteen anybody is trading.
          const ranked = [...answer.events].sort(
            (a, b) => (b.volume ?? 0) - (a.volume ?? 0),
          )
          return {
            venue: answer.venue,
            total: answer.events.length,
            truncated: answer.events.length > cap,
            events: ranked.slice(0, cap).map((event) => {
              const reading = readPredictionEvent(event, 5)
              return {
                eventId: reading.eventId,
                title: reading.title,
                category: reading.category,
                resolvesAt: reading.resolvesAt,
                volume: reading.volume,
                outcomeCount: reading.outcomeCount,
                leadingOutcomes: reading.runners.map((runner) => ({
                  label: runner.label,
                  pairKey: runner.pairKey,
                  yes: runner.yes,
                })),
              }
            }),
          }
        })

        const refusals = refusalsOf(answers)
        return {
          results,
          ...(refusals.length > 0 ? { refusals } : {}),
          note: 'Prices are probabilities in collateral units (0 to 1). Follow up with get_prediction_event for the full field, or navigate_to with the event id to put it on screen.',
        }
      },
    }),
  }
}
