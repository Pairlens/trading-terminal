// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The close-behavior setting decides whether closing the last window stops
 * every bot, alert and in-flight workflow. The payload describing it crosses
 * the Tauri IPC and the cross-window bus, so the parsing has to be strict:
 * a radio group that shows the wrong answer here is a radio group that lies
 * about whether the user's positions are still being managed.
 */
import { describe, expect, test } from 'bun:test'

import {
  isCloseBehavior,
  parseCloseBehaviorInfo,
} from '../settings/close-behavior'

describe('parseCloseBehaviorInfo', () => {
  test('accepts the shape Rust actually sends', () => {
    expect(
      parseCloseBehaviorInfo({
        behavior: 'background',
        trayAvailable: true,
        trayRequired: false,
      }),
    ).toEqual({
      behavior: 'background',
      trayAvailable: true,
      trayRequired: false,
    })
  })

  test('rejects anything without a known behavior', () => {
    expect(parseCloseBehaviorInfo(null)).toBeNull()
    expect(parseCloseBehaviorInfo(undefined)).toBeNull()
    expect(parseCloseBehaviorInfo('background')).toBeNull()
    expect(parseCloseBehaviorInfo({})).toBeNull()
    expect(parseCloseBehaviorInfo({ behavior: 'hide' })).toBeNull()
    // A snake_case payload would mean the Rust serde attribute drifted; better
    // to report "unknown" than to render a default that isn't in force.
    expect(parseCloseBehaviorInfo({ close_behavior: 'quit' })).toBeNull()
  })

  test('a tray it cannot confirm is a tray it does not promise', () => {
    // Missing or non-boolean flags read as false, so the UI warns rather than
    // implying there is a way back to a hidden window.
    expect(parseCloseBehaviorInfo({ behavior: 'quit' })).toEqual({
      behavior: 'quit',
      trayAvailable: false,
      trayRequired: false,
    })
    expect(
      parseCloseBehaviorInfo({
        behavior: 'quit',
        trayAvailable: 'yes',
        trayRequired: 1,
      }),
    ).toEqual({
      behavior: 'quit',
      trayAvailable: false,
      trayRequired: false,
    })
  })
})

describe('isCloseBehavior', () => {
  test('only the two wire values pass', () => {
    expect(isCloseBehavior('quit')).toBe(true)
    expect(isCloseBehavior('background')).toBe(true)
    expect(isCloseBehavior('Background')).toBe(false)
    expect(isCloseBehavior('')).toBe(false)
    expect(isCloseBehavior(undefined)).toBe(false)
  })
})

describe('desktop-only exports in a browser build', () => {
  test('never reach for Tauri and never claim a value they do not have', async () => {
    const mod = await import('../settings/close-behavior')
    // The test environment is not Tauri: loading must resolve to null rather
    // than throw on a missing @tauri-apps/api, and quitting must be inert.
    expect(await mod.loadCloseBehavior()).toBeNull()
    expect(await mod.setCloseBehavior('background')).toBeNull()
    expect(mod.getCloseBehaviorSnapshot()).toBeNull()
    await mod.quitApp()
    await mod.setTrayLabels('Show', 'Quit')
  })
})
