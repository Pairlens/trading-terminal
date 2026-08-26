// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Decide whether the desktop installers are overdue for a rebuild.
 *
 * Installers only reach users when someone cuts a `v*` tag, so improvements
 * that merged to main weeks ago can sit unshipped while the download page
 * serves a stale build. `.github/workflows/auto-release.yml` runs this daily:
 * when the oldest unreleased change that actually ships inside the app has
 * been on main for a week, it is time for a new version.
 *
 *   bun run release:check                 # human report
 *   bun run release:check --json          # machine readable
 *   bun run release:check --soak-days 3   # shorter wait
 *   bun run release:check --bump minor    # override the inferred bump
 *
 * How the decision is made:
 *   - The baseline is the highest `v*` tag reachable from HEAD.
 *   - Age comes from the FIRST-PARENT history: the committer date of a merge
 *     into main is when that branch's work landed for users, which is what
 *     "sitting unreleased for a week" means. A branch commit authored a month
 *     earlier and merged yesterday has been on main for one day, not thirty.
 *   - Commits that cannot change what an installer contains (marketing site,
 *     registry, CLI, docs, CI, agent config) do not start the clock. A
 *     README typo should not spend 30 minutes on four runners.
 *   - The bump is inferred from conventional commits: a breaking change or a
 *     `feat` makes it a minor while the app is pre-1.0, anything else a patch.
 *     Majors stay a human decision.
 *
 * When a release IS due, everything on main ships in it — the soak window is
 * the trigger, not a cutoff. Tagging anything but HEAD would leave the tag
 * disagreeing with the version files the bump commit writes.
 *
 * Env:
 *   RELEASE_SOAK_DAYS    default soak window (default 7)
 *   RELEASE_BUMP         default bump: auto | major | minor | patch
 *   GITHUB_OUTPUT        when set, the decision is appended as step outputs
 *   GITHUB_STEP_SUMMARY  when set, a markdown summary is appended
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bumpVersion, isBumpKind, parseVersion } from './version'
import type { BumpKind } from './version'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONF = resolve(ROOT, 'apps/desktop/src-tauri/tauri.conf.json')

export const DEFAULT_SOAK_DAYS = 7

/**
 * Path prefixes that cannot change what a desktop installer contains. The
 * terminal SPA, the desktop crate, every package it imports, the patched
 * dependencies and the root lockfile all do — so anything not listed here is
 * assumed to ship, and the filter errs towards releasing.
 */
const NON_APP_PREFIXES = [
  '.agents/',
  '.claude/',
  '.cursor/',
  '.githooks/',
  '.github/',
  '.gitnexus/',
  '.vscode/',
  'apps/cli/',
  'apps/marketing/',
  'apps/registry/',
  'docs/',
  'examples/',
  'scripts/',
]

/** Commit types that describe release plumbing rather than what shipped. */
const SKIPPED_TYPES = new Set(['release'])

const HEADER = /^([a-z][a-z0-9]*)(?:\(([^)]*)\))?(!)?:/i
const BREAKING_BODY = /^BREAKING[ -]CHANGE:/m

export interface PendingCommit {
  sha: string
  /** Committer date of the first-parent commit — when it landed on main. */
  landedAt: string
  subject: string
  body: string
  files: Array<string>
}

export type ReleaseReason = 'due' | 'up-to-date' | 'no-app-changes' | 'soaking'

export interface ReleaseDecision {
  due: boolean
  reason: ReleaseReason
  detail: string
  soakDays: number
  currentVersion: string
  previousTag: string | null
  /** First-parent commits on main since the previous release tag. */
  pendingTotal: number
  /** How many of those change something the installer carries. */
  shippingTotal: number
  oldest: {
    sha: string
    landedAt: string
    subject: string
    ageDays: number
  } | null
  bump: BumpKind | null
  nextVersion: string | null
  tag: string | null
}

/** Does this path change anything a desktop installer carries? */
export function shipsInInstaller(file: string): boolean {
  if (NON_APP_PREFIXES.some((prefix) => file.startsWith(prefix))) return false
  // Root-level prose: READMEs, contributing guides, the agent files.
  if (!file.includes('/') && file.endsWith('.md')) return false
  return true
}

/** A commit ships when any single file in it does. */
export function commitShips(commit: PendingCommit): boolean {
  return commit.files.some(shipsInInstaller)
}

export function isReleaseCommit(subject: string): boolean {
  const type = HEADER.exec(subject)?.[1]?.toLowerCase()
  return type !== undefined && SKIPPED_TYPES.has(type)
}

/**
 * Read the bump out of the conventional-commit headers. Breaking changes are
 * a minor while the major is 0 — that is what semver says 0.x means, and an
 * automated job promoting the app to 1.0.0 on its own would be a surprise.
 */
export function inferBumpKind(
  commits: Array<Pick<PendingCommit, 'subject' | 'body'>>,
  currentVersion: string,
): BumpKind {
  const breaking = commits.some(
    (commit) =>
      Boolean(HEADER.exec(commit.subject)?.[3]) ||
      BREAKING_BODY.test(commit.body.trim()),
  )
  const feature = commits.some(
    (commit) => HEADER.exec(commit.subject)?.[1]?.toLowerCase() === 'feat',
  )
  const major = parseVersion(currentVersion)?.[0] ?? 0
  if (breaking) return major === 0 ? 'minor' : 'major'
  if (feature) return 'minor'
  return 'patch'
}

export function ageInDays(landedAt: string, now: Date): number {
  const landed = new Date(landedAt).getTime()
  if (Number.isNaN(landed)) return 0
  return Math.max(0, (now.getTime() - landed) / 86_400_000)
}

export interface DecideInput {
  /** First-parent commits since the previous tag, newest first. */
  pending: Array<PendingCommit>
  /** Non-merge commits in the same range — what the changelog will list. */
  changes: Array<Pick<PendingCommit, 'subject' | 'body' | 'files'>>
  currentVersion: string
  previousTag: string | null
  now: Date
  soakDays?: number
  /** `auto` (or omitted) infers the bump from the commits. */
  bumpOverride?: BumpKind | 'auto'
}

export function decideRelease(input: DecideInput): ReleaseDecision {
  const soakDays = input.soakDays ?? DEFAULT_SOAK_DAYS
  const pending = input.pending.filter(
    (commit) => !isReleaseCommit(commit.subject),
  )
  const shipping = pending.filter(commitShips)

  const base = {
    soakDays,
    currentVersion: input.currentVersion,
    previousTag: input.previousTag,
    pendingTotal: pending.length,
    shippingTotal: shipping.length,
  }

  if (pending.length === 0) {
    return {
      ...base,
      due: false,
      reason: 'up-to-date',
      detail: `Nothing has landed on main since ${input.previousTag ?? 'the first commit'}.`,
      oldest: null,
      bump: null,
      nextVersion: null,
      tag: null,
    }
  }

  if (shipping.length === 0) {
    return {
      ...base,
      due: false,
      reason: 'no-app-changes',
      detail: `${pending.length} commit${pending.length === 1 ? '' : 's'} unreleased, none of them inside the desktop app.`,
      oldest: null,
      bump: null,
      nextVersion: null,
      tag: null,
    }
  }

  const oldestCommit = shipping.reduce((oldest, commit) =>
    Date.parse(commit.landedAt) < Date.parse(oldest.landedAt) ? commit : oldest,
  )
  const oldest = {
    sha: oldestCommit.sha,
    landedAt: oldestCommit.landedAt,
    subject: oldestCommit.subject,
    ageDays: ageInDays(oldestCommit.landedAt, input.now),
  }

  if (oldest.ageDays < soakDays) {
    const left = soakDays - oldest.ageDays
    return {
      ...base,
      due: false,
      reason: 'soaking',
      detail: `Oldest unreleased app change is ${oldest.ageDays.toFixed(1)}d old — ${left.toFixed(1)}d short of the ${soakDays}d window.`,
      oldest,
      bump: null,
      nextVersion: null,
      tag: null,
    }
  }

  const override = input.bumpOverride
  const bump =
    override && override !== 'auto'
      ? override
      : inferBumpKind(
          input.changes.filter((commit) => commit.files.some(shipsInInstaller)),
          input.currentVersion,
        )
  const nextVersion = bumpVersion(input.currentVersion, bump)

  return {
    ...base,
    due: true,
    reason: 'due',
    detail: `${shipping.length} unreleased app change${shipping.length === 1 ? '' : 's'}, the oldest ${oldest.ageDays.toFixed(1)}d on main.`,
    oldest,
    bump,
    nextVersion,
    tag: `v${nextVersion}`,
  }
}

// ---------------------------------------------------------------------------
// CLI — everything below reads git and reports; the logic above stays pure.
// ---------------------------------------------------------------------------

const RECORD = '\x1e'
const UNIT = '\x1f'

function fail(message: string): never {
  console.error(`[release:check] ${message}`)
  process.exit(1)
}

function git(...args: Array<string>): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

/** The release this check measures against: highest `v*` tag HEAD can reach. */
function previousTag(): string | null {
  const tags = git(
    'tag',
    '--list',
    'v*',
    '--merged',
    'HEAD',
    '--sort=-v:refname',
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return tags[0] ?? null
}

function readCommits(
  range: string,
  mode: 'first-parent' | 'changes',
): Array<PendingCommit> {
  const log = git(
    'log',
    mode === 'first-parent' ? '--first-parent' : '--no-merges',
    '--name-only',
    `--format=${RECORD}%H${UNIT}%cI${UNIT}%s${UNIT}%b${UNIT}`,
    range,
  )
  return log
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', landedAt = '', subject = '', body = '', paths = ''] =
        record.split(UNIT)
      return {
        sha,
        landedAt,
        subject,
        body,
        files: paths
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }
    })
}

function flag(name: string, argv: Array<string>): string | undefined {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) fail(`${name} needs a value`)
  return value
}

function report(decision: ReleaseDecision): string {
  const lines = [
    `baseline        ${decision.previousTag ?? '(no release tag yet)'} — app version ${decision.currentVersion}`,
    `unreleased      ${decision.pendingTotal} merged to main, ${decision.shippingTotal} inside the desktop app`,
  ]
  if (decision.oldest) {
    lines.push(
      `oldest          ${decision.oldest.landedAt} (${decision.oldest.ageDays.toFixed(1)}d) ${decision.oldest.sha.slice(0, 7)} ${decision.oldest.subject}`,
    )
  }
  lines.push(`soak window     ${decision.soakDays}d`)
  lines.push(
    decision.due
      ? `verdict         RELEASE DUE — ${decision.currentVersion} → ${decision.nextVersion} (${decision.bump})`
      : `verdict         no release needed (${decision.reason})`,
  )
  lines.push(`                ${decision.detail}`)
  return lines.join('\n')
}

function writeStepOutputs(decision: ReleaseDecision): void {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  const pairs: Array<[string, string]> = [
    ['due', String(decision.due)],
    ['reason', decision.reason],
    ['current_version', decision.currentVersion],
    ['next_version', decision.nextVersion ?? ''],
    ['tag', decision.tag ?? ''],
    ['bump', decision.bump ?? ''],
    ['pending', String(decision.pendingTotal)],
    ['shipping', String(decision.shippingTotal)],
    ['oldest_age_days', decision.oldest?.ageDays.toFixed(1) ?? ''],
  ]
  const body = pairs.map(([key, value]) => `${key}=${value}`).join('\n')
  // `detail` is prose — pass it through the delimiter form so a stray
  // character can never break the outputs file.
  appendFileSync(
    file,
    `${body}\ndetail<<PAIRLENS_EOF\n${decision.detail}\nPAIRLENS_EOF\n`,
  )
}

function writeStepSummary(decision: ReleaseDecision): void {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (!file) return
  const rows = [
    ['Baseline', decision.previousTag ?? '(none)'],
    ['App version', decision.currentVersion],
    ['Unreleased merges', String(decision.pendingTotal)],
    ['…that ship in the app', String(decision.shippingTotal)],
    [
      'Oldest unreleased',
      decision.oldest
        ? `${decision.oldest.ageDays.toFixed(1)}d ago, \`${decision.oldest.sha.slice(0, 7)}\` ${decision.oldest.subject}`
        : '—',
    ],
    ['Soak window', `${decision.soakDays}d`],
    [
      'Verdict',
      decision.due
        ? `**release due** → \`${decision.tag}\` (${decision.bump})`
        : `no release (${decision.reason})`,
    ],
  ]
  appendFileSync(
    file,
    [
      '## Release check',
      '',
      '| | |',
      '| --- | --- |',
      ...rows.map(([key, value]) => `| ${key} | ${value} |`),
      '',
      decision.detail,
      '',
    ].join('\n'),
  )
}

/**
 * Read git and the app version, and decide. Exported so `scripts/release.ts`
 * can ask for the inferred bump without shelling back out to this CLI.
 */
export function resolveDecision(
  options: { soakDays?: number; bumpOverride?: BumpKind | 'auto' } = {},
): ReleaseDecision {
  const conf = JSON.parse(readFileSync(CONF, 'utf8')) as { version: string }
  const tag = previousTag()
  const range = tag ? `${tag}..HEAD` : 'HEAD'

  return decideRelease({
    pending: readCommits(range, 'first-parent'),
    changes: readCommits(range, 'changes'),
    currentVersion: conf.version,
    previousTag: tag,
    now: new Date(),
    soakDays: options.soakDays,
    bumpOverride: options.bumpOverride,
  })
}

function main(): void {
  const argv = process.argv.slice(2)
  const soakDays = Number(
    flag('--soak-days', argv) ??
      process.env.RELEASE_SOAK_DAYS ??
      DEFAULT_SOAK_DAYS,
  )
  if (!Number.isFinite(soakDays) || soakDays < 0) {
    fail(`--soak-days must be a non-negative number`)
  }
  const bumpArg = flag('--bump', argv) ?? process.env.RELEASE_BUMP ?? 'auto'
  if (bumpArg !== 'auto' && !isBumpKind(bumpArg)) {
    fail(`--bump must be auto, major, minor or patch (got ${bumpArg})`)
  }

  const decision = resolveDecision({ soakDays, bumpOverride: bumpArg })

  writeStepOutputs(decision)
  writeStepSummary(decision)
  console.log(
    argv.includes('--json') ? JSON.stringify(decision) : report(decision),
  )
}

if (import.meta.main) main()
