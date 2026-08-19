// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The event on screen, published to the assistant ──────────────────
//
// A prediction board is the one instrument route with no candle chart on
// it: the price chart is replaced by the multi-outcome probability chart,
// so the chart service never registers and, before this existed, the
// assistant's entire view of the board was the address. Asked "is any of
// these a safe bet?" it could name the event id and nothing else — not
// the question, not the runners, not a single price — because none of it
// was ever published.
//
// So the desk publishes itself. It already holds the one resolution every
// pane on the board reads, which makes it both the cheapest place to do
// this and the only one that cannot disagree with what the user is seeing.
//
// It also names the FOCUS, and that is the half that fixes the tools. An
// event has no book; a leg does. Pointing the market tools at the selected
// outcome is what makes get_ticker, get_orderbook and place_order address
// the thing the ticket is already addressing.

import type {
  AssistantSuggestion,
  AssistantSurfaceContext,
  AssistantSurfaceFocus,
} from '@/lib/assistant-core/types'
import { usePredictionDesk } from '@/lib/predictions/desk-context'
import {
  SURFACE_RUNNERS,
  describePredictionEvent,
  readPredictionEvent,
} from '@/lib/predictions/assistant-summary'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'

/** What a desk that has not resolved yet can still honestly say. */
const UNRESOLVED: Record<string, string> = {
  loading: 'The venue has not answered yet, so the outcomes are not readable.',
  'no-venue':
    'No prediction connector for this venue is installed and active, so the outcomes cannot be read at all.',
  'desktop-only':
    'This venue refuses browser origins, so its events are only readable in the desktop app.',
  'not-found':
    'The venue answered but does not list this event; it may have resolved or been delisted.',
  error: 'The venue failed to answer.',
}

export function PredictionAssistantSurface() {
  const desk = usePredictionDesk()

  useAssistantSurface({
    id: 'prediction-desk',
    // Above the chart's 50. On this board the event IS the instrument, and
    // the probability chart is a reading of it rather than a separate one.
    getPriority: () => (desk ? 120 : -1000),
    revision: `${desk?.venue ?? ''}:${desk?.eventKey ?? ''}:${desk?.selected?.pairKey ?? ''}:${desk?.state ?? ''}`,
    getContext: (): AssistantSurfaceContext | null => {
      if (!desk) return null

      if (!desk.event) {
        return {
          summary:
            `The user is on a prediction board for event "${desk.eventKey}" on ${desk.venueLabel}. ${UNRESOLVED[desk.state] ?? ''} ${desk.entry?.title ? `The pinned title is "${desk.entry.title}".` : ''}`.trim(),
          detail: {
            venue: desk.venue,
            eventId: desk.eventKey,
            state: desk.state,
            ...(desk.error ? { venueError: desk.error } : {}),
          },
        }
      }

      const reading = readPredictionEvent(desk.event, SURFACE_RUNNERS)
      // The runner AND the side. `selected.label` alone is the venue's word
      // for the leg, which on a 128-candidate field is the word "Yes" and
      // names nothing: the runner is what the user is looking at.
      const selected = desk.selected
        ? {
            label:
              desk.selected.runner.label === desk.selected.label
                ? desk.selected.label
                : `${desk.selected.runner.label} (${desk.selected.label})`,
            pairKey: desk.selected.pairKey,
            price:
              typeof desk.selected.outcome.price === 'number'
                ? desk.selected.outcome.price
                : null,
          }
        : null

      return {
        summary: describePredictionEvent(reading, selected),
        // The ladder is trimmed hard here on purpose: the screen block is
        // paid for on every step of every turn, and a model that needs the
        // whole field has get_prediction_event for it. `truncated` is what
        // tells it to reach.
        detail: {
          venue: reading.venue,
          eventId: reading.eventId,
          category: reading.category,
          resolvesAt: reading.resolvesAt,
          volume: reading.volume,
          liquidity: reading.liquidity,
          outcomeCount: reading.outcomeCount,
          fieldTotal: reading.fieldTotal,
          selectedOutcome: selected,
          // No pair keys here, deliberately: they are a hundred and ten
          // characters each and would spend the whole block on plumbing the
          // model can fetch. The one key that matters is the selected leg's,
          // which is above.
          topRunners: reading.runners.map((runner) => ({
            label: runner.label,
            yes: runner.yes,
            change24h: runner.change24h,
          })),
          truncated: reading.truncated,
        },
      }
    },
    // The EVENT is the address; the LEG is what has a book, a tape and a
    // ticket. Everything the market tools do is per-leg, so this is the leg.
    //
    // Null before the field resolves, deliberately. Naming the venue and no
    // pair would OUTRANK the address underneath and leave the tools with
    // half a target, which they complete from their own hardcoded default.
    // Saying nothing lets the route floor name the event, which is at least
    // a real identifier the venue can refuse by name.
    getFocus: (): AssistantSurfaceFocus | null =>
      desk?.selected
        ? { market: desk.venue, pair: desk.selected.pairKey }
        : null,
    getSuggestion: (): AssistantSuggestion | null =>
      desk ? { key: 'assistantDock.suggest.predictionEvent' } : null,
  })

  return null
}
