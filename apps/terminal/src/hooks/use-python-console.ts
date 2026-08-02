// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PythonLogLevel } from '@/lib/python/protocol'
import { getPythonRuntime } from '@/lib/python/python-runtime'

/** One captured console line — bare print(), or a leveled `log.*` call. */
export type ConsoleLine = {
  /** Monotonic per-session id — a stable React key. */
  id: number
  level: PythonLogLevel
  text: string
}

/** Levels that read as a problem — counted on the collapsed header. */
export const ERROR_LEVELS: ReadonlySet<PythonLogLevel> = new Set([
  'stderr',
  'error',
  'warning',
])

/**
 * Oldest lines are dropped past this: a `print()` inside a loop over 300
 * candles is a normal thing for a user to write, and the buffer must not grow
 * without bound.
 */
const MAX_LINES = 500

/**
 * Capture what a script prints. Lines are batched into one state update per
 * frame — a Python call emits its whole burst of output synchronously, and
 * one render per line would be a render storm.
 */
export function usePythonConsole(scriptId: string | null): {
  lines: Array<ConsoleLine>
  clear: () => void
} {
  const [lines, setLines] = useState<Array<ConsoleLine>>([])
  const pendingRef = useRef<Array<ConsoleLine>>([])
  const frameRef = useRef<number | null>(null)
  const nextIdRef = useRef(0)

  useEffect(() => {
    // A different script owns the console now.
    setLines([])
    pendingRef.current = []
    if (!scriptId) return

    const flush = () => {
      frameRef.current = null
      const incoming = pendingRef.current
      if (incoming.length === 0) return
      pendingRef.current = []
      setLines((prev) => {
        const next = prev.concat(incoming)
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
      })
    }

    const unsubscribe = getPythonRuntime().subscribeLogs((log) => {
      // Untagged lines come from the runtime itself (package installs), which
      // is context the user wants while their script is the one running.
      if (log.scriptId !== undefined && log.scriptId !== scriptId) return
      pendingRef.current.push({
        id: nextIdRef.current++,
        level: log.level,
        text: log.text,
      })
      frameRef.current ??= requestAnimationFrame(flush)
    })

    return () => {
      unsubscribe()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [scriptId])

  const clear = useCallback(() => {
    pendingRef.current = []
    setLines([])
  }, [])

  return { lines, clear }
}
