// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Text that ships with the thing it describes, in as many languages as its
 * author cared to write.
 *
 * The terminal's own text lives in `apps/terminal/src/locales/*` and resolves
 * through i18next keys. That works for text we write. It cannot work for text
 * a third party writes: a plugin author has no way to add an entry to our
 * catalog, so before this existed, every third-party plugin was English-only
 * by construction — its name and description came out of its signed manifest
 * and went straight to the screen.
 *
 * A `LocalizedText` carries its own translations instead. A bare string means
 * "one language, whatever the author wrote", which is what every manifest
 * published so far contains — so nothing needs re-signing to stay valid.
 *
 * Used by plugin manifests (`plugin-types.ts`) and by registry-served catalog
 * text, so one resolver covers both a locally-installed plugin and a category
 * heading that arrived over HTTP.
 */

/** The locales the terminal ships a catalog for. */
export const SUPPORTED_LOCALES = [
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
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * A display string, optionally translated.
 *
 * Keys are locales from `SUPPORTED_LOCALES`. The resolver itself does not
 * check membership — it will happily return an `nl` string if one is there —
 * but `plugin-manifest-schema.ts` rejects any other tag on the way in. A `pt`
 * mistyped as `pr` is a well-formed tag that would simply never match, and
 * silently never rendering is the failure this mechanism exists to prevent.
 */
export type LocalizedText = string | Record<string, string>

/** Language part of a BCP-47 tag: `pt-BR` → `pt`. */
function baseLanguage(tag: string): string {
  return tag.toLowerCase().split('-')[0]
}

/**
 * Traditional-script regions. A `zh-TW` reader wants `zh-Hant`, and picking by
 * base language alone would hand them Simplified — technically same-language,
 * visibly wrong.
 */
const TRADITIONAL = /hant|tw|hk|mo/

/**
 * Best available locale for a requested one, or null if `available` is empty.
 *
 * Order:
 *  1. exact tag (case-insensitive)
 *  2. Chinese by script — `zh-TW` → `zh-Hant`, `zh-CN` → `zh`
 *  3. same base language — `pt-BR` → `pt`, and `pt` → `pt-BR` if that is all
 *     there is; the shortest tag wins so a bare language beats a region
 *  4. English
 *  5. the first tag in sorted order
 *
 * Step 5 is sorted rather than "first key" on purpose: a signed manifest must
 * render the same everywhere, and object key order is authoring order.
 */
export function pickLocale(
  available: ReadonlyArray<string>,
  requested: string,
): string | null {
  if (available.length === 0) return null

  const want = requested.toLowerCase()
  const exact = available.find((tag) => tag.toLowerCase() === want)
  if (exact) return exact

  const base = baseLanguage(requested)

  if (base === 'zh') {
    const script = TRADITIONAL.test(want) ? 'zh-hant' : 'zh'
    const byScript = available.find((tag) => tag.toLowerCase() === script)
    if (byScript) return byScript
  }

  const sameLanguage = available
    .filter((tag) => baseLanguage(tag) === base)
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
  if (sameLanguage.length > 0) return sameLanguage[0]

  const english = available.find((tag) => baseLanguage(tag) === 'en')
  if (english) return english

  return [...available].sort()[0]
}

/**
 * The string to show a `requested`-locale reader.
 *
 * A bare string passes through untouched — it is the author's one language and
 * there is nothing to choose between.
 */
export function resolveLocalizedText(
  value: LocalizedText | undefined,
  requested: string,
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value

  const locale = pickLocale(Object.keys(value), requested)
  return locale === null ? undefined : value[locale]
}

/** Locale tags a value carries; empty for a bare string. */
export function localizedLocales(value: LocalizedText): Array<string> {
  return typeof value === 'string' ? [] : Object.keys(value)
}
