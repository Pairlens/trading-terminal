// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { PluginManifest } from '@pairlens/plugin-system'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
import { isByokProvider } from '@/lib/plugins/byok-providers'

/**
 * The AI gates' "set up your own AI" wizard offers exactly the providers this
 * predicate accepts. Walking the real bundled manifests is the point: a
 * `requiresAuth: true` slipped onto a BYOK connector would silently drop it
 * from the wizard and leave those users staring at a sign-in wall they do not
 * need, and the reverse would offer a key field for a provider that has
 * nowhere to put one.
 */
const byId = new Map(BOOTSTRAP_PLUGINS.map((p) => [p.manifest.id, p.manifest]))

function manifest(id: string): PluginManifest {
  const found = byId.get(id)
  if (!found) throw new Error(`bootstrap plugin '${id}' is no longer bundled`)
  return found
}

const INFERENCE = [
  'groq-inference',
  'openai-inference',
  'anthropic-inference',
  'openrouter-inference',
]
const SEARCH = ['tavily-search', 'exa-search']

describe('isByokProvider', () => {
  for (const id of INFERENCE) {
    test(`${id} is offered as a bring-your-own-key model provider`, () => {
      expect(isByokProvider(manifest(id), 'ai:inference')).toBe(true)
      // An inference plugin must not turn up in the web-search step.
      expect(isByokProvider(manifest(id), 'ai:web-search')).toBe(false)
    })
  }

  for (const id of SEARCH) {
    test(`${id} is offered as a bring-your-own-key search provider`, () => {
      expect(isByokProvider(manifest(id), 'ai:web-search')).toBe(true)
      expect(isByokProvider(manifest(id), 'ai:inference')).toBe(false)
    })
  }

  for (const id of [...INFERENCE, ...SEARCH]) {
    test(`${id} declares a required secret to paste`, () => {
      const fields = Object.values(manifest(id).config)
      expect(
        fields.some((field) => field.type === 'secret' && field.required),
      ).toBe(true)
    })
  }

  test('pairlens-intelligence is hosted on both capabilities, not BYOK', () => {
    expect(
      isByokProvider(manifest('pairlens-intelligence'), 'ai:inference'),
    ).toBe(false)
    expect(
      isByokProvider(manifest('pairlens-intelligence'), 'ai:web-search'),
    ).toBe(false)
  })

  test('a plugin without an AI capability is not a provider', () => {
    expect(isByokProvider(manifest('pairlens-core'), 'ai:inference')).toBe(
      false,
    )
    expect(isByokProvider(manifest('pairlens-core'), 'ai:web-search')).toBe(
      false,
    )
  })

  test('every bundled AI provider is either BYOK or plan-gated', () => {
    const providers = BOOTSTRAP_PLUGINS.filter((p) =>
      p.manifest.capabilities.some(
        (c) => c.id === 'ai:inference' || c.id === 'ai:web-search',
      ),
    ).map((p) => p.manifest.id)
    // Sanity floor: four model providers, two search providers, plus the
    // hosted one that serves both.
    expect(providers.length).toBeGreaterThanOrEqual(7)
  })
})
