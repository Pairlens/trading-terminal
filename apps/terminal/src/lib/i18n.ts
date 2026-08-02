// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import de from '@/locales/de/translation.json'
import en from '@/locales/en/translation.json'
import es from '@/locales/es/translation.json'
import fr from '@/locales/fr/translation.json'
import id from '@/locales/id/translation.json'
import it from '@/locales/it/translation.json'
import ja from '@/locales/ja/translation.json'
import ko from '@/locales/ko/translation.json'
import pl from '@/locales/pl/translation.json'
import pt from '@/locales/pt/translation.json'
import ru from '@/locales/ru/translation.json'
import th from '@/locales/th/translation.json'
import tr from '@/locales/tr/translation.json'
import uk from '@/locales/uk/translation.json'
import vi from '@/locales/vi/translation.json'
import zh from '@/locales/zh/translation.json'
import zhHant from '@/locales/zh-Hant/translation.json'

const STORAGE_KEY = 'pairlens:language'

const SUPPORTED = [
  'en',
  'es',
  'zh',
  'zh-Hant',
  'ru',
  'uk',
  'fr',
  'pt',
  'de',
  'it',
  'pl',
  'ja',
  'ko',
  'vi',
  'th',
  'tr',
  'id',
]

/** Map a BCP-47 browser language to a supported locale (or 'en'). */
function detectLanguage(navLanguage: string): string {
  const nav = navLanguage.toLowerCase()
  // Chinese needs script-aware routing: Taiwan, Hong Kong, and Macau read
  // Traditional; every other zh variant gets Simplified.
  if (nav === 'zh' || nav.startsWith('zh-')) {
    return /hant|tw|hk|mo/.test(nav) ? 'zh-Hant' : 'zh'
  }
  return (
    SUPPORTED.find((l) => {
      const s = l.toLowerCase()
      return nav === s || nav.startsWith(`${s}-`)
    }) ?? 'en'
  )
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

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    zh: { translation: zh },
    'zh-Hant': { translation: zhHant },
    ru: { translation: ru },
    uk: { translation: uk },
    fr: { translation: fr },
    pt: { translation: pt },
    de: { translation: de },
    it: { translation: it },
    pl: { translation: pl },
    ja: { translation: ja },
    ko: { translation: ko },
    vi: { translation: vi },
    th: { translation: th },
    tr: { translation: tr },
    id: { translation: id },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED,
  interpolation: { escapeValue: false },
})

export default i18n
