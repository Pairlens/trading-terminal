// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One entry point for every "Check for updates" affordance (omni search
 * action, settings footer button). Dispatches to the updater that owns this
 * build's surface — the Tauri updater on desktop, the version.json check in
 * browsers — via dynamic import, so surfaces that merely offer the button
 * don't pull either updater into their chunk.
 */
import { isStandalone } from '@/lib/platform'

export async function manualUpdateCheck(): Promise<void> {
  if (isStandalone) {
    const { checkForUpdates } = await import('@/lib/updater')
    await checkForUpdates({ manual: true })
  } else {
    const { checkForWebUpdates } = await import('@/lib/web-updater')
    await checkForWebUpdates()
  }
}
