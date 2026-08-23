// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A deterministic gradient for anything that has a name and no picture.
 *
 * Launchpad icons are user-supplied IPFS URLs and a fair share of them 404, so
 * a memecoin board always has rows falling back to their first letter. That
 * fallback was one flat `--muted` chip, which made every anonymous row look
 * like the same row: thirty identical grey circles down a column whose whole
 * job is telling tokens apart at a glance. A gradient keyed to the name gives
 * each one a mark that is stable across sessions, devices and re-renders, and
 * that a reader starts recognising after the second time they see it.
 *
 * ## Why the colour is a hue and nothing else
 *
 * The obvious implementation picks from a fixed palette of tinted classes, the
 * way `pair-avatar.tsx` does with eight. Eight is not many when a column holds
 * thirty rows, and a palette written as Tailwind classes cannot follow a theme:
 * `bg-amber-500/20` is the same amber on the paper theme and the infrared one.
 *
 * So the hash decides only the HUE, and lightness and chroma come from the
 * theme through `--identity-*` custom properties (see `styles.css`). Light mode
 * gets a pale tint with dark text, dark mode a deep one with light text, and a
 * theme that wants its own take overrides four numbers. The whole thing is two
 * `oklch()` colours in a `linear-gradient`, computed once per render as a
 * string: no canvas, no animation, no compositor layer. It is the AI orb's
 * idea (a mark that belongs to one thing) at a thousandth of the cost.
 *
 * ## Why the hues are not simply `hash % 360`
 *
 * Perceptual hue is not evenly interesting: oklch hues between roughly 90 and
 * 130 are a narrow band of yellow-greens that read as "washed out" at the
 * lightness these chips use, and everything near 25 collides with the terminal's
 * `--down` red hard enough to look like a state rather than an identity. So the
 * hash picks a SLOT from a curated ring and jitters inside it, which keeps the
 * spread wide while keeping every result a colour worth looking at.
 */

/**
 * Hue anchors, in oklch degrees, that read well at both of the lightness
 * levels these chips use. Twenty of them: enough that a thirty-row column
 * rarely shows a pair, few enough that each is visibly its own colour.
 *
 * The gap between 100 and 140 is deliberate, and so is the distance from 25:
 * see the module header.
 */
const HUES: ReadonlyArray<number> = [
  8, 20, 42, 58, 72, 88, 146, 158, 170, 182, 196, 208, 222, 236, 250, 264, 278,
  292, 312, 332,
]

/** How far the second stop travels around the ring from the first. */
const SPREAD = 34

/**
 * FNV-1a, 32-bit.
 *
 * Chosen over the `hash * 31 + c` loop next door for one property that matters
 * here: it avalanches on the LAST characters as strongly as the first, and
 * launchpad tickers share prefixes constantly (`MEME`, `MEMECOIN`, `MEMEKING`).
 * A weak tail hash would give all three the same chip.
 */
export function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** The style a chip carries. Plain CSS, so it works in any renderer. */
export type IdentityGradient = {
  backgroundImage: string
  color: string
}

/**
 * The gradient for one name.
 *
 * Case-folded, because `Bonk` and `BONK` are one token and a reader who saw
 * the row on the board should recognise it on the trade panel. Whitespace goes
 * for the same reason.
 *
 * An empty seed still gets a chip rather than a special case: hue slot zero is
 * as valid as any other, and a branch here would be a second appearance for
 * something that already has one.
 */
export function identityGradient(seed: string): IdentityGradient {
  const hash = hashSeed(seed.trim().toLowerCase())
  const slot = hash % HUES.length
  // Bits the slot did not consume, so the jitter and the angle are independent
  // of it rather than moving in lockstep down the ring.
  const jitter = ((hash >>> 8) % 17) - 8
  const angle = 20 + ((hash >>> 16) % 8) * 20

  const from = (HUES[slot] ?? 0) + jitter
  const to = from + SPREAD

  return {
    backgroundImage: `linear-gradient(${angle}deg, oklch(var(--identity-from-l) var(--identity-from-c) ${from}), oklch(var(--identity-to-l) var(--identity-to-c) ${to}))`,
    // The letter takes the same hue as the fill it sits on, so a chip reads as
    // one object rather than as text over a colour. Contrast comes from the
    // lightness gap between `--identity-fg-l` and the two fill stops, which is
    // where a theme is expected to keep it.
    color: `oklch(var(--identity-fg-l) var(--identity-fg-c) ${from})`,
  }
}

/**
 * The one or two characters a chip shows when there is no picture.
 *
 * Two, not three: these chips are 16px on the board. `Array.from` rather than
 * `slice`, because a fair number of launchpad tickers are emoji or CJK, and
 * slicing a surrogate pair in half renders a replacement glyph.
 */
export function identityInitials(name: string, max = 2): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''
  const first = trimmed.split(/\s+/)[0] ?? trimmed
  return Array.from(first).slice(0, max).join('').toUpperCase()
}
