// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Message protocol between the Python runtime host (main thread) and the
 * Pyodide worker. Candle data travels as transferable Float64Array buffers in
 * BOTH directions — never as JSON arrays of candles (ultra-performance
 * requirement: a compute round-trip must not serialize per-candle objects).
 */
import type {
  CustomIndicatorMeta,
  CustomIndicatorModule,
} from '@pairlens/shared/plugin-types'

export type { CustomIndicatorModule }

/** Column-oriented candle data, one Float64Array per field. */
export type CandleArrays = {
  time: Float64Array
  open: Float64Array
  high: Float64Array
  low: Float64Array
  close: Float64Array
  volume: Float64Array
}

export type HostToPythonMessage =
  | {
      type: 'init'
      id: number
      /** Same-origin base URL the pyodide core assets are served from. */
      indexURL: string
    }
  | { type: 'install-packages'; id: number; requirements: Array<string> }
  | {
      type: 'register-script'
      id: number
      scriptId: string
      /** Entry module source (`main.py`). */
      source: string
      /** Helper modules written next to the entry before it executes. */
      modules?: Array<CustomIndicatorModule>
    }
  | {
      type: 'compute'
      id: number
      scriptId: string
      candles: CandleArrays
      params: Record<string, unknown>
      pair: string
      timeframe: string
      /** Extra series the script declared via `request.security(...)`. */
      requestData?: Array<RequestSeries>
    }
  | { type: 'dispose-script'; id: number; scriptId: string }
  | {
      type: 'format-code'
      id: number
      /** Python source to reformat. */
      source: string
    }

/** One extra candle series fulfilled for a `request.security(...)` spec. */
export type RequestSeries = {
  key: string
  candles: CandleArrays
}

/** Severity of a console line — `log.*` carries one, bare print() does not. */
export type PythonLogLevel = 'stdout' | 'stderr' | 'info' | 'warning' | 'error'

/** One line a script wrote to stdout/stderr (print, log.*, warnings, ...). */
export type PythonLogMessage = {
  type: 'log'
  level: PythonLogLevel
  text: string
  /** Script that was executing when the line was written, when known. */
  scriptId?: string
}

export type PythonToHostMessage =
  // Unsolicited — carries no request id, so it never resolves a pending call.
  | PythonLogMessage
  | { type: 'ready'; id: number }
  | { type: 'installed'; id: number }
  | { type: 'registered'; id: number; meta: CustomIndicatorMeta }
  | {
      type: 'computed'
      id: number
      /**
       * One Float64Array per series key, aligned to the input candle length.
       * A `<key>:c` entry holds per-bar palette indices for `<key>`.
       */
      outputs: Record<string, Float64Array>
      /** Color palettes `<key>:c` indexes into, when the script built one. */
      palettes?: Record<string, Array<string>>
      /** Wall-clock ms the Python call took, for the editor's timing read-out. */
      durationMs?: number
    }
  | { type: 'disposed'; id: number }
  | { type: 'formatted'; id: number; source: string }
  | {
      type: 'error'
      id: number
      /** Short human-readable message (last traceback line for Python errors). */
      error: string
      /** Full Python traceback when the failure came from script code. */
      traceback?: string
    }

/**
 * Transfer list for a set of candle arrays. The buffers are moved, not
 * copied — the sender's arrays are detached after postMessage.
 */
export function candleTransferables(candles: CandleArrays): Array<ArrayBuffer> {
  const buffers: Array<ArrayBuffer> = []
  for (const key of [
    'time',
    'open',
    'high',
    'low',
    'close',
    'volume',
  ] as const) {
    const buffer = candles[key].buffer
    // Shared or already-collected buffers are cloned instead of transferred.
    if (buffer instanceof ArrayBuffer && !buffers.includes(buffer)) {
      buffers.push(buffer)
    }
  }
  return buffers
}

/** Transfer list for computed outputs (worker → host direction). */
export function outputTransferables(
  outputs: Record<string, Float64Array>,
): Array<ArrayBuffer> {
  const buffers: Array<ArrayBuffer> = []
  for (const value of Object.values(outputs)) {
    if (
      value.buffer instanceof ArrayBuffer &&
      !buffers.includes(value.buffer)
    ) {
      buffers.push(value.buffer)
    }
  }
  return buffers
}
