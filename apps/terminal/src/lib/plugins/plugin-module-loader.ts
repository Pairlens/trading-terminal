// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { validateManifest } from '@pairlens/shared/plugin-manifest-schema'
import { looksLikeZip, unpackPlugin } from '@pairlens/shared/plugin-package'
import {
  sha256Hex,
  verifyPluginSignature,
} from '@pairlens/shared/plugin-signing'
import { publisherKeyTier } from '@pairlens/shared/publisher-keys'

import { getPinnedPublisherKeys } from './pinned-publisher-keys'
import { getPluginTrust } from './plugin-ledger'
import { loadPluginInSandbox } from './sandbox/sandboxed-plugin'
import { SANDBOX_IMPORT_ERROR_HINT } from './sandbox/protocol'
import type { PluginTrustLevel } from './plugin-ledger'
import type { PluginSignature } from '@pairlens/shared/plugin-signing'
import type {
  PluginInstallSource,
  RegistryPluginEntry,
} from '@pairlens/shared/registry-types'
import type { PluginFactory, PluginManifest } from '@pairlens/plugin-system'

/**
 * Thrown when a plugin cannot run sandboxed because it imports host UI modules
 * (react, @pairlens/plugin-sdk, …) that only resolve in the main realm. The
 * installer catches this to offer the user an explicit full-trust grant.
 */
export class PluginFullTrustRequiredError extends Error {
  constructor(
    public readonly pluginId: string,
    message?: string,
  ) {
    super(
      message ??
        `Plugin '${pluginId}' requires full trust to run (it uses host UI modules).`,
    )
    this.name = 'PluginFullTrustRequiredError'
  }
}

// ── Plugin Module ───────────────────────────────────────────────────

export type PluginModule = {
  manifest: PluginManifest
  factory: PluginFactory
  getContributedComponents?: () => Record<string, unknown>
}

// ── Version Info ────────────────────────────────────────────────────

export type VersionInfo = {
  pluginId: string
  currentVersion: string
  latestVersion: string
  moduleUrl: string
  moduleHash?: string
  styleUrl?: string
  styleHash?: string
  // Signature over the NEW version — required for the registry update path to
  // pass mandatory signature verification in fetchAndCache.
  signature?: string
  publisherKeyId?: string
}

// ── Cache Keys ──────────────────────────────────────────────────────

const CACHE_DB_NAME = 'pairlens-plugin-cache'
const CACHE_DB_VERSION = 2
const CACHE_STORE = 'modules'
const CACHE_META_STORE = 'meta'
const CACHE_STYLES_STORE = 'styles'

type CachedModuleMeta = {
  pluginId: string
  version: string
  source: PluginInstallSource
  cachedAt: number
  /**
   * Signature + content hash captured at first (verified) install. Re-checked
   * on every cached load so a tampered IndexedDB entry fails closed.
   */
  signature?: PluginSignature
  moduleHash?: string
}

/**
 * Clamp execution trust by the tier of the publisher key that verified the
 * module. Community-signed code can never run in the main realm — even if the
 * ledger (or a caller) says 'full', evaluation stays sandboxed.
 */
function clampTrustForKey(
  publisherKeyId: string,
  trust: PluginTrustLevel | undefined,
): PluginTrustLevel | undefined {
  return publisherKeyTier(publisherKeyId) === 'community' ? 'sandboxed' : trust
}

// ── Module Loader ───────────────────────────────────────────────────

export class PluginModuleLoader {
  private registryUrl: string
  private authTokenFn: (() => Promise<string>) | null = null
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(registryUrl: string) {
    this.registryUrl = registryUrl
  }

  setRegistryUrl(url: string): void {
    this.registryUrl = url
  }

  setAuthTokenProvider(fn: (() => Promise<string>) | null): void {
    this.authTokenFn = fn
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.authTokenFn) return {}
    const token = await this.authTokenFn()
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }

  // ── Fetch & Cache ───────────────────────────────────────────────

  async fetchAndCache(
    entry: RegistryPluginEntry,
    trust?: PluginTrustLevel,
  ): Promise<PluginModule> {
    if (!entry.moduleUrl) {
      throw new Error(
        `Plugin '${entry.manifest.id}' has no module URL in registry`,
      )
    }

    // Resolve moduleUrl against the registry base URL
    const moduleUrl = entry.moduleUrl.startsWith('http')
      ? entry.moduleUrl
      : `${this.registryUrl}${entry.moduleUrl}`

    const authHeaders = await this.getAuthHeaders()
    const response = await fetch(moduleUrl, { headers: authHeaders })
    if (response.status === 401) {
      throw new Error(
        'Authentication required to download plugins. Please sign in.',
      )
    }
    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugin module: ${response.status} ${response.statusText}`,
      )
    }

    const moduleText = await response.text()
    const moduleHash = await sha256Hex(moduleText)

    // Integrity: hash must match the registry entry when present.
    if (entry.moduleHash && moduleHash !== entry.moduleHash) {
      throw new Error(
        `Integrity check failed for plugin '${entry.manifest.id}': expected ${entry.moduleHash}, got ${moduleHash}`,
      )
    }

    // Fetch styles first so the signature can cover them.
    let styleText: string | null = null
    if (entry.styleUrl) {
      styleText = await this.fetchStyle(entry.styleUrl, entry.styleHash)
    }

    // Signature is MANDATORY for registry installs — a compromised registry
    // cannot mint a key the terminal pins, and the payload binds
    // id + version + content hashes (no URL swap / downgrade / hash re-point).
    const signature = await this.verifyRegistrySignature(entry, {
      moduleText,
      styleText,
    })

    // Cache the module text (non-fatal — plugin still works for this session if cache fails)
    try {
      const db = await this.getDb()
      const tx = db.transaction([CACHE_STORE, CACHE_META_STORE], 'readwrite')
      tx.objectStore(CACHE_STORE).put(moduleText, entry.manifest.id)
      tx.objectStore(CACHE_META_STORE).put(
        {
          pluginId: entry.manifest.id,
          version: entry.manifest.version,
          source: {
            type: 'registry',
            registryUrl: this.registryUrl,
            pluginId: entry.manifest.id,
            version: entry.manifest.version,
          },
          cachedAt: Date.now(),
          signature,
          moduleHash,
        } satisfies CachedModuleMeta,
        entry.manifest.id,
      )
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // Cache write failed (e.g. QuotaExceededError) — plugin still functions for this session
      console.warn(
        `[plugins] Failed to cache module for '${entry.manifest.id}' — plugin will not persist after reload`,
      )
    }

    if (styleText) {
      await this.cacheStyle(entry.manifest.id, styleText)
      this.injectStyle(entry.manifest.id, styleText)
    }

    return await this.evaluateModule(moduleText, {
      pluginId: entry.manifest.id,
      expected: {
        id: entry.manifest.id,
        version: entry.manifest.version,
      },
      // Community-signed modules are permanently sandbox-only: clamp whatever
      // the caller (or a tampered ledger) asked for. The tier comes from the
      // key that actually VERIFIED the bytes, not registry display metadata.
      trust: clampTrustForKey(signature.publisherKeyId, trust),
    })
  }

  /**
   * Verify the detached Ed25519 signature on a registry entry against the
   * pinned publisher keys. Throws if the signature is missing or invalid.
   */
  private async verifyRegistrySignature(
    entry: RegistryPluginEntry,
    content: { moduleText: string; styleText: string | null },
  ): Promise<PluginSignature> {
    if (!entry.signature || !entry.publisherKeyId) {
      throw new Error(
        `Plugin '${entry.manifest.id}' is not signed — refusing to install. ` +
          `Registry plugins must carry a publisher signature.`,
      )
    }
    const keys = getPinnedPublisherKeys()
    const publicKey = keys[entry.publisherKeyId]
    if (!publicKey) {
      throw new Error(
        `Plugin '${entry.manifest.id}' is signed by unknown publisher key ` +
          `'${entry.publisherKeyId}' — refusing to install.`,
      )
    }
    const ok = await verifyPluginSignature(
      {
        pluginId: entry.manifest.id,
        version: entry.manifest.version,
        moduleText: content.moduleText,
        styleText: content.styleText,
      },
      entry.signature,
      publicKey,
    )
    if (!ok) {
      throw new Error(
        `Signature verification failed for plugin '${entry.manifest.id}' — refusing to install.`,
      )
    }
    return { signature: entry.signature, publisherKeyId: entry.publisherKeyId }
  }

  // ── Fetch from Arbitrary URL ────────────────────────────────────

  /**
   * Fetch a plugin from an arbitrary URL (manual install). Accepts either a
   * single-file ESM `.js` module or a `.zip` plugin package — detected by the
   * zip magic bytes. Caches with a `manual` source.
   */
  async fetchFromUrl(
    url: string,
    trust?: PluginTrustLevel,
  ): Promise<PluginModule> {
    const authHeaders = await this.getAuthHeaders()
    const response = await fetch(url, { headers: authHeaders })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugin: ${response.status} ${response.statusText}`,
      )
    }

    const buffer = new Uint8Array(await response.arrayBuffer())
    if (looksLikeZip(buffer)) {
      return this.loadPackageBytes(buffer, { type: 'manual', url }, trust)
    }

    const moduleText = new TextDecoder().decode(buffer)
    const pluginModule = await this.evaluateModule(moduleText, { trust })

    // Cache the module text so it persists across reloads
    const db = await this.getDb()
    const tx = db.transaction([CACHE_STORE, CACHE_META_STORE], 'readwrite')
    tx.objectStore(CACHE_STORE).put(moduleText, pluginModule.manifest.id)
    tx.objectStore(CACHE_META_STORE).put(
      {
        pluginId: pluginModule.manifest.id,
        version: pluginModule.manifest.version,
        source: { type: 'manual', url } satisfies PluginInstallSource,
        cachedAt: Date.now(),
      } satisfies CachedModuleMeta,
      pluginModule.manifest.id,
    )
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    return pluginModule
  }

  // ── Install from a .zip package ─────────────────────────────────

  /**
   * Install a plugin from raw `.zip` package bytes (manifest.json + module.js
   * + optional styles.css). Validates the manifest, evaluates the module,
   * caches module + styles + meta (web fallback), and injects styles.
   * Used by local-folder scans and file/drag-drop imports.
   */
  async loadPackageBytes(
    bytes: Uint8Array,
    source: PluginInstallSource,
    trust?: PluginTrustLevel,
  ): Promise<PluginModule> {
    const pkg = unpackPlugin(bytes) // validates the manifest; throws on error
    const pluginModule = await this.evaluateModule(pkg.moduleText, {
      pluginId: pkg.manifest.id,
      expected: { id: pkg.manifest.id, version: pkg.manifest.version },
      trust,
    })
    const pluginId = pluginModule.manifest.id

    try {
      const db = await this.getDb()
      const tx = db.transaction(
        [CACHE_STORE, CACHE_META_STORE, CACHE_STYLES_STORE],
        'readwrite',
      )
      tx.objectStore(CACHE_STORE).put(pkg.moduleText, pluginId)
      tx.objectStore(CACHE_META_STORE).put(
        {
          pluginId,
          version: pluginModule.manifest.version,
          source,
          cachedAt: Date.now(),
        } satisfies CachedModuleMeta,
        pluginId,
      )
      if (pkg.styleText) {
        tx.objectStore(CACHE_STYLES_STORE).put(pkg.styleText, pluginId)
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // Cache write failed (e.g. quota) — plugin still works this session
    }

    if (pkg.styleText) this.injectStyle(pluginId, pkg.styleText)
    return pluginModule
  }

  /**
   * Evaluate a plugin from already-extracted module + style text (e.g. read
   * from a local plugins folder on desktop, where the folder — not IndexedDB —
   * is the source of truth, so no caching is needed).
   */
  async loadModuleWithStyle(
    moduleText: string,
    styleText?: string | null,
    pluginId?: string,
    trust?: PluginTrustLevel,
  ): Promise<PluginModule> {
    const mod = await this.evaluateModule(moduleText, { pluginId, trust })
    if (styleText) this.injectStyle(mod.manifest.id, styleText)
    return mod
  }

  // ── Load from Cache ─────────────────────────────────────────────

  async loadCached(
    pluginId: string,
    trust?: PluginTrustLevel,
  ): Promise<PluginModule | null> {
    try {
      const db = await this.getDb()
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const request = tx.objectStore(CACHE_STORE).get(pluginId)

      const moduleText = await new Promise<string | undefined>(
        (resolve, reject) => {
          request.onsuccess = () =>
            resolve(request.result as string | undefined)
          request.onerror = () => reject(request.error)
        },
      )

      if (!moduleText) return null

      // Re-verify signatures for registry plugins on every load so a tampered
      // IndexedDB cache fails closed (privilege-escalation defense).
      const meta = await this.getCachedMeta(pluginId)
      const styleText = await this.readCachedStyle(pluginId)
      if (meta?.source.type === 'registry') {
        const ok = await this.verifyCachedSignature(
          pluginId,
          meta,
          moduleText,
          styleText,
        )
        if (!ok) {
          console.warn(
            `[plugins] Cached module for '${pluginId}' failed signature re-verification — evicting`,
          )
          await this.evict(pluginId)
          return null
        }
      }

      const mod = await this.evaluateModule(moduleText, {
        pluginId,
        expected: meta
          ? { id: meta.pluginId, version: meta.version }
          : undefined,
        // Same community clamp as fetchAndCache — the cached signature was
        // re-verified above, so its key id is authoritative for this load.
        trust: meta?.signature
          ? clampTrustForKey(meta.signature.publisherKeyId, trust)
          : trust,
      })
      if (styleText) this.injectStyle(pluginId, styleText)
      return mod
    } catch (err) {
      // Surface "needs full trust" so callers (boot, installer) can offer a
      // grant; all other failures are non-fatal (return null → skip).
      if (err instanceof PluginFullTrustRequiredError) throw err
      return null
    }
  }

  /**
   * Re-verify a cached registry module against its stored signature + hash and
   * the currently-pinned publisher keys. Fails closed if metadata is missing.
   */
  private async verifyCachedSignature(
    pluginId: string,
    meta: CachedModuleMeta,
    moduleText: string,
    styleText: string | null,
  ): Promise<boolean> {
    if (!meta.signature || !meta.moduleHash) return false
    if ((await sha256Hex(moduleText)) !== meta.moduleHash) return false
    const publicKey = getPinnedPublisherKeys()[meta.signature.publisherKeyId]
    if (!publicKey) return false
    return verifyPluginSignature(
      { pluginId, version: meta.version, moduleText, styleText },
      meta.signature.signature,
      publicKey,
    )
  }

  // ── Check for Updates ───────────────────────────────────────────

  async checkForUpdate(
    pluginId: string,
    currentVersion: string,
  ): Promise<VersionInfo | null> {
    try {
      const response = await fetch(
        `${this.registryUrl}/api/plugins/${encodeURIComponent(pluginId)}`,
      )
      if (!response.ok) return null

      const data = (await response.json()) as { plugin: RegistryPluginEntry }
      const entry = data.plugin

      const latestVersion = entry.latestVersion ?? entry.manifest.version
      if (latestVersion === currentVersion) return null
      if (!entry.moduleUrl) return null

      return {
        pluginId,
        currentVersion,
        latestVersion,
        moduleUrl: entry.moduleUrl,
        moduleHash: entry.moduleHash,
        styleUrl: entry.styleUrl,
        styleHash: entry.styleHash,
        signature: entry.signature,
        publisherKeyId: entry.publisherKeyId,
      }
    } catch {
      return null
    }
  }

  // ── Evict Cache ─────────────────────────────────────────────────

  async evict(pluginId: string): Promise<void> {
    try {
      const db = await this.getDb()
      const tx = db.transaction(
        [CACHE_STORE, CACHE_META_STORE, CACHE_STYLES_STORE],
        'readwrite',
      )
      tx.objectStore(CACHE_STORE).delete(pluginId)
      tx.objectStore(CACHE_META_STORE).delete(pluginId)
      tx.objectStore(CACHE_STYLES_STORE).delete(pluginId)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // Cache eviction failure is non-fatal
    }

    // Remove injected stylesheet
    this.removeStyle(pluginId)
  }

  // ── Get Install Metadata ────────────────────────────────────────

  async getCachedMeta(pluginId: string): Promise<CachedModuleMeta | null> {
    try {
      const db = await this.getDb()
      const tx = db.transaction(CACHE_META_STORE, 'readonly')
      const request = tx.objectStore(CACHE_META_STORE).get(pluginId)

      return await new Promise<CachedModuleMeta | null>((resolve, reject) => {
        request.onsuccess = () =>
          resolve((request.result as CachedModuleMeta) ?? null)
        request.onerror = () => reject(request.error)
      })
    } catch {
      return null
    }
  }

  // ── Private Helpers ─────────────────────────────────────────────

  /**
   * Evaluate a plugin module. Chooses the execution realm by trust:
   *
   * - **sandboxed** (default for every non-bootstrap plugin): the module runs
   *   in a dedicated Web Worker behind the capability bridge with an enforced
   *   network allowlist. It cannot reach the DOM, credential store, or Tauri
   *   keychain.
   * - **full** (explicit user grant): the module runs in the main realm
   *   (required for React UI contributions).
   *
   * Trust is resolved from the local ledger and fails closed to sandboxed —
   * an unknown/ungranted plugin is always sandboxed. Bootstrap plugins never
   * reach this method (they are installed from compiled factories).
   */
  async evaluateModule(
    moduleText: string,
    opts?: {
      pluginId?: string
      expected?: { id: string; version: string }
      /** Explicit trust override; when omitted, resolved from the ledger. */
      trust?: PluginTrustLevel
    },
  ): Promise<PluginModule> {
    const trust =
      opts?.trust ??
      (opts?.pluginId ? getPluginTrust(opts.pluginId) : 'sandboxed')
    if (trust === 'sandboxed') {
      try {
        const sandboxed = await loadPluginInSandbox(moduleText, opts?.expected)
        return { manifest: sandboxed.manifest, factory: sandboxed.factory }
      } catch (err) {
        // A bare-import failure means the plugin needs the main realm — surface
        // a typed error so the installer can offer an explicit full-trust grant.
        if (
          err instanceof Error &&
          err.message.includes(SANDBOX_IMPORT_ERROR_HINT)
        ) {
          throw new PluginFullTrustRequiredError(
            opts?.pluginId ?? opts?.expected?.id ?? 'plugin',
            err.message,
          )
        }
        throw err
      }
    }
    return this.evaluateInMainRealm(moduleText, opts?.expected)
  }

  /**
   * Evaluate a plugin module in the MAIN realm via blob URL + dynamic import().
   * Only reached for bootstrap plugins (indirectly) and user-granted
   * full-trust plugins.
   *
   * **Constraint:** Plugin bundles must be single-file ESM with no dynamic
   * sub-imports (`import('./chunk.js')`). The blob URL is revoked after the
   * primary import resolves, so any deferred chunk imports would fail.
   * Plugin build configs should use `output.inlineDynamicImports: true`.
   */
  private async evaluateInMainRealm(
    moduleText: string,
    expected?: { id: string; version: string },
  ): Promise<PluginModule> {
    const blob = new Blob([moduleText], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    try {
      // Dynamic import — bare specifiers (react, @pairlens/plugin-sdk) are
      // resolved by the import map injected in __root.tsx <head>.
      const mod = await import(/* @vite-ignore */ blobUrl)

      if (!mod.manifest || typeof mod.createPlugin !== 'function') {
        throw new Error(
          'Plugin module must export `manifest` and `createPlugin`',
        )
      }

      // Validate the manifest of externally-loaded plugins before trusting it.
      const result = validateManifest(mod.manifest)
      if (!result.valid) {
        throw new Error(
          `Invalid plugin manifest:\n  - ${result.errors.join('\n  - ')}`,
        )
      }

      if (expected) {
        if (result.manifest.id !== expected.id) {
          throw new Error(
            `Plugin module declares id "${result.manifest.id}" but "${expected.id}" was expected`,
          )
        }
        if (result.manifest.version !== expected.version) {
          throw new Error(
            `Plugin module declares version "${result.manifest.version}" but "${expected.version}" was expected`,
          )
        }
      }

      return {
        manifest: result.manifest,
        factory: mod.createPlugin,
        getContributedComponents: mod.getContributedComponents,
      }
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  /**
   * Fetch a plugin stylesheet and verify its integrity hash. Returns the CSS
   * text (so the caller can bind it into the signature) or null if the fetch
   * failed. Does NOT persist or inject — the caller decides after the
   * signature check passes.
   */
  private async fetchStyle(
    styleUrl: string,
    expectedHash?: string,
  ): Promise<string | null> {
    const resolvedUrl = styleUrl.startsWith('http')
      ? styleUrl
      : `${this.registryUrl}${styleUrl}`
    const authHeaders = await this.getAuthHeaders()
    const response = await fetch(resolvedUrl, { headers: authHeaders })
    if (!response.ok) return null

    const cssText = await response.text()

    if (expectedHash) {
      const hash = await sha256Hex(cssText)
      if (hash !== expectedHash) {
        throw new Error(
          `CSS integrity check failed: expected ${expectedHash}, got ${hash}`,
        )
      }
    }

    // Persist CSS to IndexedDB cache (non-fatal on failure)
    return cssText
  }

  private async cacheStyle(pluginId: string, cssText: string): Promise<void> {
    try {
      const db = await this.getDb()
      const tx = db.transaction(CACHE_STYLES_STORE, 'readwrite')
      tx.objectStore(CACHE_STYLES_STORE).put(cssText, pluginId)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // Non-fatal: style will still be injected, just not persisted
    }
  }

  /** Read a plugin's cached stylesheet text (no injection). */
  private async readCachedStyle(pluginId: string): Promise<string | null> {
    try {
      const db = await this.getDb()
      const tx = db.transaction(CACHE_STYLES_STORE, 'readonly')
      const request = tx.objectStore(CACHE_STYLES_STORE).get(pluginId)

      return await new Promise<string | null>((resolve, reject) => {
        request.onsuccess = () =>
          resolve((request.result as string | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    } catch {
      return null
    }
  }

  private injectStyle(pluginId: string, cssText: string): void {
    this.removeStyle(pluginId)
    const style = document.createElement('style')
    style.dataset.pluginId = pluginId
    style.textContent = cssText
    document.head.appendChild(style)
  }

  private removeStyle(pluginId: string): void {
    const existing = document.querySelector(
      `style[data-plugin-id="${CSS.escape(pluginId)}"]`,
    )
    existing?.remove()
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(CACHE_STORE)) {
            db.createObjectStore(CACHE_STORE)
          }
          if (!db.objectStoreNames.contains(CACHE_META_STORE)) {
            db.createObjectStore(CACHE_META_STORE)
          }
          if (!db.objectStoreNames.contains(CACHE_STYLES_STORE)) {
            db.createObjectStore(CACHE_STYLES_STORE)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          this.dbPromise = null // allow retry on next call
          reject(request.error)
        }
      })
    }
    return this.dbPromise
  }
}
