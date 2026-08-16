// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { SUPPORTED_LOCALES, pickLocale } from '@pairlens/shared/localized-text'

const STORAGE_KEY = 'pairlens:language'

const SUPPORTED = SUPPORTED_LOCALES

/**
 * One dynamic import per shipped catalog, written out rather than globbed.
 *
 * The seventeen catalogs are 4.5 MB of JSON. Statically imported they landed
 * in the entry chunk, so every visitor downloaded sixteen languages they do
 * not read: roughly 950 KB brotli, which was most of the bundle. Each entry
 * here is its own chunk and exactly one of them is ever fetched.
 *
 * Written out one line per locale, and not `import.meta.glob`, for two
 * reasons: the map is the shipped list (adding a folder does not silently
 * ship it, and `i18n-catalog.test.ts` walks the same set), and glob is a Vite
 * transform that would leave this module unloadable under `bun test`, where
 * plenty of stores pull it in transitively.
 */
const CATALOG_LOADERS: Record<string, () => Promise<unknown>> = {
  en: () => import('@/locales/en/translation.json'),
  es: () => import('@/locales/es/translation.json'),
  zh: () => import('@/locales/zh/translation.json'),
  'zh-Hant': () => import('@/locales/zh-Hant/translation.json'),
  ru: () => import('@/locales/ru/translation.json'),
  uk: () => import('@/locales/uk/translation.json'),
  fr: () => import('@/locales/fr/translation.json'),
  pt: () => import('@/locales/pt/translation.json'),
  de: () => import('@/locales/de/translation.json'),
  it: () => import('@/locales/it/translation.json'),
  pl: () => import('@/locales/pl/translation.json'),
  ja: () => import('@/locales/ja/translation.json'),
  ko: () => import('@/locales/ko/translation.json'),
  vi: () => import('@/locales/vi/translation.json'),
  th: () => import('@/locales/th/translation.json'),
  tr: () => import('@/locales/tr/translation.json'),
  id: () => import('@/locales/id/translation.json'),
}

/**
 * Map a BCP-47 browser language to a supported locale (or 'en').
 *
 * Shares `pickLocale` with plugin-manifest text so a `zh-TW` reader gets
 * Traditional from both the terminal's catalog and a plugin's own strings.
 * Two implementations of "close enough language" would drift, and the seam
 * where they disagreed would be invisible.
 */
function detectLanguage(navLanguage: string): string {
  return pickLocale(SUPPORTED, navLanguage) ?? 'en'
}

function getStoredLanguage(): string {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as string
  } catch {
    // Ignore parse errors
  }
  return detectLanguage(navigator.language)
}

/**
 * Fetch a catalog and hand it to i18next, once. Safe to call for a language
 * that is already loaded or was never shipped.
 *
 * Every caller must await this BEFORE `changeLanguage`: switching to a
 * language whose bundle has not arrived renders raw keys until it does.
 */
export async function loadCatalog(language: string): Promise<boolean> {
  if (i18n.hasResourceBundle(language, 'translation')) return true
  const load = CATALOG_LOADERS[language]
  if (!load) return false
  try {
    const module = (await load()) as { default: Record<string, unknown> }
    i18n.addResourceBundle(language, 'translation', module.default, true, true)
    return true
  } catch {
    // A missing chunk (stale deploy, offline) must not take the app down.
    // i18next falls back to whatever is loaded, which is the previous
    // language rather than nothing.
    return false
  }
}

const initial = getStoredLanguage()

await i18n.use(initReactI18next).init({
  // Deliberately empty: `loadCatalog` below fills in the one language this
  // visitor reads. There is no `en` preload alongside it, because
  // `i18n-catalog.test.ts` fails the build if any locale is missing a key
  // that English has, so the `fallbackLng` chain has nothing to do.
  resources: {},
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED],
  interpolation: { escapeValue: false },
})

// Awaited at module scope: `router.tsx` imports this file, so the router (and
// therefore the first render) cannot exist before the catalog does. That is
// what buys the split for free instead of a frame of untranslated keys.
if (!(await loadCatalog(initial)) && initial !== 'en') {
  await loadCatalog('en')
  await i18n.changeLanguage('en')
}

export default i18n
