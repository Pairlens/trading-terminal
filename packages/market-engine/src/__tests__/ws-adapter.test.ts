// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  confirmTauriWriterRegistered,
  isTauriConnectionNotFound,
  mapTauriWsMessage,
} from '../ws-adapter'

// These pin the @tauri-apps/plugin-websocket (v2.x) message contract that the
// desktop path depends on. The plugin sends externally-tagged frames
// { type, data } for Text/Binary/Ping/Pong/Close, and a BARE STRING for a
// transport error. The two historical desktop bugs were: ignoring the error
// string (→ no reconnect) and dropping Binary frames sent as a number[]
// (→ HTX/MEXC delivered no data).

describe('mapTauriWsMessage', () => {
  it('maps a Text frame to a string message', () => {
    expect(mapTauriWsMessage({ type: 'Text', data: 'hello' })).toEqual({
      kind: 'message',
      data: 'hello',
    })
  })

  it('converts a Binary frame (number[]) to an ArrayBuffer, preserving bytes', () => {
    const evt = mapTauriWsMessage({ type: 'Binary', data: [1, 2, 255] })
    expect(evt.kind).toBe('message')
    if (evt.kind !== 'message') throw new Error('expected message')
    expect(evt.data).toBeInstanceOf(ArrayBuffer)
    expect(Array.from(new Uint8Array(evt.data as ArrayBuffer))).toEqual([
      1, 2, 255,
    ])
  })

  it('passes through a Binary frame that is already an ArrayBuffer', () => {
    const buf = new Uint8Array([9, 9]).buffer
    const evt = mapTauriWsMessage({ type: 'Binary', data: buf })
    expect(evt).toEqual({ kind: 'message', data: buf })
  })

  it('treats a transport error (bare string) as an error event', () => {
    expect(mapTauriWsMessage('connection reset by peer')).toEqual({
      kind: 'error',
      message: 'connection reset by peer',
    })
  })

  it('maps a Close frame with code/reason', () => {
    expect(
      mapTauriWsMessage({
        type: 'Close',
        data: { code: 1006, reason: 'gone' },
      }),
    ).toEqual({ kind: 'close', code: 1006, reason: 'gone' })
  })

  it('maps a Close frame with null data to a normal close', () => {
    expect(mapTauriWsMessage({ type: 'Close', data: null })).toEqual({
      kind: 'close',
      code: 1000,
      reason: '',
    })
  })

  it('ignores Ping and Pong keepalive frames', () => {
    expect(mapTauriWsMessage({ type: 'Ping', data: [1] }).kind).toBe('ignore')
    expect(mapTauriWsMessage({ type: 'Pong', data: [1] }).kind).toBe('ignore')
  })

  it('ignores unknown / malformed messages', () => {
    expect(mapTauriWsMessage({ type: 'Wat' }).kind).toBe('ignore')
    expect(mapTauriWsMessage({ type: 'Text', data: 123 }).kind).toBe('ignore')
    expect(mapTauriWsMessage(null).kind).toBe('ignore')
    expect(mapTauriWsMessage(42).kind).toBe('ignore')
  })
})

// The plugin's Rust connect command returns before the write-half is in the
// connection map, so a send right after connect can fail with "connection not
// found". connectTauriWs must not hand the socket to a connector until a send
// has provably reached the wire — otherwise the connector's SUBSCRIBE is
// silently lost and the stream stays open-but-empty forever.

const NOT_FOUND = new Error('connection not found for the given id: 7')

describe('isTauriConnectionNotFound', () => {
  it('matches the plugin registration-race error', () => {
    expect(isTauriConnectionNotFound(NOT_FOUND)).toBe(true)
    expect(isTauriConnectionNotFound('Connection NOT FOUND for id 1')).toBe(
      true,
    )
  })

  it('does not match other transport errors', () => {
    expect(isTauriConnectionNotFound(new Error('connection reset'))).toBe(false)
    expect(isTauriConnectionNotFound('IO error: broken pipe')).toBe(false)
  })
})

describe('confirmTauriWriterRegistered', () => {
  it('resolves on the first successful ping', async () => {
    let pings = 0
    await confirmTauriWriterRegistered(async () => {
      pings++
    })
    expect(pings).toBe(1)
  })

  it('retries through the registration race until a ping lands', async () => {
    let pings = 0
    await confirmTauriWriterRegistered(
      async () => {
        pings++
        if (pings < 3) throw NOT_FOUND
      },
      5,
      1,
    )
    expect(pings).toBe(3)
  })

  it('fails fast on a real transport error', async () => {
    let pings = 0
    await expect(
      confirmTauriWriterRegistered(
        async () => {
          pings++
          throw new Error('IO error: broken pipe')
        },
        5,
        1,
      ),
    ).rejects.toThrow('broken pipe')
    expect(pings).toBe(1)
  })

  it('gives up after the attempt budget if the writer never registers', async () => {
    let pings = 0
    await expect(
      confirmTauriWriterRegistered(
        async () => {
          pings++
          throw NOT_FOUND
        },
        3,
        1,
      ),
    ).rejects.toThrow('connection not found')
    expect(pings).toBe(3)
  })
})
