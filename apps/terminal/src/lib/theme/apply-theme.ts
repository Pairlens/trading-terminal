// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Writing a `theme:override` definition to the document.
//
// A leaf on purpose. This used to live in `hooks/use-theme-plugin.ts` beside
// `usePairlens`, which meant every caller of this one DOM-only function
// dragged the whole plugin provider in behind it: onboarding paid 820 KB for
// a style tag, on a route that has no plugin manager at all.
//
// Nothing here may import the provider, the plugin manager, or a React hook.
import type { ThemeDefinition } from '@pairlens/plugins/themes'

const STYLE_ID = 'pairlens-theme-override'
const CSS_CACHE_KEY = 'pairlens:theme.cachedCss'

function injectStyleTag(vars: Record<string, string>, selector: string) {
  const entries = Object.entries(vars)
  if (entries.length === 0) return ''
  const rules = entries.map(([k, v]) => `  ${k}: ${v};`).join('\n')
  return `${selector} {\n${rules}\n}`
}

/**
 * Swap the `theme:override` style tag (and the cache the blocking script in
 * `__root` restores on next load). The onboarding route mounts outside the
 * terminal shell and its plugin manager, and applies a theme through this
 * exact path rather than a parallel one.
 */
export function applyTheme(theme: ThemeDefinition | null) {
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null

  if (!theme) {
    tag?.remove()
    try {
      localStorage.removeItem(CSS_CACHE_KEY)
    } catch {
      /* ignore */
    }
    return
  }

  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_ID
    document.head.appendChild(tag)
  }

  const lightCss = injectStyleTag(theme.light, ':root')
  const darkCss = injectStyleTag(theme.dark, '.dark')
  const css = `${lightCss}\n${darkCss}`
  tag.textContent = css

  // Cache for the blocking script to restore on next page load
  try {
    localStorage.setItem(CSS_CACHE_KEY, css)
  } catch {
    /* ignore */
  }
}
