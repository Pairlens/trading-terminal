// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The selected thing belongs in the URL ────────────────────────────
//
// Every master-detail page in the terminal — workflows, alerts, bots,
// scripts — kept its selection in component or store state. The address
// bar said `/workflows` whether you were staring at an empty canvas or
// at the one order plan you had been tuning all morning.
//
// That cost three things at once: a selection could not be linked or
// shared, the back button had nothing to walk, and the assistant could
// only ever report the page. This hook is the fix, and it is deliberately
// one hook rather than four hand-rolled effects, because the
// loop-avoidance is the whole difficulty and it should only be solved
// once.
//
// The rule, in `resolveSelectionSync`, is two lines long and exported so
// it can be tested without a DOM.

import { useEffect, useRef } from 'react'

/** What the sync wants to do next. */
export type SelectionSyncStep =
  /** Already in step. */
  | { action: 'idle' }
  /** The URL is naming something the page has not applied yet. */
  | { action: 'adopt'; id: string }
  /** The page moved on its own, or refused the id the URL named. */
  | { action: 'write'; id: string | null }

/**
 * Precedence: a param the page has not applied yet WINS, because that is
 * a fresh link or the back button and the page has to follow it.
 * Otherwise the page's own selection wins and the URL follows.
 *
 * `adopted` is the last id taken FROM the URL. Without it, an id the page
 * refuses to select would be re-adopted forever instead of being cleaned
 * out of the address, which is what a link to a deleted record needs.
 *
 * A refusal is settled by the caller in the same pass (see `select`), not
 * by a second trip through here: nothing changed, so nothing would
 * re-run.
 */
export function resolveSelectionSync(state: {
  param: string | null
  selected: string | null
  adopted: string | null
}): SelectionSyncStep {
  const { param, selected, adopted } = state
  if (param === selected) return { action: 'idle' }
  if (param !== null && adopted !== param) return { action: 'adopt', id: param }
  return { action: 'write', id: selected }
}

export type SearchSelectionOptions = {
  /** The id the URL is naming right now, already validated by the route. */
  param: string | null | undefined
  /** The id the page currently has selected. */
  selected: string | null
  /**
   * Apply an id the URL asked for. Return false when it names nothing the
   * page has — a link to a since-deleted record — and the id is dropped
   * from the address instead. Returning nothing counts as accepted.
   *
   * The boolean is not decoration: a refusal changes no state, so React
   * would never re-run this effect and the dead id would sit in the URL
   * forever. The answer has to come back in the same pass.
   */
  select: (id: string) => boolean | void
  /**
   * Write the page's selection back to the URL, passing `replace`
   * straight through to the router.
   *
   * `replace` is true when the address was not naming a record yet, or
   * when a dead id is being cleaned out: neither is somewhere the user
   * chose to be, so neither earns a history entry. It is false when they
   * moved from one record to another, which is a navigation and should
   * be walkable with the back button.
   */
  write: (id: string | null, options: { replace: boolean }) => void
  /**
   * Hold the sync until the page can tell a real id from a stale one.
   * Syncing against an unloaded store would drop every link on arrival.
   */
  ready?: boolean
}

export function useSearchSelection({
  param,
  selected,
  select,
  write,
  ready = true,
}: SearchSelectionOptions): void {
  const adopted = useRef<string | null>(null)

  useEffect(() => {
    if (!ready) return
    const step = resolveSelectionSync({
      param: param ?? null,
      selected,
      adopted: adopted.current,
    })
    if (step.action === 'idle') {
      adopted.current = param ?? null
      return
    }
    if (step.action === 'adopt') {
      adopted.current = step.id
      if (select(step.id) !== false) return
      write(null, { replace: true })
      return
    }
    adopted.current = step.id
    write(step.id, { replace: param == null })
  }, [ready, param, selected, select, write])
}
