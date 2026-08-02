// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Local plugins directory access (desktop only).
 *
 * On the Tauri desktop app, plugins live under `<app-data>/plugins/<id>/` as
 * folders (manifest.json + module.js + optional styles.css) — the "Steam mods"
 * model: users can drop a folder in, Import a `.zip`, or have the registry write
 * one. On the web there is no filesystem; these functions no-op and the
 * IndexedDB cache is the backing store instead.
 *
 * Zip extraction + manifest validation happen in the frontend (see
 * `@pairlens/shared/plugin-package`); the Rust commands are scoped fs I/O only.
 */
import { isStandalone } from '@/lib/platform'

export type LocalPluginFiles = {
  id: string
  /** Raw manifest.json text. */
  manifest: string
  /** module.js source. */
  module_text: string
  /** Optional styles.css source. */
  style_text?: string | null
}

type TauriInvoke = <T>(
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<T>

function getInvoke(): TauriInvoke | null {
  if (!isStandalone) return null
  const internals = (window as unknown as Record<string, unknown>)
    .__TAURI_INTERNALS__
  const invoke = (internals as Record<string, unknown> | undefined)?.invoke
  return typeof invoke === 'function' ? (invoke as TauriInvoke) : null
}

/** True when running in the desktop app with the local plugins folder available. */
export function hasLocalPluginStore(): boolean {
  return getInvoke() !== null
}

/** List plugin folder ids present on disk. Empty on web. */
export async function listLocalPluginIds(): Promise<Array<string>> {
  const invoke = getInvoke()
  if (!invoke) return []
  try {
    return await invoke<Array<string>>('list_plugin_dirs')
  } catch {
    return []
  }
}

/** Read a plugin's files from disk. Null on web or if absent. */
export async function readLocalPlugin(
  id: string,
): Promise<LocalPluginFiles | null> {
  const invoke = getInvoke()
  if (!invoke) return null
  try {
    return await invoke<LocalPluginFiles | null>('read_plugin', { id })
  } catch {
    return null
  }
}

/** Write a plugin folder (Import / registry install on desktop). */
export async function writeLocalPlugin(args: {
  id: string
  manifest: string
  moduleText: string
  styleText?: string
}): Promise<void> {
  const invoke = getInvoke()
  if (!invoke) throw new Error('Local plugins are only available on desktop')
  await invoke('write_plugin', {
    id: args.id,
    manifest: args.manifest,
    moduleText: args.moduleText,
    styleText: args.styleText ?? null,
  })
}

/** Delete a plugin folder (uninstall). No-op on web. */
export async function deleteLocalPlugin(id: string): Promise<void> {
  const invoke = getInvoke()
  if (!invoke) return
  try {
    await invoke('delete_plugin', { id })
  } catch {
    // Best-effort
  }
}

/** Open the plugins directory in the OS file manager. No-op on web. */
export async function openLocalPluginsDir(): Promise<void> {
  const invoke = getInvoke()
  if (!invoke) return
  try {
    await invoke('open_plugins_dir')
  } catch {
    // Best-effort
  }
}
