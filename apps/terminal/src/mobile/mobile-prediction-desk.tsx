// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The phone's prediction desk: one event resolved once, for the whole shell.
 *
 * The desktop mounts this from its route, where the venue is a path segment.
 * The phone has no such segment above the chart — its venue lives in chart
 * config — so the desk is mounted INSIDE `ChartTerminalProvider` and reads the
 * venue from there. That inverts the dependency the desktop has: the provider
 * needs a leg to stream, and the leg comes from the desk below it. The loop is
 * broken the same way the desktop breaks it, by starting with no leg at all
 * and letting the field fill it in. Streams no-op on an empty pair key, so the
 * cost of that first pass is nothing subscribed rather than something wrong
 * subscribed.
 *
 * Renders its children untouched for every other asset class. A phone charting
 * BTC-USDT pays one context read and no request.
 */
import { useEffect } from 'react'

import type { ReactNode } from 'react'

import { PredictionDeskProvider } from '@/lib/predictions/desk-context'
import { useChartConfig } from '@/lib/chart-terminal-context'
import { usePredictionDeskState } from '@/hooks/use-prediction-desk'
import { PredictionAssistantSurface } from '@/components/predictions/prediction-assistant-surface'

export function MobilePredictionDesk({
  eventKey,
  selectedKey,
  onSelectOutcome,
  children,
}: {
  /** The focused event, or '' when the phone is not on a prediction. */
  eventKey: string
  /** The leg the shell currently holds, or '' before the field resolves. */
  selectedKey: string
  onSelectOutcome: (outcomeKey: string) => void
  children: ReactNode
}) {
  if (eventKey === '') return <>{children}</>
  return (
    <Desk
      eventKey={eventKey}
      onSelectOutcome={onSelectOutcome}
      selectedKey={selectedKey}
    >
      {children}
    </Desk>
  )
}

function Desk({
  eventKey,
  selectedKey,
  onSelectOutcome,
  children,
}: {
  eventKey: string
  selectedKey: string
  onSelectOutcome: (outcomeKey: string) => void
  children: ReactNode
}) {
  const { market } = useChartConfig()
  const desk = usePredictionDeskState({
    venue: market,
    eventKey,
    selectedKey,
    onSelect: onSelectOutcome,
  })

  // Lift the resolution. On the desktop the selected leg IS the URL and the
  // route reads it back; here the shell holds it, so the desk has to hand it
  // up before anything can stream. Guarded on inequality rather than on
  // "selectedKey is empty", because the desk also corrects a leg that this
  // event does not publish — an `?o=` carried in from another question.
  const resolved = desk.selected?.pairKey ?? ''
  useEffect(() => {
    if (resolved === '' || resolved === selectedKey) return
    onSelectOutcome(resolved)
  }, [resolved, selectedKey, onSelectOutcome])

  // The phone renders no orb, but its Assistant tab is the same conversation
  // against the same registry — so the event has to be published here too.
  return (
    <PredictionDeskProvider desk={desk}>
      <PredictionAssistantSurface />
      {children}
    </PredictionDeskProvider>
  )
}
