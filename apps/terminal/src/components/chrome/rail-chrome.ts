// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The left rail, in the same two words as everything else in the chrome.
 *
 * The rail is painted `--background` — the board's own ground — so it has no
 * edge and no shadow and dissolves into whatever sits beside it. What is left
 * is sixty pixels of ground with marks on it, which is the point: the spotlight
 * belongs in the middle of the window, and a rail that draws its own surface is
 * a second thing competing for it.
 *
 * That leaves one question, which is how the current section says so. It used
 * to be `--sidebar-accent`, a value two steps brighter than a workspace column,
 * so the loudest fill on screen was the button naming the page you were already
 * looking at. It is a `--card` chip now: the same fill, the same 10px radius and
 * the same hover as every control on the top bar. One chip vocabulary for the
 * whole frame, and "you are here" reads as the section resting on a surface
 * rather than as an alarm.
 *
 * Groups are still marked, because a rail of eleven identical marks is a list
 * nobody can navigate. The mark is `--pane-rule`, the board's one line, drawn at
 * 24px across the middle of a 60px rail rather than edge to edge: enough to
 * group, not enough to divide.
 */

/**
 * One destination. Sized to the rail (36px) and shaped like a top-bar chip.
 *
 * Applied over `SidebarMenuButton`, whose own variants resolve `hover:` and
 * `data-active:` against `--sidebar-accent`. tailwind-merge settles the
 * conflict in this string's favour because it is passed last.
 */
export const RAIL_ITEM =
  'size-9 justify-center rounded-[10px] p-0 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground data-active:bg-card data-active:text-foreground data-active:font-normal'

/**
 * A group mark: short, centred, and the board's one line.
 *
 * The width is written under `data-horizontal:` because that is where the
 * primitive puts its own `w-full`, and tailwind-merge will not resolve a bare
 * utility against a variant-prefixed one. A plain `w-6` here loses silently.
 */
export const RAIL_SEPARATOR =
  'mx-auto my-1.5 h-px bg-(--pane-rule) data-horizontal:w-6'
