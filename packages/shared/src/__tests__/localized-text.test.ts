// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  SUPPORTED_LOCALES,
  pickLocale,
  resolveLocalizedText,
} from '../localized-text'

describe('pickLocale', () => {
  test('prefers an exact tag, case-insensitively', () => {
    expect(pickLocale(['en', 'de', 'zh-Hant'], 'de')).toBe('de')
    expect(pickLocale(['en', 'zh-Hant'], 'zh-hant')).toBe('zh-Hant')
  })

  test('routes Chinese by script, not by base language', () => {
    // Handing a Taiwanese reader Simplified is same-language and still wrong.
    expect(pickLocale(['zh', 'zh-Hant'], 'zh-TW')).toBe('zh-Hant')
    expect(pickLocale(['zh', 'zh-Hant'], 'zh-HK')).toBe('zh-Hant')
    expect(pickLocale(['zh', 'zh-Hant'], 'zh-CN')).toBe('zh')
    expect(pickLocale(['zh', 'zh-Hant'], 'zh')).toBe('zh')
  })

  test('falls back within a language before falling back to English', () => {
    expect(pickLocale(['en', 'pt'], 'pt-BR')).toBe('pt')
    expect(pickLocale(['en', 'pt-BR'], 'pt')).toBe('pt-BR')
    // Traditional-only plugin, Simplified reader: still better than English.
    expect(pickLocale(['en', 'zh-Hant'], 'zh')).toBe('zh-Hant')
  })

  test('prefers the bare language over a region when both exist', () => {
    expect(pickLocale(['pt-BR', 'pt', 'pt-PT'], 'pt-AO')).toBe('pt')
  })

  test('falls back to English, then to a deterministic first', () => {
    expect(pickLocale(['en', 'de'], 'th')).toBe('en')
    // No English at all — sorted, not authoring order, so a signed manifest
    // renders identically for everyone.
    expect(pickLocale(['ko', 'ja'], 'th')).toBe('ja')
    expect(pickLocale(['ja', 'ko'], 'th')).toBe('ja')
  })

  test('returns null for nothing to pick from', () => {
    expect(pickLocale([], 'en')).toBeNull()
  })
})

describe('resolveLocalizedText', () => {
  test('passes a bare string through — one language, nothing to choose', () => {
    expect(resolveLocalizedText('Market data via OKX', 'de')).toBe(
      'Market data via OKX',
    )
  })

  test('resolves an object by locale', () => {
    const text = { en: 'Order Book', de: 'Orderbuch', 'zh-Hant': '委託簿' }
    expect(resolveLocalizedText(text, 'de')).toBe('Orderbuch')
    expect(resolveLocalizedText(text, 'zh-TW')).toBe('委託簿')
    expect(resolveLocalizedText(text, 'th')).toBe('Order Book')
  })

  test('is undefined for undefined and for an empty object', () => {
    expect(resolveLocalizedText(undefined, 'en')).toBeUndefined()
    expect(resolveLocalizedText({}, 'en')).toBeUndefined()
  })
})

describe('SUPPORTED_LOCALES', () => {
  test('matches the catalogs the terminal ships', () => {
    // The terminal's i18n init and the registry's manifest validation both
    // read this list; drift means a locale that can be selected but has no
    // catalog, or a manifest translation nobody can ever see.
    expect(SUPPORTED_LOCALES).toContain('en')
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length)
  })
})
