// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import { validateManifest } from './plugin-manifest-schema'
import type { PluginManifest } from './plugin-types'

/**
 * Pairlens plugin package format — the portable "folder = zip" unit.
 *
 * A plugin package is a zip containing:
 *   manifest.json   (required) — the PluginManifest
 *   module.js       (required) — single-file ESM exporting `manifest` +
 *                                `createPlugin` (+ optional `getContributedComponents`)
 *   styles.css      (optional) — plugin stylesheet, injected on load
 *
 * The same package is used everywhere: extracted to a folder on desktop, cached
 * in IndexedDB on web, served by the registry, and produced by the scaffold CLI.
 */

export const PLUGIN_PACKAGE_FILES = {
  manifest: 'manifest.json',
  module: 'module.js',
  styles: 'styles.css',
} as const

export type PluginPackageContents = {
  manifest: PluginManifest
  moduleText: string
  styleText?: string
}

/** Build a `.zip` plugin package from its contents. */
export function packPlugin(contents: {
  manifest: PluginManifest
  moduleText: string
  styleText?: string
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [PLUGIN_PACKAGE_FILES.manifest]: strToU8(
      JSON.stringify(contents.manifest, null, 2),
    ),
    [PLUGIN_PACKAGE_FILES.module]: strToU8(contents.moduleText),
  }
  if (contents.styleText) {
    files[PLUGIN_PACKAGE_FILES.styles] = strToU8(contents.styleText)
  }
  return zipSync(files, { level: 6 })
}

/**
 * Extract and validate a `.zip` plugin package. Throws with a descriptive
 * message if the package is malformed or the manifest fails validation.
 */
export function unpackPlugin(bytes: Uint8Array): PluginPackageContents {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (err) {
    throw new Error(
      `Invalid plugin package (not a valid zip): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const manifestRaw = entries[PLUGIN_PACKAGE_FILES.manifest]
  if (!manifestRaw) {
    throw new Error(
      `Plugin package is missing ${PLUGIN_PACKAGE_FILES.manifest}`,
    )
  }
  const moduleRaw = entries[PLUGIN_PACKAGE_FILES.module]
  if (!moduleRaw) {
    throw new Error(`Plugin package is missing ${PLUGIN_PACKAGE_FILES.module}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(manifestRaw))
  } catch (err) {
    throw new Error(
      `Plugin manifest.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const result = validateManifest(parsed)
  if (!result.valid) {
    throw new Error(
      `Invalid plugin manifest:\n  - ${result.errors.join('\n  - ')}`,
    )
  }

  const styleRaw = entries[PLUGIN_PACKAGE_FILES.styles]
  return {
    manifest: result.manifest,
    moduleText: strFromU8(moduleRaw),
    styleText: styleRaw ? strFromU8(styleRaw) : undefined,
  }
}

/** What the zip's central directory claims about one entry. */
export type ZipEntryInfo = {
  /** Path as stored in the archive — untrusted, may contain `..` or `/`. */
  name: string
  /** Stored (compressed) size in bytes. */
  compressedSize: number
  /** Declared uncompressed size in bytes. */
  originalSize: number
}

export type ReadZipOptions = {
  /**
   * Called for every central-directory entry *before* it is decompressed, so
   * callers can enforce a budget (entry count, total uncompressed size) or
   * skip noise. Return false to leave the entry out; throw to abort the whole
   * read — the error propagates unchanged.
   */
  accept?: (entry: ZipEntryInfo) => boolean
}

/**
 * Read a zip into `path → bytes`. Thin wrapper over fflate that exposes the
 * pre-decompression filter, which is the only place a zip bomb can be stopped
 * cheaply: sizes come from the central directory and fflate sizes its output
 * buffer to the declared length, so a rejected entry is never inflated.
 */
export function readZipEntries(
  bytes: Uint8Array,
  opts: ReadZipOptions = {},
): Record<string, Uint8Array> {
  const accept = opts.accept
  return unzipSync(
    bytes,
    accept
      ? {
          filter: (file) =>
            accept({
              name: file.name,
              compressedSize: file.size,
              originalSize: file.originalSize,
            }),
        }
      : undefined,
  )
}

/** True if the bytes look like a zip (PK\x03\x04 / PK\x05\x06 magic). */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  )
}
