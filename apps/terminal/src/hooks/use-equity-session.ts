// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The trading day, as the broker keeps it.
 *
 * One shared entry for every surface that cares where the session is: the two
 * clock panes, the Level 1 range, and the ticket, which has to force limit
 * orders outside regular hours. They share react-query keys, so mounting all
 * four costs the same two requests as mounting one.
 *
 * Two cadences, because the two answers age differently. The clock is a
 * moving fact and is polled every 30 seconds while something is watching; the
 * calendar is a schedule published in advance, fetched for a window that spans
 * more than a week and left alone.
 *
 * `tick` is opt-in for the same reason: a countdown needs a re-render every
 * second and the order ticket does not. Only the panes that draw a countdown
 * ask for it.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type {
  MarketSessionCalendar,
  MarketSessionClock,
} from '@pairlens/shared/instrument-types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

import type { CredentialGateState } from '@/hooks/use-market-credential-gate'
import type { SessionState } from '@/lib/equities/session'
import { usePairlens } from '@/lib/pairlens-provider'
import { getCountrySetting } from '@/lib/region-settings'
import { venuePluginsFor } from '@/lib/venues/venue-plugins'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { resolveSessionState } from '@/lib/equities/session'

/** Fallback zone for labels while the venue's own answer is still in flight. */
const DEFAULT_SESSION_TZ = 'America/New_York'

export type EquitySessionVenue = {
  plugin: PluginInstance
  market: string
  label: string
}

export type EquitySession = {
  /** Null until at least one of the two reads answers. */
  state: SessionState | null
  /** The instant the state was resolved against, venue-corrected. */
  nowMs: number
  timeZone: string
  venue: EquitySessionVenue | null
  /** Credential state of the serving venue — the panes' connect gate. */
  gate: CredentialGateState
  venueLabel: string
  isPending: boolean
  /** What the venue said went wrong, verbatim, or null. */
  error: string | null
}

/** The first stock venue that publishes a trading calendar. */
export function useEquitySessionVenue(): EquitySessionVenue | null {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      venuePluginsFor(
        pluginManager.getActivePlugins(),
        'market-data:session',
        'stocks',
      )[0] ?? null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )
}

export function useEquitySession(options?: {
  tick?: boolean
  /**
   * Poll at all. The order ticket mounts this hook on every pair route and
   * only cares on a stock one, so it passes false elsewhere rather than
   * asking a broker for its calendar while the user charts BTC.
   */
  enabled?: boolean
}): EquitySession {
  const venue = useEquitySessionVenue()
  const { state: gate, venueLabel } = useMarketCredentialGate(
    venue?.market ?? '',
  )
  const enabled = venue !== null && gate === 'ok' && options?.enabled !== false

  const clockQuery = useQuery({
    queryKey: ['equity-session-clock', venue?.market],
    queryFn: () =>
      executeSession<MarketSessionClock>(venue!, { action: 'clock' }),
    enabled,
    // A phase flip is worth at most half a minute of staleness, and the
    // countdown interpolates between polls off the venue-corrected clock.
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 1,
  })

  const calendarQuery = useQuery({
    queryKey: ['equity-session-calendar', venue?.market],
    queryFn: () =>
      executeSession<MarketSessionCalendar>(venue!, { action: 'calendar' }),
    enabled,
    // The connector asks for yesterday through next week, so a rollover at
    // midnight is already covered by data in hand.
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })

  // The venue's clock, not the laptop's. A machine whose clock is five minutes
  // fast would otherwise count down to a close that has not happened, and the
  // one number a session strip must never invent is the time.
  const skewMs = clockQuery.data
    ? clockQuery.data.nowMs - clockQuery.dataUpdatedAt
    : 0

  // A ticking caller advances every second. A still one advances only when a
  // poll lands, which pins `nowMs` to the venue's own reported instant and
  // keeps the derived state referentially stable between renders — the order
  // ticket must not re-derive on every keystroke in the price field.
  const tickNow = useSessionNow(options?.tick === true)
  const nowMs =
    (options?.tick === true ? tickNow : clockQuery.dataUpdatedAt || tickNow) +
    skewMs

  const state = useMemo(() => {
    if (!clockQuery.data && !calendarQuery.data) return null
    return resolveSessionState({
      nowMs,
      clock: clockQuery.data ?? null,
      days: calendarQuery.data?.days ?? [],
    })
  }, [clockQuery.data, calendarQuery.data, nowMs])

  return {
    state,
    nowMs,
    timeZone:
      calendarQuery.data?.timeZone ??
      clockQuery.data?.timeZone ??
      DEFAULT_SESSION_TZ,
    venue,
    gate,
    venueLabel,
    isPending: enabled && clockQuery.isPending && calendarQuery.isPending,
    error: errorMessage(clockQuery.error) ?? errorMessage(calendarQuery.error),
  }
}

/**
 * The phase alone, for callers that only branch on it (the order ticket).
 *
 * Never ticks: the ticket re-rendering once a second while someone types a
 * price is a real cost, and a boundary crossed up to thirty seconds ago is
 * caught by the next clock poll.
 */
export function useEquitySessionPhase(
  enabled = true,
): SessionState['phase'] | null {
  return useEquitySession({ enabled }).state?.phase ?? null
}

// ── Pieces ────────────────────────────────────────────────────────────

async function executeSession<T>(
  venue: EquitySessionVenue,
  params: Record<string, unknown>,
): Promise<T> {
  // Called on the connector directly, like every other fan-out read: the
  // resolver picks one winner per capability and shares a mutable market
  // context, and a session answer has to be attributable to the venue that
  // gave it.
  return (await venue.plugin.execute({
    capability: 'market-data:session',
    params,
    context: {
      pair: '',
      market: venue.market,
      timeframe: '',
      mode: 'paper' as const,
      country: getCountrySetting(),
    },
  })) as T
}

function errorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof Error ? error.message : String(error)
}

/**
 * A once-a-second clock, mounted only where a countdown is on screen.
 *
 * Returns the host instant; the caller adds the venue skew, and a non-ticking
 * caller uses it only as the mount-time fallback before the first poll lands.
 */
function useSessionNow(tick: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!tick) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tick])

  return now
}
