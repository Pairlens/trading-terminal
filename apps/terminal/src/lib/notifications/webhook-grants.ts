// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Desktop egress grants for notification webhook endpoints.
 *
 * The webhook channel calls `fetch` from the main document, so on desktop it is
 * bound by the CSP `connect-src` allowlist in `src-tauri/src/csp.rs`. That
 * baseline lists exchanges and first-party hosts — never a user's own webhook —
 * and the only way to widen it was a signed plugin manifest. So every webhook
 * rule failed on the primary distribution, and it could not be reproduced in
 * dev: `tauri.conf.json` sets `csp: null` and the injection hook only runs for
 * asset-protocol responses, which the Vite dev server never serves.
 *
 * Unlike a plugin's declared hosts, a webhook URL is something the user typed
 * into their own rule, so there is no third party to vet and no second consent
 * prompt here — committing the rule IS the intent. What the user does get is a
 * clear statement that the host was permitted and that desktop applies the
 * widened policy on the next document load.
 */

import type { NotificationRuleDSL } from '@pairlens/notification-engine/types'
import {
  computeUngrantedHostList,
  grantNetworkHosts,
  isDesktopNetworkGoverned,
} from '@/lib/plugins/network-grants'

/**
 * Grant key for user webhook endpoints. The colon makes it unusable as a plugin
 * id (those are lowercase alphanumerics and dashes), so this can never collide
 * with — or be revoked by — a plugin grant.
 */
const WEBHOOK_GRANT_KEY = 'core:notification-webhooks'

/** Every distinct http(s) host reachable from a webhook step in these rules. */
export function collectWebhookHosts(
  rules: ReadonlyArray<NotificationRuleDSL>,
): Array<string> {
  const hosts = new Set<string>()
  for (const rule of rules) {
    if (rule.enabled === false) continue
    for (const step of rule.steps) {
      if (step.type !== 'webhook') continue
      const raw = step.data?.url
      if (typeof raw !== 'string' || raw.trim() === '') continue
      try {
        const url = new URL(raw)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          hosts.add(url.hostname)
        }
      } catch {
        // Malformed URL — the step validator already blocks the commit.
      }
    }
  }
  return [...hosts]
}

export type WebhookGrantOutcome =
  | { status: 'not-needed' }
  /** Hosts newly permitted; the widened CSP applies after a reload. */
  | { status: 'granted'; hosts: Array<string> }

/**
 * Persist egress grants covering every webhook host across all rules. No-op in
 * the browser, where the CSP boundary this works around does not exist.
 *
 * The full host set is written every time (the Rust side stores one list per
 * key), so removing a webhook from a rule narrows the grant on the next commit.
 */
export async function syncWebhookHostGrants(
  rules: ReadonlyArray<NotificationRuleDSL>,
): Promise<WebhookGrantOutcome> {
  if (!isDesktopNetworkGoverned()) return { status: 'not-needed' }

  const hosts = collectWebhookHosts(rules)
  if (hosts.length === 0) return { status: 'not-needed' }

  const missing = await computeUngrantedHostList(hosts)
  if (missing.length === 0) return { status: 'not-needed' }

  await grantNetworkHosts(WEBHOOK_GRANT_KEY, hosts)
  return { status: 'granted', hosts: missing }
}
