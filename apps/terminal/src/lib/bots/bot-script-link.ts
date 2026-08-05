// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The only thing tying a bot to the strategy it runs is `bot.scriptId` — a
 * plain id into another store, with nothing stopping that script from being
 * deleted out from under a running deployment.
 *
 * These two checks are what the delete flow, the bots UI and the runtime all
 * read, so "this script still has bots on it" and "this bot has no strategy
 * any more" mean exactly one thing wherever they are asked.
 */

/** The scripts store, narrowed to what these checks actually read. */
export type ScriptsSnapshot = {
  scripts: Array<{ id: string }>
  loaded: boolean
}

/** Every bot deployed from this script — precisely what deleting it orphans. */
export function botsUsingScript<T extends { scriptId: string }>(
  bots: Array<T>,
  scriptId: string,
): Array<T> {
  return bots.filter((bot) => bot.scriptId === scriptId)
}

/**
 * Is this bot's strategy *known* to be gone?
 *
 * An unloaded store is not an empty one. The scripts store reads localStorage
 * lazily, so counting `loaded: false` as "missing" would flag every bot on the
 * page as orphaned for the frames before that read lands — and, in the
 * runtime, would halt them over it.
 */
export function isScriptMissing(
  state: ScriptsSnapshot,
  scriptId: string,
): boolean {
  return state.loaded && !state.scripts.some((script) => script.id === scriptId)
}
