// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  chordFromEvent,
  chordLabel,
  chordMatchesEvent,
  chordToAccelerator,
  formatChord,
  isApple,
  isRiskyChord,
  normalizeChord,
  parseChord,
} from '../chord'

/** A KeyboardEvent-shaped stub — chord matching only reads these fields. */
function keyEvent(
  code: string,
  {
    key,
    meta = false,
    ctrl = false,
    alt = false,
    shift = false,
  }: {
    key?: string
    meta?: boolean
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
  } = {},
): KeyboardEvent {
  return {
    code,
    key: key ?? code,
    metaKey: meta,
    ctrlKey: ctrl,
    altKey: alt,
    shiftKey: shift,
  } as unknown as KeyboardEvent
}

describe('parseChord', () => {
  it('parses modifiers in any order and case', () => {
    expect(parseChord('Mod+Shift+P')).toEqual({
      key: 'P',
      mod: true,
      ctrl: false,
      alt: false,
      shift: true,
    })
    expect(parseChord('shift+mod+p')).toEqual(parseChord('Mod+Shift+P'))
    expect(parseChord('cmd+p')).toEqual(parseChord('Mod+P'))
    expect(parseChord('CmdOrCtrl+P')).toEqual(parseChord('Mod+P'))
  })

  it('accepts named keys, function keys, digits and punctuation', () => {
    expect(parseChord('Escape')?.key).toBe('Escape')
    expect(parseChord('esc')?.key).toBe('Escape')
    expect(parseChord('F12')?.key).toBe('F12')
    expect(parseChord('Alt+1')?.key).toBe('1')
    expect(parseChord('Mod+[')?.key).toBe('[')
    expect(parseChord('Mod+,')?.key).toBe(',')
  })

  it('treats a trailing plus as the "+" key', () => {
    expect(parseChord('Mod++')).toEqual({
      key: '+',
      mod: true,
      ctrl: false,
      alt: false,
      shift: false,
    })
  })

  it('returns null rather than throwing on garbage', () => {
    expect(parseChord('')).toBeNull()
    expect(parseChord('Hyper+K')).toBeNull()
    expect(parseChord('Mod+NotAKey')).toBeNull()
  })

  it('folds a literal Ctrl into Mod off Apple hardware', () => {
    const chord = parseChord('Ctrl+K')!
    if (isApple) {
      expect(chord).toMatchObject({ ctrl: true, mod: false })
    } else {
      // On Windows/Linux, Ctrl IS the primary modifier — collapsing them keeps
      // a keymap from binding two commands to one physical chord.
      expect(chord).toMatchObject({ ctrl: false, mod: true })
    }
  })
})

describe('formatChord / normalizeChord', () => {
  it('round-trips through a canonical form', () => {
    expect(formatChord(parseChord('shift+alt+mod+k')!)).toBe('Mod+Alt+Shift+K')
    expect(normalizeChord('cmd+shift+p')).toBe('Mod+Shift+P')
    expect(normalizeChord('nonsense')).toBeNull()
  })
})

describe('chordLabel', () => {
  it('renders platform-appropriate labels', () => {
    const label = chordLabel(parseChord('Mod+Shift+P')!)
    expect(label).toBe(isApple ? '⇧⌘P' : 'Ctrl+Shift+P')
  })

  it('renders named keys as symbols', () => {
    expect(chordLabel(parseChord('ArrowUp')!)).toBe('↑')
    expect(chordLabel(parseChord('Escape')!)).toBe('⎋')
  })
})

describe('chordFromEvent', () => {
  it('ignores bare modifier presses', () => {
    expect(chordFromEvent(keyEvent('MetaLeft', { key: 'Meta' }))).toBeNull()
    expect(chordFromEvent(keyEvent('ShiftLeft', { key: 'Shift' }))).toBeNull()
  })

  it('reads the physical key, not the composed character', () => {
    // macOS turns Option+T into "†"; e.code stays KeyT.
    const chord = chordFromEvent(keyEvent('KeyT', { key: '†', alt: true }))
    expect(chord).toMatchObject({ key: 'T', alt: true })
  })

  it('normalizes digits and numpad digits alike', () => {
    expect(chordFromEvent(keyEvent('Digit1', { key: '1' }))?.key).toBe('1')
    expect(chordFromEvent(keyEvent('Numpad1', { key: '1' }))?.key).toBe('1')
  })
})

describe('chordMatchesEvent', () => {
  const alt1 = parseChord('Alt+1')!

  it('matches the exact modifier set', () => {
    expect(
      chordMatchesEvent(alt1, keyEvent('Digit1', { key: '1', alt: true })),
    ).toBe(true)
  })

  it('rejects a superset of modifiers', () => {
    expect(
      chordMatchesEvent(
        alt1,
        keyEvent('Digit1', { key: '1', alt: true, shift: true }),
      ),
    ).toBe(false)
  })

  it('rejects the bare key', () => {
    expect(chordMatchesEvent(alt1, keyEvent('Digit1', { key: '1' }))).toBe(
      false,
    )
  })

  it('matches shifted chords off e.code, which shift does not change', () => {
    const modShiftP = parseChord('Mod+Shift+P')!
    const event = keyEvent('KeyP', {
      key: 'P',
      shift: true,
      ...(isApple ? { meta: true } : { ctrl: true }),
    })
    expect(chordMatchesEvent(modShiftP, event)).toBe(true)
  })
})

describe('chordToAccelerator', () => {
  it('emits Tauri accelerator strings', () => {
    expect(chordToAccelerator(parseChord('Mod+N')!)).toBe('CmdOrCtrl+N')
    expect(chordToAccelerator(parseChord('Mod+Shift+P')!)).toBe(
      'CmdOrCtrl+Shift+P',
    )
    expect(chordToAccelerator(parseChord('Mod+[')!)).toBe('CmdOrCtrl+[')
    expect(chordToAccelerator(parseChord('F5')!)).toBe('F5')
  })
})

describe('isRiskyChord', () => {
  it('flags chords that break basic typing or reload the page', () => {
    expect(isRiskyChord(parseChord('Tab')!)).toBe(true)
    expect(isRiskyChord(parseChord('Enter')!)).toBe(true)
    expect(isRiskyChord(parseChord('F5')!)).toBe(true)
  })

  it('leaves ordinary chords alone', () => {
    expect(isRiskyChord(parseChord('Alt+1')!)).toBe(false)
    expect(isRiskyChord(parseChord('Mod+Shift+P')!)).toBe(false)
    // Bare letters and digits are the chart pane's bread and butter.
    expect(isRiskyChord(parseChord('1')!)).toBe(false)
    expect(isRiskyChord(parseChord('T')!)).toBe(false)
  })
})
