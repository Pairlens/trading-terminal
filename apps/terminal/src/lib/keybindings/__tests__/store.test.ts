// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

// The store persists through `createSyncedSetting`, which reads and writes
// localStorage. Bun's test runtime has none, so stand one up before the first
// call — the setting only touches it lazily, so assigning it here is enough.
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}

const {
  commandsUsingChord,
  eventMatchesCommand,
  getCommandChords,
  getCommandLabel,
  getKeybindingsState,
  getTimeframeShortcutSummary,
  isCommandCustomized,
  listConflicts,
  matchCommand,
  resetCommand,
  resetKeybindings,
  setCommandChords,
  setKeymap,
  subscribeKeybindings,
} = await import('../store')
const { isApple } = await import('../chord')

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

/** Press the primary modifier the way this platform reports it. */
const mod = isApple ? { meta: true } : { ctrl: true }

beforeEach(() => {
  resetKeybindings()
})

describe('defaults', () => {
  it('ships the Pairlens keymap with no overrides', () => {
    expect(getKeybindingsState()).toEqual({ keymap: 'pairlens', overrides: {} })
    expect(getCommandChords('general.commandPalette')).toEqual(['Mod+K'])
    expect(getCommandChords('navigation.pairs')).toEqual(['Alt+1'])
    expect(getCommandChords('chart.deleteDrawing')).toEqual([
      'Delete',
      'Backspace',
    ])
  })

  it('reports commands a preset leaves unbound', () => {
    expect(getCommandChords('chart.tool.channel')).toEqual([])
    expect(getCommandLabel('chart.tool.channel')).toBe('')
  })

  it('summarizes the timeframe digits as a range', () => {
    expect(getTimeframeShortcutSummary()).toBe('1–9')
  })
})

describe('overrides', () => {
  it('replaces a command’s chords and flags it as customized', () => {
    setCommandChords('navigation.pairs', ['Mod+Shift+1'])
    expect(getCommandChords('navigation.pairs')).toEqual(['Mod+Shift+1'])
    expect(isCommandCustomized('navigation.pairs')).toBe(true)
  })

  it('normalizes and de-duplicates what it is handed', () => {
    setCommandChords('navigation.pairs', ['cmd+shift+1', 'Mod+Shift+1'])
    expect(getCommandChords('navigation.pairs')).toEqual(['Mod+Shift+1'])
  })

  it('drops chords it cannot parse instead of storing them', () => {
    setCommandChords('navigation.pairs', ['Alt+2', 'Hyper+Nope'])
    expect(getCommandChords('navigation.pairs')).toEqual(['Alt+2'])
  })

  it('supports deliberately unbinding a command', () => {
    setCommandChords('navigation.bots', [])
    expect(getCommandChords('navigation.bots')).toEqual([])
    expect(isCommandCustomized('navigation.bots')).toBe(true)
  })

  it('restores the preset default on reset', () => {
    setCommandChords('navigation.pairs', ['Mod+Shift+1'])
    resetCommand('navigation.pairs')
    expect(getCommandChords('navigation.pairs')).toEqual(['Alt+1'])
    expect(isCommandCustomized('navigation.pairs')).toBe(false)
  })

  it('ignores writes to unknown command ids', () => {
    setCommandChords('not.a.command', ['Mod+J'])
    expect(getKeybindingsState().overrides['not.a.command']).toBeUndefined()
  })
})

describe('keymap presets', () => {
  it('overlays preset differences on the shipped defaults', () => {
    setKeymap('tradingview')
    // Changed by the preset...
    expect(getCommandChords('chart.redo')).toEqual(['Mod+Y'])
    expect(getCommandChords('chart.tool.channel')).toEqual(['Alt+P'])
    // ...and inherited unchanged from Pairlens.
    expect(getCommandChords('chart.undo')).toEqual(['Mod+Z'])
  })

  it('moves section navigation onto function keys for Bloomberg', () => {
    setKeymap('bloomberg')
    expect(getCommandChords('navigation.pairs')).toEqual(['F2'])
    expect(getCommandChords('general.commandPalette')).toEqual(['Mod+K', 'F1'])
  })

  it('keeps user overrides across a preset switch', () => {
    setCommandChords('chart.undo', ['Mod+Alt+Z'])
    setKeymap('bloomberg')
    expect(getCommandChords('chart.undo')).toEqual(['Mod+Alt+Z'])
    expect(getCommandChords('navigation.pairs')).toEqual(['F2'])
  })
})

describe('conflicts', () => {
  it('finds nothing in the shipped defaults', () => {
    expect(listConflicts()).toEqual([])
  })

  it('reports a chord bound to two commands', () => {
    setCommandChords('navigation.bots', ['Alt+1'])
    const conflicts = listConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].chord).toBe('Alt+1')
    expect(conflicts[0].commandIds.sort()).toEqual([
      'navigation.bots',
      'navigation.pairs',
    ])
  })

  it('lists who else holds a chord, excluding the command being edited', () => {
    expect(commandsUsingChord('Alt+1', 'navigation.pairs')).toEqual([])
    expect(commandsUsingChord('Alt+1')).toEqual(['navigation.pairs'])
    expect(commandsUsingChord('cmd+k')).toEqual(['general.commandPalette'])
  })
})

describe('matching', () => {
  it('resolves an event to the command bound in that scope', () => {
    expect(
      matchCommand(keyEvent('Digit1', { key: '1', alt: true }), 'global'),
    ).toBe('navigation.pairs')
    // Bare digits belong to the chart, not to the global scope.
    expect(matchCommand(keyEvent('Digit1', { key: '1' }), 'global')).toBeNull()
    expect(matchCommand(keyEvent('Digit1', { key: '1' }), 'chart')).toBe(
      'chart.timeframe.1m',
    )
  })

  it('follows a rebind immediately', () => {
    setCommandChords('navigation.pairs', ['Alt+Shift+1'])
    expect(
      matchCommand(keyEvent('Digit1', { key: '1', alt: true }), 'global'),
    ).toBeNull()
    expect(
      matchCommand(
        keyEvent('Digit1', { key: '1', alt: true, shift: true }),
        'global',
      ),
    ).toBe('navigation.pairs')
  })

  it('matches any of a command’s chords', () => {
    expect(eventMatchesCommand(keyEvent('Delete'), 'chart.deleteDrawing')).toBe(
      true,
    )
    expect(
      eventMatchesCommand(keyEvent('Backspace'), 'chart.deleteDrawing'),
    ).toBe(true)
    expect(
      eventMatchesCommand(
        keyEvent('KeyK', { key: 'k', ...mod }),
        'general.commandPalette',
      ),
    ).toBe(true)
  })

  it('reports no match for an unbound command', () => {
    setCommandChords('general.commandPalette', [])
    expect(
      eventMatchesCommand(
        keyEvent('KeyK', { key: 'k', ...mod }),
        'general.commandPalette',
      ),
    ).toBe(false)
  })
})

describe('subscriptions', () => {
  it('notifies listeners on every change', () => {
    let calls = 0
    const unsubscribe = subscribeKeybindings(() => {
      calls += 1
    })
    setCommandChords('navigation.pairs', ['Alt+Shift+1'])
    setKeymap('bloomberg')
    unsubscribe()
    setCommandChords('navigation.pairs', ['Alt+1'])
    expect(calls).toBe(2)
  })
})
