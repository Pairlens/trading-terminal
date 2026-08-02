// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  GeoRestrictedError,
  assertResponseOk,
  isGeoRestrictedError,
} from '../errors'

const capture = (fn: () => void): unknown => {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

describe('assertResponseOk', () => {
  it('does not throw on a 2xx response', () => {
    expect(() =>
      assertResponseOk({ ok: true, status: 200 }, 'OKX', 'US'),
    ).not.toThrow()
  })

  it('throws GeoRestrictedError on 451 unconditionally', () => {
    const thrown = capture(() =>
      assertResponseOk({ ok: false, status: 451 }, 'Binance', 'US'),
    )
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as GeoRestrictedError).status).toBe(451)
    expect((thrown as GeoRestrictedError).exchange).toBe('Binance')
    expect((thrown as GeoRestrictedError).region).toBe('US')
  })

  it('throws a generic Error on 403 without body evidence', () => {
    const thrown = capture(() =>
      assertResponseOk({ ok: false, status: 403 }, 'Coinbase', 'US'),
    )
    expect(thrown).toBeInstanceOf(Error)
    expect(isGeoRestrictedError(thrown)).toBe(false)
    expect((thrown as Error).message).toContain('Coinbase REST error: 403')
  })

  it('throws a generic Error on 403 with an unrelated body (revoked key)', () => {
    const thrown = capture(() =>
      assertResponseOk(
        { ok: false, status: 403 },
        'Coinbase',
        'US',
        '{"message":"Invalid API key"}',
      ),
    )
    expect(isGeoRestrictedError(thrown)).toBe(false)
  })

  it('throws GeoRestrictedError on 403 with a geo-block marker in the body', () => {
    const thrown = capture(() =>
      assertResponseOk(
        { ok: false, status: 403 },
        'Binance',
        'US',
        '{"msg":"Service unavailable from a restricted location"}',
      ),
    )
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as GeoRestrictedError).status).toBe(403)
  })

  it('matches geo-block markers case-insensitively', () => {
    const thrown = capture(() =>
      assertResponseOk(
        { ok: false, status: 403 },
        'ByBit',
        'US',
        'Not available in your REGION',
      ),
    )
    expect(isGeoRestrictedError(thrown)).toBe(true)
  })

  it('throws a plain Error on other statuses regardless of body', () => {
    const thrown = capture(() =>
      assertResponseOk(
        { ok: false, status: 500 },
        'OKX',
        'US',
        'restricted region',
      ),
    )
    expect(isGeoRestrictedError(thrown)).toBe(false)
    expect((thrown as Error).message).toContain('OKX REST error: 500')
  })
})

describe('isGeoRestrictedError', () => {
  it('matches real instances', () => {
    expect(isGeoRestrictedError(new GeoRestrictedError('OKX', 'US'))).toBe(true)
  })

  it('matches cross-bundle instances by name', () => {
    const fake = new Error('x')
    fake.name = 'GeoRestrictedError'
    expect(isGeoRestrictedError(fake)).toBe(true)
  })

  it('matches cross-bundle instances by sentinel when the name is mangled', () => {
    const fake = new Error('x') as Error & { __geoRestricted?: boolean }
    fake.__geoRestricted = true
    expect(isGeoRestrictedError(fake)).toBe(true)
  })

  it('rejects arbitrary errors carrying an exchange property', () => {
    const fake = new Error('rate limited') as Error & { exchange?: string }
    fake.exchange = 'Binance'
    expect(isGeoRestrictedError(fake)).toBe(false)
  })

  it('rejects ordinary errors and non-errors', () => {
    expect(isGeoRestrictedError(new Error('boom'))).toBe(false)
    expect(isGeoRestrictedError(null)).toBe(false)
    expect(isGeoRestrictedError(undefined)).toBe(false)
  })
})
