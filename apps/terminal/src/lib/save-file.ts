// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isStandalone } from './platform'

// ---------------------------------------------------------------------------
// Saving generated files (indicator plugin zips, chart screenshots).
//
// On desktop `<a download>` does nothing: the webview is created without a
// download handler, so wry cancels the navigation and no file is ever written.
// Desktop therefore writes through the `save_to_downloads` Tauri command, which
// returns the absolute path — the UI shows it instead of leaving people hunting
// for the file. The browser build keeps the anchor download and has no path to
// report (the browser owns the destination).
// ---------------------------------------------------------------------------

export type SavedFile = {
  /** Absolute path on desktop; `null` in the browser (destination is the browser's). */
  path: string | null
}

/** True when a saved file can be revealed in the OS file manager. */
export const canRevealSavedFiles = isStandalone

function downloadViaAnchor(url: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
}

/** Save binary content to the user's Downloads folder. */
export async function saveToDownloads(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<SavedFile> {
  if (isStandalone) {
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string>('save_to_downloads', {
      fileName,
      bytes: Array.from(bytes),
    })
    return { path }
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    downloadViaAnchor(url, fileName)
  } finally {
    URL.revokeObjectURL(url)
  }
  return { path: null }
}

/** Save a `data:` URL (chart screenshots) to the user's Downloads folder. */
export async function saveDataUrlToDownloads(
  dataUrl: string,
  fileName: string,
): Promise<SavedFile> {
  if (!isStandalone) {
    downloadViaAnchor(dataUrl, fileName)
    return { path: null }
  }
  const blob = await (await fetch(dataUrl)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return saveToDownloads(bytes, fileName, blob.type)
}

/** Reveal a saved file in Finder / Explorer / the file manager. No-op in the browser. */
export async function revealSavedFile(path: string): Promise<void> {
  if (!isStandalone) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('reveal_in_file_manager', { path })
}

/**
 * Folder name to show in "saved to …" copy — the containing directory on
 * desktop, `null` in the browser (where the browser decides).
 */
export function savedFileFolder(path: string | null): string | null {
  if (!path) return null
  const separator = path.includes('\\') ? '\\' : '/'
  const index = path.lastIndexOf(separator)
  return index > 0 ? path.slice(0, index) : path
}
