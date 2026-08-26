// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  ageInDays,
  commitShips,
  decideRelease,
  inferBumpKind,
  isReleaseCommit,
  shipsInInstaller,
} from '../due'
import { bumpVersion, parseVersion } from '../version'
import type { PendingCommit } from '../due'

const NOW = new Date('2026-08-26T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function commit(over: Partial<PendingCommit> = {}): PendingCommit {
  return {
    sha: 'a'.repeat(40),
    landedAt: daysAgo(10),
    subject: 'fix(terminal): a thing',
    body: '',
    files: ['apps/terminal/src/lib/thing.ts'],
    ...over,
  }
}

describe('shipsInInstaller', () => {
  it('counts everything the desktop bundle is built from', () => {
    for (const file of [
      'apps/terminal/src/routes/_terminal.tsx',
      'apps/desktop/src-tauri/src/main.rs',
      'packages/plugins/src/ccxt-connector/venues/okx.ts',
      'packages/ui/src/button.tsx',
      'patches/ccxt@4.5.71.patch',
      'package.json',
      'bun.lock',
      'turbo.json',
    ]) {
      expect(shipsInInstaller(file)).toBe(true)
    }
  })

  it('ignores what an installer cannot carry', () => {
    for (const file of [
      'apps/marketing/src/content/docs/settings.md',
      'apps/registry/src/community.ts',
      'apps/cli/src/index.ts',
      'docs/RELEASING.md',
      '.github/workflows/ci.yml',
      '.githooks/pre-commit',
      '.claude/settings.json',
      'scripts/release/due.ts',
      'examples/dev-starter-plugin/index.ts',
      'README.md',
      'CLAUDE.md',
    ]) {
      expect(shipsInInstaller(file)).toBe(false)
    }
  })
})

describe('commitShips', () => {
  it('ships when any one file does', () => {
    expect(
      commitShips(
        commit({
          files: ['README.md', 'apps/terminal/src/styles.css'],
        }),
      ),
    ).toBe(true)
  })

  it('does not ship a docs-only or empty commit', () => {
    expect(
      commitShips(commit({ files: ['apps/marketing/src/pages/index.astro'] })),
    ).toBe(false)
    expect(commitShips(commit({ files: [] }))).toBe(false)
  })
})

describe('isReleaseCommit', () => {
  it('recognises the version-bump commit and nothing else', () => {
    expect(isReleaseCommit('release: v0.5.0')).toBe(true)
    expect(isReleaseCommit('feat(chart): draw the thing')).toBe(false)
    expect(isReleaseCommit('Merge branch of release stuff')).toBe(false)
  })
})

describe('inferBumpKind', () => {
  const at = (subject: string, body = '') => ({ subject, body })

  it('is a patch for fixes, chores and unparsed subjects', () => {
    expect(
      inferBumpKind(
        [at('fix(dex): resolve the pool'), at('chore: bump'), at('tidy up')],
        '0.5.0',
      ),
    ).toBe('patch')
  })

  it('is a minor when a feat landed', () => {
    expect(
      inferBumpKind([at('fix: a'), at('feat(nft): trait floors')], '0.5.0'),
    ).toBe('minor')
  })

  it('keeps a breaking change at minor while the app is pre-1.0', () => {
    expect(inferBumpKind([at('refactor!: drop the old store')], '0.5.0')).toBe(
      'minor',
    )
    expect(
      inferBumpKind(
        [at('refactor: drop the old store', 'BREAKING CHANGE: layouts reset')],
        '0.5.0',
      ),
    ).toBe('minor')
  })

  it('promotes a breaking change to major once past 1.0', () => {
    expect(inferBumpKind([at('feat!: new order path')], '1.4.2')).toBe('major')
  })
})

describe('ageInDays', () => {
  it('measures against now and never goes negative', () => {
    expect(ageInDays(daysAgo(3), NOW)).toBeCloseTo(3, 5)
    expect(ageInDays(daysAgo(-2), NOW)).toBe(0)
  })
})

describe('decideRelease', () => {
  const base = {
    currentVersion: '0.5.0',
    previousTag: 'v0.5.0',
    now: NOW,
    changes: [] as Array<Pick<PendingCommit, 'subject' | 'body' | 'files'>>,
  }

  it('is up to date when nothing landed', () => {
    const decision = decideRelease({ ...base, pending: [] })
    expect(decision.due).toBe(false)
    expect(decision.reason).toBe('up-to-date')
    expect(decision.tag).toBeNull()
  })

  it('does not release for changes outside the app', () => {
    const decision = decideRelease({
      ...base,
      pending: [
        commit({ landedAt: daysAgo(30), files: ['docs/RELEASING.md'] }),
        commit({ landedAt: daysAgo(20), files: ['apps/marketing/x.astro'] }),
      ],
    })
    expect(decision.due).toBe(false)
    expect(decision.reason).toBe('no-app-changes')
    expect(decision.pendingTotal).toBe(2)
    expect(decision.shippingTotal).toBe(0)
  })

  it('waits while the oldest app change is still soaking', () => {
    const decision = decideRelease({
      ...base,
      pending: [commit({ landedAt: daysAgo(3) })],
    })
    expect(decision.due).toBe(false)
    expect(decision.reason).toBe('soaking')
    expect(decision.oldest?.ageDays).toBeCloseTo(3, 5)
    expect(decision.detail).toContain('4.0d short')
  })

  it('releases once the oldest app change clears the window', () => {
    const decision = decideRelease({
      ...base,
      pending: [
        commit({ landedAt: daysAgo(2) }),
        commit({ landedAt: daysAgo(8) }),
      ],
      changes: [
        {
          subject: 'feat(nfts): sweep ticket',
          body: '',
          files: ['packages/plugins/a.ts'],
        },
      ],
    })
    expect(decision.due).toBe(true)
    expect(decision.reason).toBe('due')
    expect(decision.oldest?.ageDays).toBeCloseTo(8, 5)
    expect(decision.bump).toBe('minor')
    expect(decision.nextVersion).toBe('0.6.0')
    expect(decision.tag).toBe('v0.6.0')
  })

  it('starts the clock from the app change, not an older docs commit', () => {
    const decision = decideRelease({
      ...base,
      pending: [
        commit({ landedAt: daysAgo(40), files: ['docs/RELEASING.md'] }),
        commit({ landedAt: daysAgo(2) }),
      ],
    })
    expect(decision.reason).toBe('soaking')
    expect(decision.oldest?.ageDays).toBeCloseTo(2, 5)
  })

  it('ignores the previous release commit even when it is ancient', () => {
    const decision = decideRelease({
      ...base,
      pending: [
        commit({
          landedAt: daysAgo(60),
          subject: 'release: v0.5.0',
          files: ['apps/desktop/src-tauri/tauri.conf.json'],
        }),
        commit({ landedAt: daysAgo(1) }),
      ],
    })
    expect(decision.pendingTotal).toBe(1)
    expect(decision.reason).toBe('soaking')
  })

  it('ignores a feat that only touched the marketing site', () => {
    const decision = decideRelease({
      ...base,
      pending: [commit({ landedAt: daysAgo(9) })],
      changes: [
        {
          subject: 'feat(site): new hero',
          body: '',
          files: ['apps/marketing/hero.astro'],
        },
        {
          subject: 'fix(chart): axis label',
          body: '',
          files: ['apps/terminal/chart.tsx'],
        },
      ],
    })
    expect(decision.bump).toBe('patch')
    expect(decision.nextVersion).toBe('0.5.1')
  })

  it('honours an explicit bump override', () => {
    const decision = decideRelease({
      ...base,
      pending: [commit({ landedAt: daysAgo(9) })],
      bumpOverride: 'major',
    })
    expect(decision.bump).toBe('major')
    expect(decision.tag).toBe('v1.0.0')
  })

  it('treats a repo with no release tag as everything pending', () => {
    const decision = decideRelease({
      ...base,
      previousTag: null,
      pending: [commit({ landedAt: daysAgo(9) })],
    })
    expect(decision.due).toBe(true)
    expect(decision.previousTag).toBeNull()
  })
})

describe('bumpVersion', () => {
  it('bumps each level', () => {
    expect(bumpVersion('0.5.0', 'patch')).toBe('0.5.1')
    expect(bumpVersion('0.5.1', 'minor')).toBe('0.6.0')
    expect(bumpVersion('0.5.1', 'major')).toBe('1.0.0')
  })

  it('passes an explicit version through', () => {
    expect(bumpVersion('0.5.0', '1.2.3')).toBe('1.2.3')
  })

  it('refuses nonsense', () => {
    expect(() => bumpVersion('0.5.0', 'sideways')).toThrow()
    expect(() => bumpVersion('nightly', 'patch')).toThrow()
    expect(parseVersion('0.5')).toBeNull()
  })
})
