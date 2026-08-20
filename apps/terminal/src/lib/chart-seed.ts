// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Seeding arithmetic for the chart terminal: when a late snapshot replaces
 * the bars the chart was seeded with, and where the visible window lands
 * after history is prepended.
 *
 * Both answers used to be inline in `use-chart-terminal-state`, and both were
 * wrong in the same situation — a chart seeded with a stub instead of a real
 * backfill. See each function for what that looked like on screen.
 */

/**
 * Bars below which a seeded chart counts as a stub rather than a loaded one.
 * Two things key off it: a later, deeper snapshot re-anchors the viewport
 * (the stub the user was staring at is not a window worth preserving), and
 * the pan-left history backfill refuses to fire (a seed this short puts the
 * viewport at index 0 by construction, which is not the user panning into
 * history). Matches the backfill's own left-edge trigger window.
 */
export const MIN_HEALTHY_SEED_BARS = 30

/**
 * Does this snapshot reach further back than the bars the chart was seeded
 * with? Live updates never prepend, so a lower first ts can only be a
 * snapshot: the connector's REST backfill landing late, or a reconnect
 * replay carrying more history than the stream had at seed time.
 *
 * The first snapshot used to be final, which is fine when it IS a backfill
 * and fatal when it is not — a venue whose backfill was rate-limited leaves
 * the terminal to promote raw stream updates into a seed, and the chart then
 * held that one forming bar until the user switched pair or timeframe.
 */
export const snapshotDeepensSeed = (
  seededOldestTs: number | null,
  incomingOldestTs: number | null,
): boolean =>
  seededOldestTs !== null &&
  incomingOldestTs !== null &&
  incomingOldestTs < seededOldestTs

/**
 * Merge a deeper snapshot into the seeded bars, keeping anything older than
 * it. Those older bars are the user's pan-left backfill, which the
 * connector's 500-bar buffer knows nothing about and would otherwise lose.
 */
export const mergeDeeperSnapshot = <T extends { ts: number }>(
  seeded: ReadonlyArray<T>,
  snapshot: ReadonlyArray<T>,
): Array<T> => {
  const oldestTs = snapshot[0]?.ts
  if (oldestTs === undefined) return seeded.slice()
  const older = seeded.filter((c) => c.ts < oldestTs)
  return older.length > 0 ? [...older, ...snapshot] : snapshot.slice()
}

/**
 * Is the chart's left edge in view AND is there a real chart to be at the
 * left edge of? Both halves matter.
 *
 * A seed shorter than the trigger window is a chart still loading, not a
 * user panned into history: with a handful of bars the window starts at
 * index 0 by construction. Firing the pan-left backfill there prepended a
 * 300-bar batch onto a two-bar stub and re-anchored the window onto the
 * tail of it, which is what left a freshly switched chart showing one live
 * candle with empty space to its right until a manual Fit Content.
 */
export const shouldBackfillOlderHistory = (
  seedLength: number,
  viewportStartIndex: number,
): boolean =>
  seedLength >= MIN_HEALTHY_SEED_BARS &&
  viewportStartIndex <= MIN_HEALTHY_SEED_BARS

/**
 * Where the visible window goes after `prepended` bars of history are pushed
 * onto the front of a series that now holds `nextLength` bars.
 *
 * Shifting by the prepend count keeps the same bars on screen — but only
 * while the window lay inside the data. A window wider than its series (a
 * two-bar stub with a 200-bar viewport) has its end past the last bar
 * already, and shifting that by 300 put the whole window in empty space to
 * the right of the series: the chart showed one live candle and nothing
 * else until the user hit Fit Content. Clamping the start to the last bar
 * keeps at least that bar on screen in every case.
 */
export const viewportAfterPrepend = (
  viewport: { startIndex: number; endIndex: number },
  prepended: number,
  nextLength: number,
): { startIndex: number; endIndex: number } => {
  const span = viewport.endIndex - viewport.startIndex
  const startIndex = Math.min(
    viewport.startIndex + prepended,
    Math.max(0, nextLength - 1),
  )
  return { startIndex, endIndex: startIndex + span }
}
