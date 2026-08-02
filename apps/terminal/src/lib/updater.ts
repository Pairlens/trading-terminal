// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Desktop auto-update — Spotify/Figma-style in-place updates.
 *
 * The Tauri updater plugin polls the release manifest (latest.json on the
 * public releases repo, see apps/desktop/src-tauri/tauri.conf.json), verifies
 * the minisign signature against the pinned pubkey, and swaps the installed
 * bundle. The frontend's job is the experience around it:
 *
 *   - the leader window checks shortly after launch and every few hours
 *     (multi-window sessions must not double-toast or race two installs)
 *   - an update surfaces as a persistent toast with a "Restart & update"
 *     action; installing shows download progress, then relaunches
 *   - `checkForUpdates({ manual: true })` backs the macOS menu entry and
 *     gives explicit "you're up to date" feedback
 *
 * Browser builds: every export is a no-op (`isStandalone` guard).
 */

import { toast } from 'sonner'

import type { Update } from '@tauri-apps/plugin-updater'
import i18n from '@/lib/i18n'
import { isStandalone } from '@/lib/platform'
import { onWindowLeader } from '@/lib/window-leader'

const FIRST_CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Single toast slot — periodic re-checks update it instead of stacking. */
const TOAST_ID = 'app-update'

const t = (key: string, fallback: string): string =>
  i18n.t(key, { defaultValue: fallback })

let initialized = false
let installing = false

/**
 * Start background update checks. Called once from the root shell on desktop;
 * safe to call anywhere (no-ops in browsers and on repeat calls).
 */
export function initUpdater(): void {
  if (!isStandalone || initialized) return
  initialized = true

  onWindowLeader((isLeader) => {
    if (!isLeader) return
    window.setTimeout(() => {
      void checkForUpdates()
    }, FIRST_CHECK_DELAY_MS)
    window.setInterval(() => {
      void checkForUpdates()
    }, CHECK_INTERVAL_MS)
  })
}

/**
 * Check the release manifest. With `manual: true` (menu action) the result is
 * always surfaced — including "up to date" and failures; background checks
 * only surface an actual update.
 */
export async function checkForUpdates(
  opts: { manual?: boolean } = {},
): Promise<void> {
  if (!isStandalone || installing) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (installing) return
    if (!update) {
      if (opts.manual) {
        toast.success(t('updater.upToDate', "You're on the latest version."), {
          id: TOAST_ID,
        })
      }
      return
    }
    promptInstall(update)
  } catch (err) {
    console.warn('[updater] check failed:', err)
    if (opts.manual) {
      toast.error(t('updater.checkFailed', 'Could not check for updates.'), {
        id: TOAST_ID,
        description: String(err),
      })
    }
  }
}

function promptInstall(update: Update): void {
  toast(t('updater.available', 'Update available'), {
    id: TOAST_ID,
    description: `${t('updater.availableDesc', 'Pairlens')} ${update.version}`,
    duration: Infinity,
    closeButton: true,
    action: {
      label: t('updater.installNow', 'Restart & update'),
      onClick: () => {
        void install(update)
      },
    },
  })
}

async function install(update: Update): Promise<void> {
  if (installing) return
  installing = true

  const showProgress = (percent: number | null) => {
    toast.loading(t('updater.downloading', 'Downloading update…'), {
      id: TOAST_ID,
      description: percent === null ? undefined : `${percent}%`,
      duration: Infinity,
    })
  }

  try {
    showProgress(null)
    let total: number | undefined
    let downloaded = 0
    let lastShown = -1
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength
          break
        case 'Progress': {
          downloaded += event.data.chunkLength
          if (!total) break
          const percent = Math.min(100, Math.round((downloaded / total) * 100))
          // Re-render the toast at most once per percent step.
          if (percent !== lastShown) {
            lastShown = percent
            showProgress(percent)
          }
          break
        }
        case 'Finished':
          toast.loading(t('updater.installing', 'Installing…'), {
            id: TOAST_ID,
            description: undefined,
            duration: Infinity,
          })
          break
      }
    })

    // On Windows the installer exits the app itself; on macOS/Linux the new
    // bundle is staged and takes effect on relaunch.
    toast.success(t('updater.restarting', 'Restarting…'), { id: TOAST_ID })
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch (err) {
    installing = false
    console.error('[updater] install failed:', err)
    toast.error(t('updater.installFailed', 'Update failed'), {
      id: TOAST_ID,
      description: String(err),
      duration: 10_000,
    })
  }
}
