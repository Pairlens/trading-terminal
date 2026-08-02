/**
 * License header checker/fixer.
 *
 * Every first-party source file carries a two-line SPDX header:
 *
 *   // Copyright (c) 2026 Juan Ignacio Molina Estrada
 *   // SPDX-License-Identifier: FSL-1.1-Apache-2.0
 *
 * Usage:
 *   bun scripts/license-headers.ts --check [files...]   # exit 1 if any file lacks a header
 *   bun scripts/license-headers.ts --fix   [files...]   # insert missing headers
 *
 * With no file arguments, the whole repo (tracked files) is processed.
 * Excluded: generated files, committed build artifacts, vendored tooling, and
 * community-owned plugins under apps/registry/community (their authors keep
 * their own licensing).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const COPYRIGHT = 'Copyright (c) 2026 Juan Ignacio Molina Estrada'
const SPDX_ID = 'FSL-1.1-Apache-2.0'

/** Comment style per extension. Extensions not listed are not required to carry a header. */
const COMMENT_STYLES: Record<string, 'slash' | 'hash' | 'block' | 'astro'> = {
  '.ts': 'slash',
  '.tsx': 'slash',
  '.js': 'slash',
  '.jsx': 'slash',
  '.mjs': 'slash',
  '.cjs': 'slash',
  '.rs': 'slash',
  '.py': 'hash',
  '.sh': 'hash',
  '.css': 'block',
  '.astro': 'astro',
}

const EXCLUDED_PATHS: Array<RegExp> = [
  // Generated files and committed build artifacts
  /(^|\/)routeTree\.gen\.ts$/,
  /\.gen\.tsx?$/,
  /^apps\/terminal\/public\/_sdk\//,
  /^apps\/desktop\/src-tauri\/gen\//,
  // Vendored tooling and agent config
  /^\.agents\//,
  /^\.claude\//,
  /^\.cursor\//,
  // Community plugins are owned and licensed by their authors
  /^apps\/registry\/community\//,
]

function gitFiles(): Array<string> {
  const result = spawnSync('git', ['ls-files'], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error('[license-headers] git ls-files failed')
    process.exit(2)
  }
  return result.stdout.split('\n').filter(Boolean)
}

function isCandidate(file: string): boolean {
  if (!(path.extname(file) in COMMENT_STYLES)) return false
  return !EXCLUDED_PATHS.some((re) => re.test(file))
}

function headerLines(style: 'slash' | 'hash' | 'block'): string {
  if (style === 'slash')
    return `// ${COPYRIGHT}\n// SPDX-License-Identifier: ${SPDX_ID}\n`
  if (style === 'hash')
    return `# ${COPYRIGHT}\n# SPDX-License-Identifier: ${SPDX_ID}\n`
  return `/*\n * ${COPYRIGHT}\n * SPDX-License-Identifier: ${SPDX_ID}\n */\n`
}

function hasHeader(content: string): boolean {
  const head = content.split('\n', 8).join('\n')
  return head.includes('SPDX-License-Identifier:')
}

function insertHeader(file: string, content: string): string {
  const style = COMMENT_STYLES[path.extname(file)]
  if (style === 'astro') {
    // Astro: the header lives inside the frontmatter fence as JS comments.
    if (content.startsWith('---\n')) {
      return `---\n${headerLines('slash')}${content.slice(4)}`
    }
    return `---\n${headerLines('slash')}---\n\n${content}`
  }
  // Keep a shebang (and a Python encoding line) on top.
  const lines = content.split('\n')
  let insertAt = 0
  if (lines[0]?.startsWith('#!')) insertAt = 1
  if (style === 'hash' && /^#.*coding[:=]/.test(lines[insertAt] ?? ''))
    insertAt += 1
  const header = headerLines(style)
  if (insertAt === 0) return header + content
  return (
    lines.slice(0, insertAt).join('\n') +
    '\n' +
    header +
    lines.slice(insertAt).join('\n')
  )
}

const args = process.argv.slice(2)
const mode = args.includes('--fix')
  ? 'fix'
  : args.includes('--check')
    ? 'check'
    : null
if (!mode) {
  console.error(
    'Usage: bun scripts/license-headers.ts --check|--fix [files...]',
  )
  process.exit(2)
}
const fileArgs = args.filter((a) => a !== '--fix' && a !== '--check')
const files = (fileArgs.length > 0 ? fileArgs : gitFiles()).filter(isCandidate)

const missing: Array<string> = []
for (const file of files) {
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue // deleted/renamed staged path
  }
  if (content.trim().length === 0) continue
  if (hasHeader(content)) continue
  missing.push(file)
  if (mode === 'fix') writeFileSync(file, insertHeader(file, content))
}

if (mode === 'fix') {
  console.log(`[license-headers] added headers to ${missing.length} file(s)`)
} else if (missing.length > 0) {
  console.error(
    `[license-headers] ${missing.length} file(s) missing the license header:`,
  )
  for (const file of missing) console.error(`  ${file}`)
  console.error(`\nRun \`bun run license-headers:fix\` to add them.`)
  process.exit(1)
} else {
  console.log(`[license-headers] ok (${files.length} files checked)`)
}
