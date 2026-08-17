// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Getting a whole window out of an endpoint that has no cursor.
 *
 * `/api/futures/liquidation/order` takes a time range and returns at most 200
 * rows, with no paging token and no documented ordering. There is exactly one
 * honest way to page that: if a range comes back at the cap, the range was too
 * wide, so cut it in half and ask again. Bisection terminates on a minute
 * floor, because below that the cap stops being about the window and starts
 * being about the market — a single minute of a real cascade can hold more
 * than 200 prints, and no slicing recovers those.
 *
 * A window that still hits the cap at the floor is reported as `truncated`,
 * which is the input to the response's `completeness` flag. Silently returning
 * the first 200 rows of a cascade as if they were the cascade is the exact
 * failure this whole file exists to avoid.
 *
 * The later half is walked first. When the request budget runs out mid-window
 * the reader loses the oldest slice rather than the newest, and the newest is
 * the part a liquidation map is being watched for.
 *
 * On top of that sits a per-pair row store, because the pane re-asks every
 * minute for a window that has moved by one minute. Re-walking twenty-four
 * hours to learn about sixty seconds would spend the whole key budget on data
 * already held, so a refresh fetches only the tail and merges it.
 */
import { COINGLASS_PAGE_CAP } from './client'
import type { CoinglassLiquidationOrder } from './client'

/** Bisection floor. Below a minute, the cap is the market's fault, not ours. */
export const MIN_SLICE_MS = 60_000

/** Paid requests one aggregate answer may spend. */
export const DEFAULT_MAX_REQUESTS = 12

/**
 * Overlap re-fetched on an incremental refresh.
 *
 * Coinglass caches this endpoint for one second and rows arrive by liquidation
 * time, so a print can land just behind the last cursor. Two minutes of
 * re-read is cheap (the store dedupes) and closes that gap; a zero-overlap
 * cursor drops prints at every refresh boundary, which reads as a map that
 * mysteriously thins out on the minute.
 */
export const REFRESH_OVERLAP_MS = 120_000

export type PageFetcher = (
  startTime: number,
  endTime: number,
) => Promise<Array<CoinglassLiquidationOrder>>

export type WalkResult = {
  rows: Array<CoinglassLiquidationOrder>
  /** A slice came back at the 200-row cap and could not be cut further. */
  truncated: boolean
  requests: number
}

/**
 * Rows for `[startTime, endTime]`, bisecting any slice that hits the cap.
 *
 * Slices are half-open on the low side (`mid + 1`) so a print on the boundary
 * is not counted twice; the store dedupes anyway, but a walker that relies on
 * its consumer to fix double counting is one refactor away from not having a
 * consumer that does.
 */
export async function walkWindow(options: {
  fetchPage: PageFetcher
  startTime: number
  endTime: number
  maxRequests?: number
  minSliceMs?: number
}): Promise<WalkResult> {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  const minSliceMs = options.minSliceMs ?? MIN_SLICE_MS
  const rows: Array<CoinglassLiquidationOrder> = []
  let requests = 0
  let truncated = false

  async function visit(from: number, to: number): Promise<void> {
    if (from > to) return
    if (requests >= maxRequests) {
      // Out of budget with range left unread: the answer is incomplete, and
      // saying so is the whole contract of this function.
      truncated = true
      return
    }
    requests += 1
    const page = await options.fetchPage(from, to)
    if (page.length < COINGLASS_PAGE_CAP) {
      rows.push(...page)
      return
    }
    const span = to - from
    if (span <= minSliceMs) {
      // A single minute over the cap. Keep what came back and flag it.
      rows.push(...page)
      truncated = true
      return
    }
    const mid = from + Math.floor(span / 2)
    // Newest first: a budget that runs out should cost the oldest slice.
    await visit(mid + 1, to)
    await visit(from, mid)
  }

  await visit(Math.floor(options.startTime), Math.floor(options.endTime))
  return { rows, truncated, requests }
}

/**
 * Identity of a print.
 *
 * Time, venue symbol, side, price and size together. Two genuinely distinct
 * liquidations sharing all five in the same millisecond would collapse into
 * one — accepted: Coinglass exposes no order id, and the alternative is
 * double-counting every overlapping refresh, which is a systematic error
 * rather than an occasional one.
 */
function orderKey(row: CoinglassLiquidationOrder): string {
  return `${row.time}:${row.symbol}:${row.side}:${row.price}:${row.usd_value}`
}

export type OrderStoreEntry = {
  rows: Map<string, CoinglassLiquidationOrder>
  /** Earliest instant this store has actually read. */
  coveredFrom: number
  /** Latest instant this store has actually read. */
  coveredTo: number
  /** Any walk inside the retained coverage came back short. */
  truncated: boolean
}

export type OrderStore = {
  /**
   * Rows for `[since, until]`, fetching only what is not already held.
   *
   * Returns the retained rows plus whether the coverage behind them was
   * truncated. Callers filter by pair and window themselves — the store is
   * keyed per pair already, but it retains a wider time range than any single
   * request asked for so the next window switch is free.
   */
  read: (
    key: string,
    request: {
      since: number
      until: number
      walk: (from: number, to: number) => Promise<WalkResult>
    },
  ) => Promise<{ rows: Array<CoinglassLiquidationOrder>; truncated: boolean }>
  /** Test/diagnostic seam. */
  size: () => number
  clear: () => void
}

/**
 * Rows kept per pair before the oldest are dropped.
 *
 * Seven days of prints above a sane threshold is normally a few thousand; the
 * cap exists so an unthresholded read of a cascade cannot grow without bound
 * in a long-lived desktop session.
 */
const MAX_ROWS_PER_PAIR = 20_000

/** Pairs kept before the least recently read is evicted. */
const MAX_PAIRS = 8

export function createOrderStore(options?: {
  retentionMs?: number
  now?: () => number
}): OrderStore {
  const retentionMs = options?.retentionMs ?? 7 * 24 * 3_600_000
  const now = options?.now ?? (() => Date.now())
  const entries = new Map<string, OrderStoreEntry>()

  function prune(entry: OrderStoreEntry): void {
    const floor = now() - retentionMs
    for (const [key, row] of entry.rows) {
      if (row.time < floor) entry.rows.delete(key)
    }
    if (entry.rows.size <= MAX_ROWS_PER_PAIR) return
    // Oldest first, so what survives is the part a pane is most likely to ask
    // for next.
    const sorted = [...entry.rows.entries()].sort(
      (a, b) => a[1].time - b[1].time,
    )
    for (let i = 0; i < sorted.length - MAX_ROWS_PER_PAIR; i += 1) {
      entry.rows.delete(sorted[i][0])
    }
  }

  return {
    async read(key, request) {
      const existing = entries.get(key)
      const holdsWindow =
        existing != null &&
        existing.coveredFrom <= request.since &&
        existing.coveredTo >= request.since

      if (!holdsWindow) {
        const walked = await request.walk(request.since, request.until)
        const rows = new Map<string, CoinglassLiquidationOrder>()
        for (const row of walked.rows) rows.set(orderKey(row), row)
        const entry: OrderStoreEntry = {
          rows,
          coveredFrom: request.since,
          coveredTo: request.until,
          truncated: walked.truncated,
        }
        prune(entry)
        // Re-inserted rather than mutated so the Map's insertion order stays
        // a true least-recently-read ordering for eviction.
        entries.delete(key)
        entries.set(key, entry)
        while (entries.size > MAX_PAIRS) {
          const oldest = entries.keys().next()
          if (oldest.done) break
          entries.delete(oldest.value)
        }
        return { rows: [...entry.rows.values()], truncated: entry.truncated }
      }

      const from = Math.max(
        request.since,
        existing.coveredTo - REFRESH_OVERLAP_MS,
      )
      if (request.until > from) {
        const walked = await request.walk(from, request.until)
        for (const row of walked.rows) existing.rows.set(orderKey(row), row)
        existing.truncated = existing.truncated || walked.truncated
        existing.coveredTo = Math.max(existing.coveredTo, request.until)
      }
      prune(existing)
      entries.delete(key)
      entries.set(key, existing)
      return {
        rows: [...existing.rows.values()],
        truncated: existing.truncated,
      }
    },

    size: () => entries.size,
    clear: () => entries.clear(),
  }
}
