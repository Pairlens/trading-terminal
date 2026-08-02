// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Live GitHub star count for the header pills. Fetched from the GitHub API
// once per build (memoized module-level, so every page render shares one
// request) and baked into the static HTML. Falls back to the last known
// count when the API is unreachable or rate-limited, so a build never fails
// or hangs because of GitHub.

import { SITE } from './site'

/** Last known count, shown when the GitHub API can't be reached. */
const FALLBACK_STARS = '4.2k'

/** 823 -> "823", 4230 -> "4.2k", 12800 -> "13k". */
function formatStars(count: number): string {
  if (count < 1000) return String(count)
  const k = count / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

async function fetchStars(): Promise<string> {
  // "https://github.com/owner/repo" -> "owner/repo"
  const repoPath = new URL(SITE.repo).pathname.replace(/^\//, '')
  try {
    const token = process.env.GITHUB_TOKEN
    const res = await fetch(`https://api.github.com/repos/${repoPath}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as { stargazers_count?: unknown }
    if (typeof data.stargazers_count !== 'number') {
      throw new Error('no stargazers_count in response')
    }
    return formatStars(data.stargazers_count)
  } catch (err) {
    console.warn(
      `[github] star count for ${repoPath} unavailable, using "${FALLBACK_STARS}":`,
      err instanceof Error ? err.message : err,
    )
    return FALLBACK_STARS
  }
}

let stars: Promise<string> | undefined

/** Star count for SITE.repo, formatted for display (e.g. "4.2k"). */
export function getRepoStars(): Promise<string> {
  stars ??= fetchStars()
  return stars
}
