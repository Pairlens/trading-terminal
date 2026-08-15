// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The one hook a surface needs to join the assistant.
//
//   useAssistantSurface({
//     id: `chart:${paneId}`,
//     getPriority: () => (isFocused ? 100 : 10),
//     getContext: () => ({ summary: `Chart showing ${pair} on ${market}` }),
//     getSuggestion: () => ({ key: 'assistant.suggest.chart', values: { pair } }),
//     getActions: () => chartActions,
//   })
//
// Everything is read through a live ref, so a surface re-rendering on
// every tick never churns the registry. Only mounting, unmounting, and
// a change to the action NAMES move the registry's version — those are
// the events that actually change what the model can call.

import { useEffect, useRef } from 'react'

import { useAssistantSurfaceRegistry } from './surface-registry'
import { DEFAULT_SURFACE_PRIORITY } from './types'
import type { AssistantSurfaceRegistration } from './types'

export function useAssistantSurface(
  registration: AssistantSurfaceRegistration,
): void {
  const latest = useRef(registration)
  useEffect(() => {
    latest.current = registration
  })

  const registry = useAssistantSurfaceRegistry()
  const { id } = registration

  useEffect(() => {
    // Register once per id. The delegating closures always reach the
    // newest render's props through the ref.
    latest.current = registration
    return registry.register({
      id,
      getPriority: () =>
        latest.current.getPriority?.() ?? DEFAULT_SURFACE_PRIORITY,
      getContext: () => latest.current.getContext?.() ?? null,
      getSuggestion: () => latest.current.getSuggestion?.() ?? null,
      getActions: () => latest.current.getActions?.() ?? [],
    })
    // `registration` is deliberately not a dependency — it changes every
    // render and is reached through the ref instead.
  }, [registry, id])

  // A surface that changes what it publishes without remounting has to
  // say so: the tool list is handed to the model once per turn, and the
  // orb's line is only re-read when the registry moves.
  const { revision } = registration
  const previousRevision = useRef(revision)
  useEffect(() => {
    if (previousRevision.current === revision) return
    previousRevision.current = revision
    registry.bump()
  }, [registry, revision])
}
