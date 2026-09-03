// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

/**
 * Local store-shelf classification. The registry catalog already stamps
 * bundled AI providers as `ai`, but the Store also builds entries from
 * installed / offerable manifests when the registry is offline or stale.
 * Getting that inference wrong drops DeepSeek (and any other BYOK provider
 * the remote catalog has not caught up with) off the AI Providers shelf.
 */

import { BOOTSTRAP_PLUGINS } from '../bootstrap-bundle'
import { manifestToEntry } from '../plugin-entry'
import { isByokProvider } from '../byok-providers'

const byId = new Map(BOOTSTRAP_PLUGINS.map((p) => [p.manifest.id, p.manifest]))

function entry(id: string) {
  const manifest = byId.get(id)
  if (!manifest) throw new Error(`not a bundled plugin: ${id}`)
  return manifestToEntry(manifest)
}

describe('manifestToEntry store category', () => {
  test('DeepSeek sits on the same AI Providers shelf as OpenAI', () => {
    expect(entry('openai-inference').category).toBe('ai')
    expect(entry('deepseek-inference').category).toBe('ai')
  })

  test('every bundled BYOK provider is classified as ai', () => {
    const misplaced = BOOTSTRAP_PLUGINS.filter(
      (p) =>
        isByokProvider(p.manifest, 'ai:inference') ||
        isByokProvider(p.manifest, 'ai:web-search'),
    )
      .map((p) => p.manifest.id)
      .filter((id) => entry(id).category !== 'ai')

    expect(misplaced).toEqual([])
  })

  test('hosted Intelligence is not an AI Provider', () => {
    expect(entry('pairlens-intelligence').category).not.toBe('ai')
  })
})
