// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which AI providers a user can turn on with a key of their own.
 *
 * The test is the manifest, not a list of ids: a capability declared with
 * `requiresAuth` runs through a Pairlens account and its Intelligence plan
 * (that is what makes the AI gates say "sign in"), and one declared without
 * it is bring-your-own-key. Keeping it a predicate means a third-party
 * inference or search plugin installed from the store is offered alongside
 * the bundled ones with no code change — and it is the single place the rule
 * is written down, so the setup wizard and its test cannot disagree.
 *
 * Both AI capabilities go through here. `ai:inference` is what the gates
 * resolve — no model, no copilot. `ai:web-search` only grounds the answer in
 * live sources; research and the copilot's `web_search` tool degrade to
 * market data without it, which is why the wizard treats it as optional.
 */
import type { CapabilityId, PluginManifest } from '@pairlens/plugin-system'

export const BYOK_AI_CAPABILITIES = [
  'ai:inference',
  'ai:web-search',
] as const satisfies ReadonlyArray<CapabilityId>

export type ByokCapability = (typeof BYOK_AI_CAPABILITIES)[number]

export function isByokProvider(
  manifest: PluginManifest,
  capability: ByokCapability,
): boolean {
  const declaration = manifest.capabilities.find((c) => c.id === capability)
  return declaration != null && !declaration.requiresAuth
}
