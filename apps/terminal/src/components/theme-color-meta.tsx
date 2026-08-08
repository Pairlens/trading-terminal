// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Keeps `<meta name="theme-color">` on the theme the user is actually looking
 * at.
 *
 * The tag is what iOS Safari and Chrome for Android tint the status-bar band
 * with, and what Safari 15+ tints its toolbar with on macOS. `__root`'s `head()`
 * ships a static dark value so the first paint of the default theme is right
 * before hydration; a build-time constant is wrong for everything else — the
 * light "warm paper" base, `system` on a light device, and every one of the
 * `theme:override` plugins.
 *
 * The source of truth is the live computed background rather than a table of
 * hexes, because that is the one value guaranteed to match whatever CSS won:
 * `body` carries `bg-background`, whatever set it.
 *
 * The tokens are `oklch()` and browsers serialize them back as `oklch()`
 * (measured — even a canvas `fillStyle` round trip does not convert), so the
 * value written here is an oklch string. Every browser that reads `theme-color`
 * today parses it; one that cannot treats the meta as absent and falls back to
 * tinting from the page's own background, which lands on the same colour. That
 * makes the failure mode correct rather than merely safe, so it is not worth
 * carrying a colour-space conversion to avoid.
 *
 * Two triggers, because theme changes arrive two ways: `resolvedTheme` for the
 * light/dark switch, and a `<head>` mutation for the theme-plugin style tag,
 * which swaps `--background` without touching next-themes at all.
 */
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return

    let frame: number | null = null
    // Coalesced into a frame: the class and the style tag both land during a
    // commit, and reading a computed style in the same tick would measure the
    // theme being replaced.
    const sync = () => {
      frame = null
      const color = getComputedStyle(document.body).backgroundColor
      if (color) meta.setAttribute('content', color)
    }
    const schedule = () => {
      if (frame == null) frame = requestAnimationFrame(sync)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.head, {
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (frame != null) cancelAnimationFrame(frame)
    }
  }, [resolvedTheme])

  return null
}
