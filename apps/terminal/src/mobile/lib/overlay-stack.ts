// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a pushed overlay lands on the stack.
 *
 * The two pickers are PEERS — both answer "what am I looking at?" — and the
 * context bar stays tappable above an open picker (a full-height sheet starts
 * at `--pl-chart-top`, below the bar). So picker → picker taps must SWAP the
 * top entry, not stack: stacked pickers resurrect one another on dismiss, and
 * cycling the two chips built an unbounded stack of sheets, each reappearing
 * as the one above it closed (user-reported). Replacement is safe in every
 * ordering because a sheet's owed close is identity-addressed
 * (`closeOverlay`): once the entry it was armed for has been replaced, the
 * close no-ops instead of popping whatever sits on top.
 *
 * Everything else still stacks. Settings pushed from the avatar over an open
 * picker SHOULD return to that picker on back — that entry is a place the
 * user came from, not a peer of where they went.
 */
import type { MobileOverlay } from '../mobile-focus-context'

const PICKER_KINDS: ReadonlySet<MobileOverlay['kind']> = new Set([
  'pairPicker',
  'venuePicker',
])

export function stackWithOverlay(
  stack: ReadonlyArray<MobileOverlay>,
  overlay: MobileOverlay,
): Array<MobileOverlay> {
  const top = stack[stack.length - 1]
  return top && PICKER_KINDS.has(top.kind) && PICKER_KINDS.has(overlay.kind)
    ? [...stack.slice(0, -1), overlay]
    : [...stack, overlay]
}
