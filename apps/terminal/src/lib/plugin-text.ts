// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Reading a plugin's own text in the user's language.
 *
 * Plugin manifests carry their display strings as `LocalizedText` — either a
 * bare string, or a map of locale to string. See
 * `@pairlens/shared/localized-text` for why that lives in the manifest rather
 * than in our catalog: a third-party author cannot add a catalog key, so
 * inline translations are the only mechanism that can ever reach them.
 *
 * Two entry points, and the difference matters:
 *  - `localizedText` / `pluginTitle` read `i18n.language` directly. Correct in
 *    any non-React code, and correct inside a component that also calls
 *    `useTranslation()` — that subscription is what re-renders it.
 *  - `useLocalized()` subscribes on its own. Use it in a component whose only
 *    translated text is plugin text; without it the component keeps rendering
 *    the previous language until something else re-renders it.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveLocalizedText } from '@pairlens/shared/localized-text'
import type { LocalizedText } from '@pairlens/shared/localized-text'
import type { PluginManifest } from '@pairlens/shared/plugin-types'

import i18n from '@/lib/i18n'

export function localizedText(
  value: LocalizedText | undefined,
  locale: string = i18n.language,
): string | undefined {
  return resolveLocalizedText(value, locale)
}

/**
 * What to call a plugin on screen.
 *
 * `title` is the translated display name; `name` is the canonical identity
 * that logs, sort keys and search indexes use. A manifest with no `title` —
 * every manifest published before this existed — falls back to `name`.
 */
/**
 * Catalog entry for a bundled plugin's own text.
 *
 * Derived from the plugin id rather than declared in the manifest: ids are
 * unique and reserved against third-party use, so the key either exists (ours)
 * or it does not (theirs), and the `defaultValue` covers the second case.
 * `__tests__/plugin-text.test.ts` walks the bundled plugins and asserts every
 * derived key resolves.
 */
function manifestKey(id: string, field: 'title' | 'description'): string {
  return `pluginStore.manifests.${id}.${field}`
}

export function pluginTitle(
  manifest: Pick<PluginManifest, 'id' | 'name' | 'title'>,
  locale: string = i18n.language,
): string {
  return i18n.t(manifestKey(manifest.id, 'title'), {
    defaultValue: localizedText(manifest.title, locale) ?? manifest.name,
  })
}

export function pluginDescription(
  manifest: Pick<PluginManifest, 'id' | 'description'>,
  locale: string = i18n.language,
): string {
  return i18n.t(manifestKey(manifest.id, 'description'), {
    defaultValue: localizedText(manifest.description, locale) ?? '',
  })
}

/** The same three, bound to the active language and re-rendered when it changes. */
export function useLocalized(): {
  localizedText: (value: LocalizedText | undefined) => string | undefined
  pluginTitle: (
    manifest: Pick<PluginManifest, 'id' | 'name' | 'title'>,
  ) => string
  pluginDescription: (
    manifest: Pick<PluginManifest, 'id' | 'description'>,
  ) => string
} {
  const { i18n: instance } = useTranslation()
  const locale = instance.language
  return useMemo(
    () => ({
      localizedText: (value) => localizedText(value, locale),
      pluginTitle: (manifest) => pluginTitle(manifest, locale),
      pluginDescription: (manifest) => pluginDescription(manifest, locale),
    }),
    [locale],
  )
}
