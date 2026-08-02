// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { crc32 } from '../checksum'

describe('crc32', () => {
  it('matches the canonical IEEE check vector', () => {
    // CRC32("123456789") = 0xCBF43926 = -873187034 as signed int32.
    expect(crc32('123456789')).toBe(-873187034)
  })

  it('returns 0 for the empty string', () => {
    expect(crc32('')).toBe(0)
  })

  it('is deterministic and order-sensitive', () => {
    expect(crc32('abc')).toBe(crc32('abc'))
    expect(crc32('abc')).not.toBe(crc32('acb'))
  })
})
