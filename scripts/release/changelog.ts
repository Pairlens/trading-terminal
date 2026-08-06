// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Build the release-notes body for a `v*` tag out of the commits that landed
 * since the previous release tag.
 *
 * Runs in the `create-release` job of .github/workflows/release.yml, before the
 * installers are built, and prints markdown to stdout. Commits are read with
 * `--no-merges`, so a branch contributes its own commits rather than the one
 * `merge:` commit that folded it into main, and grouped by conventional-commit
 * type (`feat`, `fix`, `i18n(terminal)`, ...). Anything that doesn't parse as a
 * conventional commit still shows up, under "Under the hood".
 *
 * Usage:
 *   bun scripts/release/changelog.ts v0.2.0        # notes for a tag
 *   bun scripts/release/changelog.ts               # notes for the tag on HEAD
 *
 * Env:
 *   TAG            tag to describe (argv[2] wins over this)
 *   PREVIOUS_TAG   baseline override; default is the highest `v*` tag below
 *                  TAG that is also an ancestor of it
 *   RELEASE_REPO   owner/repo for commit and compare links (defaults to
 *                  GITHUB_REPOSITORY, then package.json `repository`)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function fail(message: string): never {
  console.error(`[changelog] ${message}`)
  process.exit(1)
}

/** Run git, failing the script on a non-zero exit. */
function git(...args: Array<string>): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

/** Run git, returning null instead of failing (for probes that may miss). */
function gitTry(...args: Array<string>): string | null {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function repoSlug(): string {
  const fromEnv = process.env.RELEASE_REPO || process.env.GITHUB_REPOSITORY
  if (fromEnv) return fromEnv
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
  ) as { repository?: { url?: string } }
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? '')
  if (!match) fail('Cannot determine the repo slug — set RELEASE_REPO')
  return match[1]
}

function parseVersion(tag: string): [number, number, number] | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * The release this one follows: the highest `v*` tag below TAG that TAG can
 * actually reach. Version order rather than `git describe`'s commit distance,
 * so a tag cut on a side branch can never become the baseline.
 */
function previousTag(tag: string): string | null {
  const override = process.env.PREVIOUS_TAG?.trim()
  if (override) return override

  const current = parseVersion(tag)
  const candidates = git('tag', '--list', 'v*')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((candidate) => candidate !== tag)
    .map((candidate) => ({ tag: candidate, version: parseVersion(candidate) }))
    .filter(
      (entry): entry is { tag: string; version: [number, number, number] } =>
        entry.version !== null &&
        (current === null || compareVersions(entry.version, current) < 0),
    )
    .sort((a, b) => compareVersions(b.version, a.version))

  for (const candidate of candidates) {
    const reachable = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', candidate.tag, tag],
      { cwd: ROOT },
    )
    if (reachable.status === 0) return candidate.tag
  }
  return null
}

interface Commit {
  sha: string
  author: string
  type: string | null
  scope: string | null
  subject: string
  breaking: boolean
}

// `type(scope)!: subject` — type allows digits so `i18n(terminal):` parses.
const HEADER = /^([a-z][a-z0-9]*)(?:\(([^)]*)\))?(!)?:\s*(.+)$/i

const UNIT = '\x1f'
const RECORD = '\x1e'

function readCommits(range: string): Array<Commit> {
  const log = git(
    'log',
    '--no-merges',
    '--topo-order',
    `--pretty=format:%H${UNIT}%an${UNIT}%s${UNIT}%b${RECORD}`,
    range,
  )
  return log
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', author = '', subject = '', body = ''] =
        record.split(UNIT)
      const header = HEADER.exec(subject)
      return {
        sha,
        author,
        type: header ? header[1].toLowerCase() : null,
        scope: header?.[2]?.trim() || null,
        subject: header ? header[4] : subject,
        breaking:
          Boolean(header?.[3]) || /^BREAKING[ -]CHANGE:/m.test(body.trim()),
      }
    })
}

interface Section {
  title: string
  types: Array<string>
  /** Rendered inside a collapsed <details> — the catch-all bucket. */
  collapsed?: boolean
}

const SECTIONS: Array<Section> = [
  { title: 'New', types: ['feat'] },
  { title: 'Fixed', types: ['fix'] },
  { title: 'Performance', types: ['perf'] },
  { title: 'Polish', types: ['polish', 'style', 'ui', 'design'] },
  { title: 'Translations', types: ['i18n'] },
  { title: 'Docs', types: ['docs'] },
  // Catch-all: chore, refactor, test, ci, build, and anything that isn't a
  // conventional commit at all.
  { title: 'Under the hood', types: [], collapsed: true },
]

/** Commits that describe the release plumbing itself, not what shipped in it. */
const SKIPPED_TYPES = new Set(['release', 'merge'])

const repo = repoSlug()
const tag =
  process.argv[2]?.trim() ||
  process.env.TAG?.trim() ||
  gitTry('describe', '--tags', '--exact-match', 'HEAD') ||
  fail('No tag given and HEAD is not tagged — pass one: changelog.ts v1.2.3')

if (!gitTry('rev-parse', '--verify', `${tag}^{commit}`)) {
  fail(`Unknown tag: ${tag}`)
}

const previous = previousTag(tag)
const range = previous ? `${previous}..${tag}` : tag
const commits = readCommits(range).filter(
  (commit) => !(commit.type && SKIPPED_TYPES.has(commit.type)),
)

// Two branches touching the same thing can land the same subject twice.
const seen = new Set<string>()
const unique = commits.filter((commit) => {
  const key = `${commit.type}|${commit.scope}|${commit.subject.toLowerCase()}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

function bullet(commit: Commit): string {
  const short = commit.sha.slice(0, 7)
  const link = `[\`${short}\`](https://github.com/${repo}/commit/${commit.sha})`
  // Squash-merge subjects carry the PR number — make it clickable.
  const subject = commit.subject.replace(
    /\(#(\d+)\)\s*$/,
    (_, number: string) =>
      `([#${number}](https://github.com/${repo}/pull/${number}))`,
  )
  const scope = commit.scope ? `**${commit.scope}:** ` : ''
  return `- ${scope}${subject} (${link})`
}

const lines: Array<string> = [
  'Download the installer for your platform below. Existing installs update themselves.',
]

const breaking = unique.filter((commit) => commit.breaking)
if (breaking.length > 0) {
  lines.push('', '## Breaking changes', '', ...breaking.map(bullet))
}

const claimed = new Set(SECTIONS.flatMap((section) => section.types))
for (const section of SECTIONS) {
  const members = unique.filter((commit) =>
    section.types.length > 0
      ? section.types.includes(commit.type ?? '')
      : !commit.type || !claimed.has(commit.type),
  )
  if (members.length === 0) continue
  if (section.collapsed) {
    lines.push(
      '',
      `<details><summary>${section.title} (${members.length})</summary>`,
      '',
      ...members.map(bullet),
      '',
      '</details>',
    )
  } else {
    lines.push('', `## ${section.title}`, '', ...members.map(bullet))
  }
}

if (unique.length === 0) {
  lines.push(
    '',
    `No commits landed between ${previous ?? 'the first commit'} and ${tag}.`,
  )
}

const authors = [...new Set(unique.map((commit) => commit.author))]
  .filter((author) => !author.endsWith('[bot]'))
  .sort()
if (authors.length > 1) {
  lines.push(
    '',
    `Thanks to ${authors.join(', ')} for the commits in this release.`,
  )
}

lines.push(
  '',
  previous
    ? `**Full changelog**: https://github.com/${repo}/compare/${previous}...${tag}`
    : `**Full changelog**: https://github.com/${repo}/commits/${tag}`,
)

console.error(`[changelog] ${unique.length} commits in ${range} (repo ${repo})`)

// GitHub rejects a release body over 125,000 characters. No release has come
// close, but a body that overflows would fail the whole pipeline, so trim the
// tail rather than lose the release.
const LIMIT = 120_000
const body = lines.join('\n')
if (body.length > LIMIT) {
  console.error(`[changelog] body is ${body.length} chars — trimming`)
  const cut = body.slice(0, LIMIT)
  const kept = cut.slice(0, cut.lastIndexOf('\n'))
  // The cut may land inside the collapsed section — close it, or the rest of
  // the notes render inside a <details> nobody opened.
  const unclosed =
    (kept.match(/<details>/g) ?? []).length >
    (kept.match(/<\/details>/g) ?? []).length
  console.log(
    [
      kept,
      unclosed ? '\n</details>' : '',
      '\n_Too many commits to list in full._\n',
      lines[lines.length - 1],
    ].join('\n'),
  )
} else {
  console.log(body)
}
