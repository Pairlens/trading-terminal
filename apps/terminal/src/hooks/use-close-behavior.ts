// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import * as React from 'react'

import type {
  CloseBehavior,
  CloseBehaviorInfo,
} from '@/lib/settings/close-behavior'
import {
  getCloseBehaviorSnapshot,
  loadCloseBehavior,
  setCloseBehavior,
  subscribeCloseBehavior,
} from '@/lib/settings/close-behavior'

export type UseCloseBehavior = {
  /** `null` until the first read lands (and forever in a browser build). */
  info: CloseBehaviorInfo | null
  pending: boolean
  /** Set when the OS refused — the radio stays on what is actually in force. */
  refused: boolean
  setBehavior: (next: CloseBehavior) => void
}

/**
 * The close-behavior setting, read from Rust and kept in step with sibling
 * windows.
 *
 * `refused` is the honest half: asking for background mode on a desktop with
 * no usable tray comes back as `quit`, and the UI has to say so rather than
 * leave a radio selected that the app will not honor.
 */
export function useCloseBehavior(): UseCloseBehavior {
  const [info, setInfo] = React.useState<CloseBehaviorInfo | null>(() =>
    getCloseBehaviorSnapshot(),
  )
  const [pending, setPending] = React.useState(false)
  const [refused, setRefused] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const stop = subscribeCloseBehavior((next) => {
      if (alive) setInfo(next)
    })
    void loadCloseBehavior().then((next) => {
      if (alive && next) setInfo(next)
    })
    return () => {
      alive = false
      stop()
    }
  }, [])

  const setBehavior = React.useCallback((next: CloseBehavior) => {
    setPending(true)
    setRefused(false)
    void setCloseBehavior(next)
      .then((applied) => {
        if (applied) {
          setInfo(applied)
          setRefused(applied.behavior !== next)
        }
      })
      .catch((err: unknown) => {
        console.error('[close-behavior] could not apply:', err)
        setRefused(true)
      })
      .finally(() => setPending(false))
  }, [])

  return { info, pending, refused, setBehavior }
}
