// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Desktop network-egress grants (Tauri).
 *
 * The desktop webview enforces a CSP `connect-src` allowlist — an outer network
 * boundary applied to ALL webview code regardless of a plugin's trust level. A
 * plugin (a workspace store, a third-party connector, a data provider) declares
 * the hosts it needs in its signed `manifest.network.hosts`. Before those hosts
 * can be reached on desktop, the user must consent; the grant is persisted in
 * Rust (`<app-data>/network-grants.json`) and folded into the `connect-src` on
 * the next document load. See `src-tauri/src/csp.rs`.
 *
 * These wrappers are DESKTOP-ONLY: in the browser (dev/testing builds) there is
 * no such boundary — a sandboxed plugin is confined to its declared hosts by the
 * in-worker network-guard, and the page CSP governs the rest — so every function
 * here no-ops and grant computation returns "nothing to grant".
 */

import { isUrlAllowed } from './sandbox/network-guard'
import type { PluginManifest } from '@pairlens/plugin-system'
import { isStandalone } from '@/lib/platform'

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

/** True on desktop, where the CSP egress boundary is enforced and grants apply. */
export function isDesktopNetworkGoverned(): boolean {
  return getInvoke() !== null
}

/** The hosts a plugin declares it needs (signed manifest field). */
export function hostsFromManifest(manifest: PluginManifest): Array<string> {
  const hosts = manifest.network?.hosts
  if (!Array.isArray(hosts)) return []
  return hosts.filter((h): h is string => typeof h === 'string' && h.length > 0)
}

/**
 * Whether a declared host pattern is already permitted by the given allow
 * patterns (baseline + existing grants). A concrete host is covered by an exact
 * or wildcard match; a wildcard pattern (`*.x`) is covered only by an equal-or-
 * broader wildcard — probed via a synthetic subdomain so an exact-host grant
 * never masks a broader wildcard request.
 */
function isHostCovered(
  pattern: string,
  allowed: ReadonlyArray<string>,
): boolean {
  const probeHost = pattern.startsWith('*.')
    ? `wildcard-probe${pattern.slice(1)}`
    : pattern
  return isUrlAllowed(`https://${probeHost}`, allowed)
}

/**
 * The subset of `declared` host patterns not already covered by `allowed`
 * (baseline + existing grants). Pure — the testable core of
 * {@link computeUngrantedHosts}.
 */
export function ungrantedHosts(
  declared: ReadonlyArray<string>,
  allowed: ReadonlyArray<string>,
): Array<string> {
  return declared.filter((h) => !isHostCovered(h, allowed))
}

/**
 * The subset of `declared` hosts that are NOT already reachable (neither
 * baseline nor an existing grant). Empty on web and for an empty input.
 * Used for plugin manifests (via {@link computeUngrantedHosts}) and for the
 * custom-registry host in the settings UI.
 */
export async function computeUngrantedHostList(
  declared: Array<string>,
): Promise<Array<string>> {
  const invoke = getInvoke()
  if (!invoke || declared.length === 0) return []
  const [baseline, grants] = await Promise.all([
    invoke<Array<string>>('network_baseline_hosts').catch(() => []),
    invoke<Record<string, Array<string>>>('network_grants_get').catch(
      () => ({}),
    ),
  ])
  const allowed = [...baseline, ...Object.values(grants).flat()]
  return ungrantedHosts(declared, allowed)
}

/**
 * The subset of a plugin's declared hosts that are NOT already reachable
 * (neither baseline nor an existing grant). Empty on web, and empty when the
 * plugin declares no hosts or everything it needs is already permitted.
 */
export async function computeUngrantedHosts(
  manifest: PluginManifest,
): Promise<Array<string>> {
  return computeUngrantedHostList(hostsFromManifest(manifest))
}

/** Persist a plugin's granted hosts. No-op on web. Caller reloads to apply. */
export async function grantNetworkHosts(
  pluginId: string,
  hosts: Array<string>,
): Promise<void> {
  const invoke = getInvoke()
  if (!invoke) return
  await invoke('network_grant_set', { pluginId, hosts })
}

/** Revoke a plugin's network grant (on uninstall). Best-effort; no-op on web. */
export async function revokeNetworkGrant(pluginId: string): Promise<void> {
  const invoke = getInvoke()
  if (!invoke) return
  try {
    await invoke('network_grant_revoke', { pluginId })
  } catch {
    // Non-fatal: a stale grant is harmless (the plugin is gone) and is
    // overwritten if the id is ever reinstalled.
  }
}

/** Reload the current window so a freshly-persisted CSP grant takes effect. */
export function reloadForGrants(): void {
  window.location.reload()
}

export type NetworkConsentOutcome = 'granted' | 'denied' | 'not-needed'

/**
 * Full consent step for an install/enable flow: compute the newly-required
 * hosts, ask the user (only if there are any), and persist the grant on approval.
 * Returns 'not-needed' on web or when nothing new is required. The caller reloads
 * on 'granted' so the widened CSP applies.
 */
export async function requestAndApplyNetworkConsent(
  manifest: PluginManifest,
  requestConsent: (target: {
    name: string
    hosts: Array<string>
  }) => Promise<boolean>,
): Promise<NetworkConsentOutcome> {
  const newHosts = await computeUngrantedHosts(manifest)
  if (newHosts.length === 0) return 'not-needed'
  const granted = await requestConsent({ name: manifest.name, hosts: newHosts })
  if (!granted) return 'denied'
  // Persist the plugin's FULL declared set under its id (clean to revoke); Rust
  // unions all grants + baseline, so already-covered hosts dedupe harmlessly.
  await grantNetworkHosts(manifest.id, hostsFromManifest(manifest))
  return 'granted'
}
