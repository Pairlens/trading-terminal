// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which build of Pairlens is actually running.
 *
 * Two sources, one answer:
 *   - desktop: the installed bundle's version, read from Tauri at runtime.
 *     This is the only honest number there — an installed app can be several
 *     releases behind the source tree it was built from.
 *   - browser / dev: a build-time constant injected by the terminal's vite
 *     config (`__APP_VERSION__`, read from apps/desktop/src-tauri/tauri.conf
 *     .json so the desktop bundle stays the single version of record).
 *
 * The Tauri read is async, so callers get the build constant synchronously and
 * the resolved value as soon as it lands. Outside vite (bun test) the constant
 * is undefined and this falls back to a dev placeholder.
 */

import { useEffect, useState } from 'react'
import { isStandalone } from '@/lib/platform'

/** Version baked in at build time. `0.0.0-dev` when built outside vite. */
export const BUILD_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'

/**
 * Identity of this exact build — distinct per `vite build`, unlike the release
 * number, which stands still between `bun run release` runs while deploys keep
 * replacing the bundle's content hashes. Empty when built outside vite.
 */
export const BUILD_ID: string =
  typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : ''

// Browser builds are already final; desktop resolves once, then caches.
let resolved: string | null = isStandalone ? null : BUILD_VERSION
let inflight: Promise<string> | null = null

/** Best answer available right now — never blocks. */
export function getAppVersionSync(): string {
  return resolved ?? BUILD_VERSION
}

/** The real running version; resolves the Tauri bundle version on desktop. */
export async function getAppVersion(): Promise<string> {
  if (resolved) return resolved
  inflight ??= import('@tauri-apps/api/app')
    .then((app) => app.getVersion())
    .catch(() => BUILD_VERSION)
    .then((version) => {
      resolved = version
      return version
    })
  return inflight
}

/** Render the running version; re-renders once the desktop value lands. */
export function useAppVersion(): string {
  const [version, setVersion] = useState(getAppVersionSync)

  useEffect(() => {
    let active = true
    void getAppVersion().then((next) => {
      if (active) setVersion(next)
    })
    return () => {
      active = false
    }
  }, [])

  return version
}
