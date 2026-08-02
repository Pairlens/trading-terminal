// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  ENTRY_FILE,
  MAX_HISTORY_CHARS_PER_SCRIPT,
  MAX_VERSIONS_PER_SCRIPT,
  VERSION_COALESCE_MS,
  isValidModulePath,
  normalizeModulePath,
  scriptFileSource,
  scriptFiles,
  useIndicatorScriptsStore,
} from '../indicator-scripts-store'

import type { IndicatorScript } from '../indicator-scripts-store'

// Minimal localStorage backing — the store only touches it lazily, so
// installing it after the imports is safe.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

const script = (modules?: IndicatorScript['modules']): IndicatorScript => ({
  id: 'abc',
  name: 'Bollinger',
  source: 'meta = 1',
  ...(modules ? { modules } : {}),
  meta: null,
  metaError: null,
  createdAt: 0,
  updatedAt: 0,
})

describe('normalizeModulePath', () => {
  it('appends .py and trims surrounding noise', () => {
    expect(normalizeModulePath(' helpers ')).toBe('helpers.py')
    expect(normalizeModulePath('helpers.py')).toBe('helpers.py')
    expect(normalizeModulePath('/signals/ema/')).toBe('signals/ema.py')
    expect(normalizeModulePath('   ')).toBe('')
  })
})

describe('isValidModulePath', () => {
  it('accepts importable module paths', () => {
    for (const path of [
      'helpers.py',
      '_util.py',
      'signals/ema.py',
      'a/b/c.py',
    ]) {
      expect(isValidModulePath(path)).toBe(true)
    }
  })

  it('rejects anything Python could not import — or could escape with', () => {
    for (const path of [
      'helpers', // no extension
      'my helpers.py', // space
      '2fast.py', // leading digit
      'my-helpers.py', // dash
      '../escape.py',
      'a/b/c/d/e.py', // too deep
      `${'x'.repeat(90)}.py`,
    ]) {
      expect(isValidModulePath(path)).toBe(false)
    }
  })
})

describe('scriptFiles', () => {
  it('lists the entry first, then helper modules', () => {
    const files = scriptFiles(
      script([
        { path: 'stats.py', source: 'S' },
        { path: 'signals/ema.py', source: 'E' },
      ]),
    )
    expect(files.map((f) => f.path)).toEqual([
      ENTRY_FILE,
      'stats.py',
      'signals/ema.py',
    ])
    expect(files[0].source).toBe('meta = 1')
  })

  it('is just the entry for a single-file indicator', () => {
    expect(scriptFiles(script()).map((f) => f.path)).toEqual([ENTRY_FILE])
  })
})

describe('scriptFileSource', () => {
  it('resolves entry and module sources, undefined for unknown paths', () => {
    const s = script([{ path: 'stats.py', source: 'S' }])
    expect(scriptFileSource(s, ENTRY_FILE)).toBe('meta = 1')
    expect(scriptFileSource(s, 'stats.py')).toBe('S')
    expect(scriptFileSource(s, 'nope.py')).toBeUndefined()
  })
})

// ── Version history ─────────────────────────────────────────────────

const SCRIPTS_KEY = 'pairlens:indicator-scripts'
const HISTORY_KEY = 'pairlens:indicator-history'

const store = () => useIndicatorScriptsStore.getState()

describe('version history', () => {
  const realNow = Date.now
  let clock = 1_700_000_000_000
  const advance = (ms: number) => {
    clock += ms
  }

  beforeEach(() => {
    clock = 1_700_000_000_000
    Date.now = () => clock
    localStorage.clear()
    useIndicatorScriptsStore.setState({
      scripts: [],
      loaded: true,
      history: {},
      historyLoaded: true,
    })
  })

  afterEach(() => {
    Date.now = realNow
  })

  const newScript = (
    source: string,
    modules?: IndicatorScript['modules'],
  ): string => store().createScript('RSI', source, modules)

  it('snapshots the files as they were before a save', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(1)
    expect(versions[0].kind).toBe('save')
    expect(versions[0].label).toBe('Saved')
    expect(versions[0].files).toEqual([{ path: ENTRY_FILE, source: 'v1' }])
    expect(store().scripts.find((s) => s.id === id)?.source).toBe('v2')
  })

  it('snapshots module edits too', () => {
    const id = newScript('v1', [{ path: 'stats.py', source: 'S1' }])
    store().setFileSource(id, 'stats.py', 'S2')

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(1)
    expect(versions[0].files).toEqual([
      { path: ENTRY_FILE, source: 'v1' },
      { path: 'stats.py', source: 'S1' },
    ])
  })

  it('does not snapshot a write that changes nothing', () => {
    const id = newScript('v1', [{ path: 'stats.py', source: 'S1' }])
    store().setFileSource(id, ENTRY_FILE, 'v1')
    store().setFileSource(id, 'stats.py', 'S1')
    store().setFileSource(id, 'ghost.py', 'nope')
    expect(store().listVersions(id)).toHaveLength(0)
  })

  it('coalesces a burst of same-kind changes inside the 60s window', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')
    advance(VERSION_COALESCE_MS - 1)
    store().setFileSource(id, ENTRY_FILE, 'v3')

    // One entry, and it is the state that opened the burst — the valuable one.
    expect(store().listVersions(id)).toHaveLength(1)
    expect(store().listVersions(id)[0].files[0].source).toBe('v1')

    // The window is anchored to that entry, so it does not roll forever.
    advance(2)
    store().setFileSource(id, ENTRY_FILE, 'v4')
    const versions = store().listVersions(id)
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => v.files[0].source)).toEqual(['v3', 'v1'])
  })

  it('keeps different kinds of change apart inside the window', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')
    store().addModule(id, 'helpers.py', 'H')

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(2)
    expect(versions[0].kind).toBe('add')
    expect(versions[0].label).toBe('Added helpers.py')
    expect(versions[0].files.map((f) => f.path)).toEqual([ENTRY_FILE])
  })

  it('labels renames and deletes with the paths involved', () => {
    const id = newScript('v1', [{ path: 'stats.py', source: 'S' }])
    store().renameModule(id, 'stats.py', 'math.py')
    store().deleteModule(id, 'math.py')

    const versions = store().listVersions(id)
    expect(versions.map((v) => v.label)).toEqual([
      'Deleted math.py',
      'Renamed stats.py → math.py',
    ])
    expect(versions[0].files.map((f) => f.path)).toEqual([
      ENTRY_FILE,
      'math.py',
    ])
  })

  it('caps the log at MAX_VERSIONS_PER_SCRIPT, dropping the oldest', () => {
    const id = newScript('rev0')
    for (let i = 1; i <= MAX_VERSIONS_PER_SCRIPT + 10; i++) {
      store().setFileSource(id, ENTRY_FILE, `rev${i}`)
      advance(VERSION_COALESCE_MS)
    }

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(MAX_VERSIONS_PER_SCRIPT)
    expect(versions[0].files[0].source).toBe(
      `rev${MAX_VERSIONS_PER_SCRIPT + 9}`,
    )
    expect(versions[versions.length - 1].files[0].source).toBe('rev10')
  })

  it('drops oldest versions once the character budget is blown', () => {
    const chunk = Math.floor(MAX_HISTORY_CHARS_PER_SCRIPT * 0.4)
    const rev = (n: number) => `${n}`.padEnd(chunk, 'x')
    const id = newScript(rev(0))
    for (let i = 1; i <= 3; i++) {
      store().setFileSource(id, ENTRY_FILE, rev(i))
      advance(VERSION_COALESCE_MS)
    }

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => v.files[0].source[0])).toEqual(['2', '1'])
  })

  it('never drops the newest version, even when it alone blows the budget', () => {
    const huge = 'x'.repeat(MAX_HISTORY_CHARS_PER_SCRIPT + 1)
    const id = newScript(huge)
    store().setFileSource(id, ENTRY_FILE, 'small')

    const versions = store().listVersions(id)
    expect(versions).toHaveLength(1)
    expect(versions[0].files[0].source).toBe(huge)
  })

  it('restore snapshots the current state first, then rolls the files back', () => {
    const id = newScript('v1', [{ path: 'helpers.py', source: 'H1' }])
    store().setFileSource(id, ENTRY_FILE, 'v2')
    const target = store().listVersions(id)[0]
    store().deleteModule(id, 'helpers.py')

    store().restoreVersion(id, target.id)

    const restored = store().scripts.find((s) => s.id === id)
    expect(restored?.source).toBe('v1')
    expect(restored?.modules).toEqual([{ path: 'helpers.py', source: 'H1' }])

    const versions = store().listVersions(id)
    expect(versions[0].kind).toBe('restore')
    expect(versions[0].label).toBe('Before restore')
    expect(versions[0].files).toEqual([{ path: ENTRY_FILE, source: 'v2' }])

    // …which makes the restore itself undoable.
    store().restoreVersion(id, versions[0].id)
    expect(store().scripts.find((s) => s.id === id)?.source).toBe('v2')
    expect(store().scripts.find((s) => s.id === id)?.modules).toEqual([])
  })

  it('ignores a restore of an unknown version or script', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')
    store().restoreVersion(id, 'nope')
    store().restoreVersion('nope', store().listVersions(id)[0].id)
    expect(store().scripts.find((s) => s.id === id)?.source).toBe('v2')
    expect(store().listVersions(id)).toHaveLength(1)
  })

  it('clearVersions drops the log of one script only', () => {
    const a = newScript('a1')
    const b = newScript('b1')
    store().setFileSource(a, ENTRY_FILE, 'a2')
    store().setFileSource(b, ENTRY_FILE, 'b2')

    store().clearVersions(a)
    expect(store().listVersions(a)).toHaveLength(0)
    expect(store().listVersions(b)).toHaveLength(1)
  })

  it('deleting a script deletes its history', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')
    store().deleteScript(id)

    expect(store().listVersions(id)).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}')).toEqual({})
  })

  it('keeps history in its own storage key and loads it lazily', () => {
    const id = newScript('v1')
    store().setFileSource(id, ENTRY_FILE, 'v2')

    expect(localStorage.getItem(SCRIPTS_KEY)).not.toContain('"files"')
    expect(localStorage.getItem(HISTORY_KEY)).toContain('"files"')

    // A store that has not paged history in yet reads the key on demand.
    useIndicatorScriptsStore.setState({ history: {}, historyLoaded: false })
    expect(store().listVersions(id)).toHaveLength(1)
    expect(store().historyLoaded).toBe(true)
  })

  it('survives a corrupted history key', () => {
    localStorage.setItem(HISTORY_KEY, '{ not json')
    useIndicatorScriptsStore.setState({ history: {}, historyLoaded: false })
    const id = newScript('v1')
    expect(store().listVersions(id)).toEqual([])
  })
})

describe('cacheMeta', () => {
  const realNow = Date.now
  let clock = 1_700_000_000_000

  beforeEach(() => {
    clock = 1_700_000_000_000
    Date.now = () => clock
    localStorage.clear()
    useIndicatorScriptsStore.setState({
      scripts: [],
      loaded: true,
      history: {},
      historyLoaded: true,
    })
  })

  afterEach(() => {
    Date.now = realNow
  })

  const meta = {
    title: 'RSI',
    pane: 'sub',
    series: [],
  } as unknown as NonNullable<IndicatorScript['meta']>

  // The regression this exists for: the workbench auto-runs a script when you
  // open it, so caching meta through the edit path made every script you
  // merely looked at claim it had just been modified.
  it('does not stamp updatedAt — a run reads a script, it does not edit it', () => {
    const id = store().createScript('RSI', 'v1')
    const created = store().scripts[0].updatedAt

    clock += 60 * 60 * 1000
    store().cacheMeta(id, { meta, metaError: null })

    const after = store().scripts[0]
    expect(after.meta).toEqual(meta)
    expect(after.updatedAt).toBe(created)
  })

  it('still stamps updatedAt for a real edit', () => {
    const id = store().createScript('RSI', 'v1')
    clock += 60 * 60 * 1000
    store().updateScript(id, { name: 'RSI 2' })
    expect(store().scripts[0].updatedAt).toBe(clock)
  })

  it('leaves the cached meta alone when only metaError is patched', () => {
    const id = store().createScript('RSI', 'v1')
    store().cacheMeta(id, { meta, metaError: null })
    store().cacheMeta(id, { metaError: 'SyntaxError' })

    const after = store().scripts[0]
    expect(after.meta).toEqual(meta)
    expect(after.metaError).toBe('SyntaxError')
  })

  it('skips the write entirely when the run learned nothing new', () => {
    const id = store().createScript('RSI', 'v1')
    store().cacheMeta(id, { meta, metaError: null })
    const before = store().scripts

    store().cacheMeta(id, { meta: { ...meta }, metaError: null })
    expect(store().scripts).toBe(before)
  })

  it('ignores an unknown script', () => {
    store().createScript('RSI', 'v1')
    store().cacheMeta('nope', { meta, metaError: null })
    expect(store().scripts[0].meta).toBeNull()
  })
})
