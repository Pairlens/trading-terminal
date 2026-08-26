// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Semver math shared by the release scripts.
 *
 * `scripts/release.ts` uses it to bump the four files that carry the desktop
 * version; `scripts/release/due.ts` uses it to work out what the next tag
 * would be if the daily check decides a release is overdue.
 */

export type BumpKind = 'major' | 'minor' | 'patch'

export type Version = [number, number, number]

const EXPLICIT = /^\d+\.\d+\.\d+$/

export function parseVersion(version: string): Version | null {
  if (!EXPLICIT.test(version)) return null
  const parts = version.split('.').map(Number) as Version
  return parts.some(Number.isNaN) ? null : parts
}

export function isBumpKind(value: string): value is BumpKind {
  return value === 'major' || value === 'minor' || value === 'patch'
}

/**
 * Apply a bump kind — or an explicit `x.y.z` — to the current version.
 * Throws rather than exiting, so callers own how the failure is reported.
 */
export function bumpVersion(current: string, kind: string): string {
  if (!isBumpKind(kind)) {
    if (!EXPLICIT.test(kind)) {
      throw new Error(`Not a bump kind or x.y.z version: ${kind}`)
    }
    return kind
  }
  const parsed = parseVersion(current)
  if (!parsed) throw new Error(`Cannot parse current version: ${current}`)
  const [major, minor, patch] = parsed
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
