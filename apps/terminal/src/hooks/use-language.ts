// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'

import { STORAGE_PREFIX } from './use-persisted-state'
import i18n from '@/lib/i18n'
import { emitWrite } from '@/lib/sync/sync-channel'
import { registerAnalyticsProperties } from '@/lib/analytics'
import { track } from '@/lib/analytics-events'

export const SUPPORTED_LANGUAGES = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '\u{1F1EC}\u{1F1E7}',
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '\u{1F1EA}\u{1F1F8}',
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '\u{1F1E8}\u{1F1F3}',
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '\u{1F1F7}\u{1F1FA}',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '\u{1F1EB}\u{1F1F7}',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '\u{1F1F5}\u{1F1F9}',
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '\u{1F1E9}\u{1F1EA}',
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '\u{1F1EE}\u{1F1F9}',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '\u{1F1EF}\u{1F1F5}',
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    flag: '\u{1F1F0}\u{1F1F7}',
  },
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '\u{1F1FB}\u{1F1F3}',
  },
  {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '\u{1F1F9}\u{1F1F7}',
  },
  {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    flag: '\u{1F1EE}\u{1F1E9}',
  },
  {
    code: 'zh-Hant',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    flag: '\u{1F1F9}\u{1F1FC}',
  },
  {
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย',
    flag: '\u{1F1F9}\u{1F1ED}',
  },
  {
    code: 'uk',
    name: 'Ukrainian',
    nativeName: 'Українська',
    flag: '\u{1F1FA}\u{1F1E6}',
  },
  {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '\u{1F1F5}\u{1F1F1}',
  },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

// Shares the storage key with the i18n bootstrap (`lib/i18n.ts`), which reads
// it on load, and with the desktop menu's language switcher.
export const LANGUAGE_KEY = 'language'

/**
 * Framework-agnostic language switch. Applies the language to i18next, persists
 * the choice (matching usePersistedState's JSON encoding + sync-channel write),
 * and updates the document lang attribute. Used by both the settings dialog and
 * the desktop OS menu so the two layers stay identical.
 */
export function applyLanguage(code: string): void {
  void i18n.changeLanguage(code)
  track('language_changed', { language: code })
  registerAnalyticsProperties({ app_language: code })
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${LANGUAGE_KEY}`,
      JSON.stringify(code),
    )
  } catch {
    // Ignore storage errors (quota, private browsing).
  }
  emitWrite(LANGUAGE_KEY, code)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
  }
}

export function useLanguage() {
  const { i18n: instance } = useTranslation()

  return {
    currentLanguage: instance.language,
    changeLanguage: applyLanguage,
    languages: SUPPORTED_LANGUAGES,
  }
}
