// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Find user-facing English still hardcoded in the terminal's components.
 *
 * The catalog-parity test (`lib/__tests__/i18n-catalog.test.ts`) guards the
 * strings that already reached the catalog: every locale carries en's key
 * set, placeholders match, no key is referenced that en lacks. It cannot see
 * the opposite failure — text that never became a key at all, which reads
 * fine in English and leaves the other sixteen languages with a hole.
 *
 * That is what this finds. Run it with `bun run i18n:scan`.
 *
 * ## It is a floor, not a total
 *
 * Precision is chosen over recall: every rejection rule below was added
 * because it fired on a real false positive (CSS values, Tailwind class maps,
 * TS generics that look like JSX text, enum ids). A count that is inflated by
 * `size-4` is worse than one that is slightly short, because nobody trusts it.
 *
 * The one recall trap worth knowing: Prettier wraps long prose across lines,
 * so a naive single-line pattern misses exactly the longest and most
 * important strings — consent paragraphs, explanations, warnings. Both
 * patterns are here for that reason; the multi-line one was added after the
 * plugin full-trust dialog (the text that tells you a plugin can read your
 * exchange keys) turned out to be invisible to the first version.
 *
 * ## Not a gate yet
 *
 * It exits 0 always. Once the sweep reaches zero it should exit non-zero on
 * any increase, and move into `bun run lint`'s job.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', 'apps', 'terminal', 'src')
const SKIP_DIRS = new Set(['locales', '__tests__'])

/**
 * Paths whose English is deliberate and must stay.
 *
 * `lib/copilot/*` holds tool names and descriptions that are sent to the
 * language model as part of the tool schema. The reader is the model, not the
 * user — translating them would change what the model is told, degrade tool
 * selection, and show up as worse copilot behaviour in non-English locales
 * for no visible benefit.
 *
 * `lib/python/*` is the Python SDK surface: completions, signatures and code
 * examples for user-authored indicators. The API itself is English, so
 * translating the docs around it would leave half-English snippets.
 */
const NOT_USER_FACING = [/\/lib\/copilot\//, /\/lib\/python\//]

/**
 * Data modules whose English is the *fallback source* for a derived key, not
 * untranslated text.
 *
 * Several catalogues stay plain data — no hooks, no translator — because
 * non-React code imports them, and their records are translated at the render
 * site from keys derived from each record's stable id (see
 * `lib/registry-labels.ts` and `lib/workspace-store/template-labels.ts`). The
 * English literal is passed through as i18next's `defaultValue`, which is also
 * what makes a plugin-contributed record render at all.
 *
 * This scanner cannot tell that apart from text that simply never got a key,
 * so these are listed explicitly, each with the module that translates it and
 * the test that proves every key exists. Adding a file here without both of
 * those is how the sweep quietly regresses.
 */
const TRANSLATED_AT_RENDER: Array<{
  path: string
  file: RegExp
  via: string
}> = [
  {
    path: 'lib/workspace-store/catalog.ts',
    file: /\/lib\/workspace-store\/catalog\.ts$/,
    via: 'workspace-store/template-labels.ts · __tests__/template-labels.test.ts',
  },
  {
    path: 'components/notifications/notification-templates.ts',
    file: /\/components\/notifications\/notification-templates\.ts$/,
    via: 'notifications-empty-state.tsx · __tests__/starter-templates.test.ts',
  },
  {
    path: 'components/workflows/workflow-templates.ts',
    file: /\/components\/workflows\/workflow-templates\.ts$/,
    via: 'workflows-empty-state.tsx · __tests__/starter-templates.test.ts',
  },
  {
    path: 'lib/desktop-download.ts',
    file: /\/lib\/desktop-download\.ts$/,
    via: 'labelKey on each build · desktop-download-dialog.tsx',
  },
]

/** Props whose string value a user reads. */
const TEXT_PROPS = ['placeholder', 'aria-label', 'alt', 'emptyText', 'title']
/** Props that hold prose-shaped values nobody reads. */
const CSS_PROPS = [
  'className',
  'class',
  'style',
  'id',
  'key',
  'data-slot',
  'variant',
  'size',
  'type',
  'name',
  'value',
  'href',
  'to',
  'src',
  'role',
  'icon',
  'color',
  'align',
  'side',
  'render',
  'mode',
  'orientation',
  'fill',
  'stroke',
  'viewBox',
  'd',
  'transform',
  'width',
  'height',
]

const jsxText = />\s*([A-Za-z][^<>{}\n]{2,}?)\s*</g
const jsxTextMulti = />\s*\n\s*([A-Za-z][^<>{}]{20,}?)\s*\n\s*</g
const propStr = new RegExp(
  `\\b(${TEXT_PROPS.join('|')})=(?:"([^"]{3,})"|\\{\\s*'([^']{3,})'\\s*\\})`,
  'g',
)
const ternary = /\?\s*'([^']{3,})'\s*:\s*'([^']{3,})'/g
const toastCall =
  /\b(?:toast(?:\.\w+)?|notify|setError|setStatus)\(\s*'([^']{3,})'/g
/**
 * Object literals carrying display text — template catalogues, step
 * registries, error tables. These live almost entirely in plain .ts, so they
 * were invisible while this walked components alone: the workflow template
 * cards stayed English through an entire sweep because of it.
 */
const objectText =
  /^\s*(?:title|label|description|message|summary|hint|shelfLabel):\s*'([^']{4,})'/gm
/**
 * Default values in a props destructure — `{ shelfLabel = 'Start from a
 * template' }`. Nothing about them looks like a string literal in JSX, and no
 * caller has to pass the prop, so the English default is simply what ships.
 * The Workflows empty state kept an English heading over German cards this way.
 */
const propDefault = /^\s*\w+\s*=\s*'([^']{4,})',?\s*$/gm

const CSS_VALUE =
  /(?:\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)\b|var\(|color-mix|oklch|rgba?\(|calc\(|linear-gradient|\bsolid\b|\bdashed\b|#[0-9a-fA-F]{3,8}\b)/
const TAILWIND =
  /(?:^|\s)(?:size|text|bg|border|px|py|mt|mb|gap|flex|grid|w|h|min|max)-/
const CODE =
  /(?:\bexport\b|\bconst\b|\bimport\b|\breturn\b|=>|::|\bPick\b|\bArray\b|\bcreateContext\b|\bRecord\b|\bReturnType\b|\btypeof\b|\bnew [A-Z]|\w+\(\)|^\w+:)/
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/
const KEBAB_OR_DOTTED = /^[a-z0-9]+(?:[-.][a-z0-9]+)+$/
/**
 * A translation key, not English. `t(x ? 'a.bKey' : 'a.cKey')` matches the
 * ternary pattern, so the more this sweep translated the more the scanner
 * reported its own output as work still to do.
 */
const I18N_KEY = /^[a-z][A-Za-z0-9]*(?:\.[a-zA-Z][A-Za-z0-9]*)+$/
const CSS_VAR = /^--/
/** A route or endpoint, not prose — `/api/user/workspace/terminal-layout`. */
const URL_PATH = /^(?:https?:\/\/|\/[a-z0-9])/i
const TICKER = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}(?:\s*·.*)?$/
const HAS_LETTERS = /[A-Za-z]{2}/

const BRAND = new Set([
  'Pairlens',
  'USD',
  'USDT',
  'BTC',
  'ETH',
  'AI',
  'API',
  'OKX',
  'UTC',
  'CEX',
  'DEX',
])
/** Single words a user genuinely reads, kept despite looking like enum ids. */
const REAL_WORDS = new Set([
  'amount',
  'buy',
  'sell',
  'cancel',
  'save',
  'delete',
  'close',
  'open',
  'confirm',
  'back',
  'next',
  'done',
  'edit',
  'remove',
  'add',
  'search',
  'settings',
  'total',
  'price',
  'size',
  'balance',
  'orders',
  'fills',
  'positions',
  'bought',
  'sold',
  'live',
  'paper',
  'connected',
])

function keep(raw: string): boolean {
  const s = raw.trim()
  if (s.length < 3 || BRAND.has(s)) return false
  if (!HAS_LETTERS.test(s)) return false
  if (CODE.test(s) || CSS_VAR.test(s) || TICKER.test(s) || URL_PATH.test(s))
    return false
  if (I18N_KEY.test(s)) return false
  if (CSS_VALUE.test(s) || TAILWIND.test(s) || KEBAB_OR_DOTTED.test(s))
    return false
  if (IDENTIFIER.test(s) && !s.includes(' '))
    return REAL_WORDS.has(s.toLowerCase())
  return true
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) yield* walk(p)
    // .ts too, not just .tsx. Template catalogues, store error messages and
    // hook fallbacks live in plain .ts and were invisible while this only
    // walked components — the workflow template cards stayed English through
    // a whole sweep because of it.
    else if (
      (p.endsWith('.tsx') || p.endsWith('.ts')) &&
      !p.endsWith('.d.ts') &&
      !NOT_USER_FACING.some((re) => re.test(p)) &&
      !TRANSLATED_AT_RENDER.some((e) => e.file.test(p))
    )
      yield p
  }
}

const rows: Array<{ file: string; strings: Array<string> }> = []

for (const path of walk(ROOT)) {
  const text = readFileSync(path, 'utf8')
  const s = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(
      new RegExp(`\\b(?:${CSS_PROPS.join('|')})=(?:"[^"]*"|\\{[^{}]*\\})`, 'g'),
      '',
    )
    .replace(/\bcn\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/style=\{\{[\s\S]*?\}\}/g, '')

  const hits = new Set<string>()
  for (const m of s.matchAll(jsxText)) hits.add(m[1])
  for (const m of s.matchAll(jsxTextMulti)) hits.add(m[1].replace(/\s+/g, ' '))
  for (const m of s.matchAll(propStr)) hits.add(m[2] ?? m[3])
  for (const m of s.matchAll(ternary)) {
    hits.add(m[1])
    hits.add(m[2])
  }
  for (const m of s.matchAll(toastCall)) hits.add(m[1])
  for (const m of s.matchAll(objectText)) hits.add(m[1])
  for (const m of s.matchAll(propDefault)) hits.add(m[1])

  const kept = [...hits]
    .map((h) => h.trim())
    .filter(keep)
    .sort()
  if (kept.length)
    rows.push({ file: path.slice(ROOT.length + 1), strings: kept })
}

rows.sort((a, b) => b.strings.length - a.strings.length)
const total = rows.reduce((n, r) => n + r.strings.length, 0)

if (process.argv.includes('--list')) {
  for (const r of rows) {
    console.log(`\n### ${r.file}  (${r.strings.length})`)
    for (const s of r.strings) console.log(`    ${s}`)
  }
}
console.log(`\n${rows.length} files, ${total} hardcoded user-facing strings`)
console.log(
  `${TRANSLATED_AT_RENDER.length} data modules skipped — their English is a ` +
    `defaultValue source, translated at the render site:`,
)
for (const entry of TRANSLATED_AT_RENDER) {
  console.log(`    ${entry.path} → ${entry.via}`)
}
if (!process.argv.includes('--list')) {
  console.log('Run with --list to see them.')
}
