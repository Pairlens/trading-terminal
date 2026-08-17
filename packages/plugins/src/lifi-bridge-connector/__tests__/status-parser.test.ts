// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The status parser, against a recorded completed transfer and the same
 * transfer mid-flight.
 *
 * The case worth the test is the third one: a hash the aggregator has not
 * indexed yet. It answers 404, and if that resolved to `failed` the pane would
 * declare a live transfer dead about one second after it was sent.
 */
import { describe, expect, it } from 'bun:test'

import { mapLifiStatus, parseLifiStatus } from '../status-client'
import statusDone from './fixtures/status-done.json'
import statusPending from './fixtures/status-pending.json'

describe('mapLifiStatus', () => {
  it('resolves only on DONE, fails only on FAILED/INVALID', () => {
    expect(mapLifiStatus('DONE')).toBe('confirmed')
    expect(mapLifiStatus('FAILED')).toBe('failed')
    expect(mapLifiStatus('INVALID')).toBe('failed')
  })

  it('treats anything it does not recognise as still pending', () => {
    // A later API version inventing a status must not resolve a transfer.
    expect(mapLifiStatus('PENDING')).toBe('pending')
    expect(mapLifiStatus('NOT_FOUND')).toBe('pending')
    expect(mapLifiStatus('SOMETHING_NEW')).toBe('pending')
    expect(mapLifiStatus(null)).toBe('pending')
  })
})

describe('parseLifiStatus', () => {
  it('reads a completed transfer, both hashes and what landed', () => {
    const update = parseLifiStatus(statusDone)
    expect(update.status).toBe('confirmed')
    expect(update.substatus).toBe('COMPLETED')
    expect(update.sourceTxHash).toBe(
      '0x5a0a454070f0159c26423f500bd8af74931ff805838a77946dcfd5ac26619352',
    )
    expect(update.destinationTxHash).toBe(
      '0xb6bdcdb6fef2c8cfe637d28122e983734ee275b83efa65a88bfceadc6963a5b6',
    )
    expect(update.amountOut).toBe(17_000)
    expect(update.explorerUrl).toContain('scan.li.fi')
    expect(update.found).toBe(true)
  })

  it('reads a transfer still waiting on its destination leg', () => {
    const update = parseLifiStatus(statusPending)
    expect(update.status).toBe('pending')
    expect(update.substatus).toBe('WAIT_DESTINATION_TRANSACTION')
    expect(update.destinationTxHash).toBeNull()
    // No landing amount yet, and no invented one.
    expect(update.amountOut).toBeNull()
  })

  it('reports an unindexed hash as pending and not found', () => {
    const update = parseLifiStatus(null, false)
    expect(update.status).toBe('pending')
    expect(update.found).toBe(false)
    expect(update.sourceTxHash).toBeNull()
  })
})
