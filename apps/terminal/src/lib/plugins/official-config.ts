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
 * This `appServerUrl` / `authToken` is *runtime* config — it must never be
 * persisted into the plugin ledger or the App Server (it's environment-derived,
 * not user state). Boot used to inject it inline; every other activation path
 * (UI toggles, config saves, the markets/connectors view, server-state rehydrate)
 * dropped it. `buildActivationConfig` is the single place that re-adds it, so all
 * activation paths behave identically.
 */
import { appServerUrl, getSessionToken } from '@/lib/api'

/** Plugins that receive the host App Server URL + auth token at activation. */
const OFFICIAL_BACKEND_PLUGIN_IDS = new Set<string>(['pairlens-intelligence'])

/** Resolve the current session token (empty string when signed out). */
export async function fetchAuthToken(): Promise<string> {
  const token = await getSessionToken()
  return typeof token === 'string' ? token : ''
}

/**
 * Build the config to pass to `pluginManager.activatePlugin(id, config)`.
 *
 * For official backend-bound plugins this injects the host `appServerUrl` and a
 * live `authToken` resolver. The persisted/base config can still override
 * `appServerUrl` (e.g. a user-pointed custom backend); `authToken` is always the
 * host resolver. For all other plugins the base config is returned unchanged.
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
  }
}
