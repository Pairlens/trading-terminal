// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Runtime config injection for official (first-party) plugins.
 *
 * Some bundled plugins — notably `pairlens-intelligence` — talk to the Pairlens
 * App Server for instrument discovery, symbol logos, and AI inference. They learn
 * the backend URL + auth token only from the config the host passes at
 * activation; without it they fall back to the public production server, which
 * fails in local/dev/standalone setups (blank Discovery, broken logos).
 *
 * This `appServerUrl` / `authToken` / `discoverySearchAllowed` is *runtime*
 * config — it must never be persisted into the plugin ledger or the App Server
 * (it's environment-derived, not user state). Boot used to inject it inline;
 * every other activation path (UI toggles, config saves, the markets/connectors
 * view, server-state rehydrate, bundled reinstall) dropped some or all of it —
 * a reinstalled `pairlens-intelligence` came up without the deep-search consent
 * gate until the next reload. `buildActivationConfig` is now the single place
 * that assembles it, boot included, so every activation path is identical.
 */
import { appServerUrl, getSessionToken } from '@/lib/api'
import { deepSearchSetting } from '@/lib/instruments/deep-search-setting'

/** Plugins that receive the host App Server URL + auth token at activation. */
const OFFICIAL_BACKEND_PLUGIN_IDS = new Set<string>([
  'pairlens-intelligence',
  'pairlens-community',
])

/** Resolve the current session token (empty string when signed out). */
export async function fetchAuthToken(): Promise<string> {
  const token = await getSessionToken()
  return typeof token === 'string' ? token : ''
}

/**
 * Build the config to pass to `pluginManager.activatePlugin(id, config)`.
 *
 * For official backend-bound plugins this injects the host `appServerUrl`, a
 * live `authToken` resolver, and the deep-search consent gate. The persisted or
 * base config can still override `appServerUrl` (e.g. a user-pointed custom
 * backend); `authToken` and `discoverySearchAllowed` are re-applied after the
 * base spread, because a persisted config must never clobber the auth accessor
 * or the privacy gate. For all other plugins the base config is returned
 * unchanged.
 */
export function buildActivationConfig(
  pluginId: string,
  baseConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!OFFICIAL_BACKEND_PLUGIN_IDS.has(pluginId)) return baseConfig
  return {
    appServerUrl,
    ...baseConfig,
    authToken: fetchAuthToken,
    // A live getter, so a settings flip applies to the very next request
    // without re-activating the plugin.
    discoverySearchAllowed: () => deepSearchSetting.get(),
  }
}
