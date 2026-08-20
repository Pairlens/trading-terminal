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
 *
 * The chip alone was quiet to the point of vanishing on a board, so the current
 * section also gets a spine: a 3px bar against the window's left edge, in that
 * section's own hue. The hues are `--section-*` (declared in @pairlens/ui, out
 * with the asset-class ones and theme-independent for the same reason), which
 * makes the rail read the way the Discovery chips do — Bots is violet, Accounts
 * is green, and you know which page you are on before you read a word of it.
 * One item is active at a time, so the spine is never a legend to decode, and
 * the icon and the chip carry the same message without colour.
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

/**
 * The `<li>` that holds one rail item, and with it the section spine.
 *
 * The spine lives on the item rather than on the button because the button is
 * `overflow-hidden` — a pseudo-element hung off its left edge is clipped away
 * without a word. `has-data-active` reads the button's own active state, which
 * keeps every call site to one class: nothing has to thread "am I current?"
 * through a second prop that could disagree with the first.
 *
 * The bar is painted `--rail-spine`, which each item sets to its own section
 * hue via `railSection()`. An item that sets nothing draws nothing: an unset
 * variable resolves to no colour, and the spine is transparent at rest anyway.
 */
export const RAIL_ITEM_SLOT =
  'relative before:pointer-events-none before:absolute before:top-1/2 before:-left-1.5 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-(--rail-spine) before:opacity-0 before:transition-opacity has-data-active:before:opacity-100'

/**
 * Every destination the rail can be on, and the hue its spine spends.
 *
 * The ids are the shell's own `activeItem` values. The classes are written out
 * in full because Tailwind reads source text: a computed
 * `[--rail-spine:var(--section-${id})]` compiles to nothing at all.
 */
const RAIL_SECTION_SPINE = {
  pairs: '[--rail-spine:var(--section-pairs)]',
  charts: '[--rail-spine:var(--section-charts)]',
  notifications: '[--rail-spine:var(--section-notifications)]',
  workflows: '[--rail-spine:var(--section-workflows)]',
  indicators: '[--rail-spine:var(--section-indicators)]',
  bots: '[--rail-spine:var(--section-bots)]',
  accounts: '[--rail-spine:var(--section-accounts)]',
  plugins: '[--rail-spine:var(--section-plugins)]',
  workspaces: '[--rail-spine:var(--section-workspaces)]',
  'workspace-store': '[--rail-spine:var(--section-workspace-store)]',
} as const

export type RailSection = keyof typeof RAIL_SECTION_SPINE

/**
 * One rail item's `<li>` class: the slot plus that section's spine colour.
 *
 * Pass nothing for an item that is never a destination (the assistant orb, the
 * feedback button): it gets the slot and no colour, so it never draws a spine.
 */
export function railSection(section?: RailSection): string {
  return section
    ? `${RAIL_ITEM_SLOT} ${RAIL_SECTION_SPINE[section]}`
    : RAIL_ITEM_SLOT
}
