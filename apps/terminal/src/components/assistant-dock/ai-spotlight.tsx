// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Makes a piece of the terminal something the assistant can point at.
 *
 *   <div className="relative ...">
 *     <ChartPane />
 *     <AiSpotlight id="pane:chart" label={t('panes.chart')}
 *                  description="The candlestick chart." />
 *   </div>
 *
 * Two jobs in one component, which is what keeps the call sites to a
 * single line. Mounted, it PUBLISHES the target, so the model is only
 * ever offered somewhere that is actually on screen. Lit, it PAINTS the
 * glow. Everything about how the glow looks and how long it lives is in
 * assistant-spotlight.css.
 *
 * The parent must establish a positioning context and should own the
 * border radius; the overlay is `inset-0` with `border-radius: inherit`,
 * so it traces whatever shape it is dropped into.
 *
 * Renders nothing at all when unlit, which matters more than it looks:
 * these sit inside panes that repaint on every tick, and an element
 * that is merely transparent still costs a composite on each one.
 */
import { useEffect, useId } from 'react'

import type { CSSProperties } from 'react'
import {
  SPOTLIGHT_DURATION_MS,
  useAiSpotlightStore,
} from '@/stores/ai-spotlight-store'

export type AiSpotlightProps = {
  /** Stable, model-facing id. See SpotlightTarget. */
  id: string
  /** Translated name for anything the user reads. */
  label: string
  /** One line telling the model when pointing here is the right move. */
  description: string
}

export function AiSpotlight({ id, label, description }: AiSpotlightProps) {
  // Per-instance registration key. Two panes of the same type share one
  // model-facing id on purpose, so the store cannot key on that without
  // one pane's unmount withdrawing the other's entry.
  const registrationKey = useId()
  const registerTarget = useAiSpotlightStore((state) => state.registerTarget)
  // The expiry rather than a boolean, so pointing at the same pane twice
  // in a row is visible: it changes on every request, and keying the
  // overlay on it restarts the animation instead of leaving the first
  // one to finish and look like the second never happened.
  const litUntil = useAiSpotlightStore((state) =>
    state.request?.targetId === id ? state.request.expiresAt : null,
  )

  useEffect(
    () => registerTarget(registrationKey, { id, label, description }),
    [registerTarget, registrationKey, id, label, description],
  )

  if (litUntil === null) return null

  return (
    <div
      key={litUntil}
      // Decoration for the eye only. What the glow means is already in
      // the assistant's own message, which is where a screen reader
      // gets it; announcing a second time would just be noise.
      aria-hidden
      className="ai-spotlight"
      style={
        { '--ai-spot-life': `${SPOTLIGHT_DURATION_MS}ms` } as CSSProperties
      }
    />
  )
}
