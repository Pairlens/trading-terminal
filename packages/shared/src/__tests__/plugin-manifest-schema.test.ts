// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { validateManifest } from '../plugin-manifest-schema'

const VALID = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '0.1.0',
  author: 'Me',
  description: 'Does things',
  capabilities: [
    {
      id: 'market-data:candles',
      singleton: false,
      markets: ['okx'],
      priority: 10,
      streaming: true,
    },
  ],
  config: {},
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    const r = validateManifest(VALID)
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.manifest.id).toBe('my-plugin')
  })

  it('accepts an empty capabilities array + empty config', () => {
    const r = validateManifest({ ...VALID, capabilities: [] })
    expect(r.valid).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateManifest('nope').valid).toBe(false)
    expect(validateManifest(null).valid).toBe(false)
  })

  it('rejects missing required fields', () => {
    const r = validateManifest({ name: 'x' })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"id"'))).toBe(true)
  })

  it('rejects a bad id format', () => {
    const r = validateManifest({ ...VALID, id: 'Bad ID!' })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"id"'))).toBe(true)
  })

  it('rejects an unknown capability id', () => {
    const r = validateManifest({
      ...VALID,
      capabilities: [
        {
          id: 'made-up:thing',
          singleton: false,
          markets: [],
          priority: 1,
          streaming: false,
        },
      ],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('not a known capability'))).toBe(
      true,
    )
  })

  it('rejects capability with wrong field types', () => {
    const r = validateManifest({
      ...VALID,
      capabilities: [
        {
          id: 'ai:inference',
          singleton: 'yes',
          markets: 'okx',
          priority: 'high',
          streaming: 1,
        },
      ],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects a malformed config field', () => {
    const r = validateManifest({
      ...VALID,
      config: { apiKey: { type: 'wizard', label: 'Key' } },
    })
    expect(r.valid).toBe(false)
  })

  it('requires config (suggests {})', () => {
    const { config: _drop, ...noConfig } = VALID
    const r = validateManifest(noConfig)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"config"'))).toBe(true)
  })

  // ── network allowlist + permissions (sandbox enforcement) ──────────

  it('accepts a valid network.hosts allowlist', () => {
    const r = validateManifest({
      ...VALID,
      network: { hosts: ['api.okx.com', '*.okx.com', 'ws-auth.kraken.com'] },
    })
    expect(r.valid).toBe(true)
  })

  it('rejects network hosts with scheme, port, or path', () => {
    for (const host of [
      'https://api.okx.com',
      'api.okx.com:443',
      'api.okx.com/v5',
      '*.*.okx.com',
      'evil com',
    ]) {
      const r = validateManifest({ ...VALID, network: { hosts: [host] } })
      expect(r.valid).toBe(false)
    }
  })

  it('rejects a network declaration that is not { hosts: [] }', () => {
    expect(
      validateManifest({ ...VALID, network: { hosts: 'okx' } }).valid,
    ).toBe(false)
    expect(validateManifest({ ...VALID, network: [] }).valid).toBe(false)
  })

  it('accepts known permissions and rejects unknown ones', () => {
    expect(
      validateManifest({ ...VALID, permissions: ['network', 'credentials'] })
        .valid,
    ).toBe(true)
    expect(
      validateManifest({ ...VALID, permissions: ['network', 'root'] }).valid,
    ).toBe(false)
  })
})
