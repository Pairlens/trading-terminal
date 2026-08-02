// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

const STORAGE_KEY = 'pairlens:indicator-scripts'
const SYNC_KEY = 'indicator-scripts'

/**
 * Version history lives in its own key, loaded lazily: however big it grows,
 * it can never keep the script list itself from loading.
 */
const HISTORY_STORAGE_KEY = 'pairlens:indicator-history'

/** Entry module of every indicator — the one that defines meta + compute(ctx). */
export const ENTRY_FILE = 'main.py'

/** A helper module: importable from the entry by its path minus `.py`. */
export type IndicatorModule = {
  /** e.g. 'helpers.py' or 'signals/ema.py' */
  path: string
  source: string
}

/** One editor file — the entry and its helper modules share this shape. */
export type IndicatorFile = IndicatorModule

/**
 * A user-authored Python indicator. `source` is the entry module
 * (`main.py`); `modules` holds any helper files it imports, so complex
 * indicators can be split up the way a normal Python folder would be.
 *
 * `meta` caches the last successfully extracted pairlens.indicator(...)
 * metadata so charts can register the indicator (picker entry, series specs,
 * param specs) without booting the Python runtime; it refreshes on every
 * successful save/run.
 */
export type IndicatorScript = {
  id: string
  name: string
  source: string
  modules?: Array<IndicatorModule>
  meta: CustomIndicatorMeta | null
  metaError: string | null
  createdAt: number
  updatedAt: number
}

/** Module path rules: importable Python identifiers, `.py`, no `..` escapes. */
const MODULE_PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\/[A-Za-z_][A-Za-z0-9_]*)*\.py$/

export function isValidModulePath(path: string): boolean {
  if (path.length > 80 || path.split('/').length > 4) return false
  return MODULE_PATH_RE.test(path)
}

/** Append `.py` and trim, so users can type `helpers` and get `helpers.py`. */
export function normalizeModulePath(input: string): string {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '')
  if (!trimmed) return ''
  return trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`
}

/** Every file of a script, entry first — the editor's file list. */
export function scriptFiles(script: IndicatorScript): Array<IndicatorFile> {
  return [
    { path: ENTRY_FILE, source: script.source },
    ...(script.modules ?? []),
  ]
}

/** Source of one file, or `undefined` when the path isn't in the script. */
export function scriptFileSource(
  script: IndicatorScript,
  path: string,
): string | undefined {
  if (path === ENTRY_FILE) return script.source
  return script.modules?.find((m) => m.path === path)?.source
}

// ── Version history ─────────────────────────────────────────────────
//
// Saving used to be destructive: the previous content was simply gone. Every
// mutation that changes persisted content now snapshots the files **as they
// were before it**, so any save, rename or delete can be walked back.

/** What produced a snapshot — drives both coalescing and the UI label. */
export type IndicatorVersionKind =
  | 'save'
  | 'add'
  | 'rename'
  | 'delete'
  | 'restore'

/**
 * One point in a script's past: every file exactly as it looked right before
 * the change described by `kind` + `detail` overwrote it.
 */
export type IndicatorVersion = {
  id: string
  kind: IndicatorVersionKind
  /**
   * English one-liner ("Added helpers.py"). The workbench renders a
   * translated string from `kind` + `detail`; this is the fallback and what
   * non-UI consumers (exports, logs) read.
   */
  label: string
  /** Paths the change touched — `helpers.py`, `stats.py → math.py`. */
  detail?: string
  createdAt: number
  files: Array<IndicatorFile>
}

/** Per-script version log, newest first. */
export type IndicatorHistory = Record<string, Array<IndicatorVersion>>

/** A burst of same-kind changes inside this window collapses into one entry. */
export const VERSION_COALESCE_MS = 60_000
/** Hard entry cap per script — oldest fall off the end. */
export const MAX_VERSIONS_PER_SCRIPT = 50
/** Character budget per script; localStorage is finite and Python isn't small. */
export const MAX_HISTORY_CHARS_PER_SCRIPT = 2_000_000

/** Stored weight of a version: sources plus the paths they're filed under. */
export function versionChars(version: IndicatorVersion): number {
  let total = 0
  for (const file of version.files)
    total += file.path.length + file.source.length
  return total
}

/**
 * Enforce both caps on a newest-first list. Entries are dropped oldest-first,
 * and the newest survives even when it alone blows the character budget —
 * a 3 MB script should still be recoverable from its one snapshot.
 */
export function trimVersions(
  versions: Array<IndicatorVersion>,
): Array<IndicatorVersion> {
  const kept = versions.slice(0, MAX_VERSIONS_PER_SCRIPT)
  let total = 0
  for (const version of kept) total += versionChars(version)
  while (kept.length > 1 && total > MAX_HISTORY_CHARS_PER_SCRIPT) {
    total -= versionChars(kept[kept.length - 1])
    kept.pop()
  }
  return kept
}

/** English fallback label — the UI translates from `kind` + `detail`. */
export function versionLabel(
  kind: IndicatorVersionKind,
  detail?: string,
): string {
  switch (kind) {
    case 'add':
      return `Added ${detail}`
    case 'rename':
      return `Renamed ${detail}`
    case 'delete':
      return `Deleted ${detail}`
    case 'restore':
      return 'Before restore'
    case 'save':
    default:
      return 'Saved'
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadFromStorage(): Array<IndicatorScript> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveToStorage(scripts: Array<IndicatorScript>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts))
  } catch {
    // Ignore quota errors
  }
  emitWrite(SYNC_KEY, scripts)
}

function loadHistoryFromStorage(): IndicatorHistory {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as IndicatorHistory
      }
    }
  } catch {
    // Ignore corrupted data — history is a nice-to-have, never load-blocking
  }
  return {}
}

// History deliberately stays out of the sync channel: it is local-only
// undo, and broadcasting megabytes of Python on every save would be a poor
// trade for cross-window parity nobody asked for.
function saveHistoryToStorage(history: IndicatorHistory) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Ignore quota errors
  }
}

type IndicatorScriptsStore = {
  scripts: Array<IndicatorScript>
  loaded: boolean
  /** Per-script version log, newest first. Empty until `loadHistory()`. */
  history: IndicatorHistory
  historyLoaded: boolean

  load: () => void
  createScript: (
    name: string,
    source: string,
    modules?: Array<IndicatorModule>,
  ) => string // returns id
  /** Edit a script. Stamps `updatedAt` — only content changes belong here. */
  updateScript: (
    id: string,
    patch: Partial<Pick<IndicatorScript, 'name' | 'source' | 'modules'>>,
  ) => void
  /**
   * Refresh the derived metadata cache after a run. Deliberately separate from
   * `updateScript` and deliberately **not** stamping `updatedAt`: a run reads a
   * script, it doesn't edit it. Routing this through `updateScript` made every
   * script you merely opened claim it had just been modified, because the
   * workbench auto-runs on selection.
   */
  cacheMeta: (
    id: string,
    patch: Partial<Pick<IndicatorScript, 'meta' | 'metaError'>>,
  ) => void
  deleteScript: (id: string) => void

  /** Write one file's source — entry or helper module. */
  setFileSource: (id: string, path: string, source: string) => void
  /** Add an empty helper module. No-op when the path already exists. */
  addModule: (id: string, path: string, source?: string) => void
  renameModule: (id: string, from: string, to: string) => void
  deleteModule: (id: string, path: string) => void

  // ── Version history ──
  /** Read the history key. Idempotent; called on demand by the panel. */
  loadHistory: () => void
  /** A script's versions, newest first. Empty array when it has none. */
  listVersions: (scriptId: string) => Array<IndicatorVersion>
  /**
   * Capture the script's *current* files as a version. The mutators below
   * call this themselves — the UI never needs to.
   */
  snapshotVersion: (
    scriptId: string,
    kind: IndicatorVersionKind,
    detail?: string,
  ) => void
  /**
   * Overwrite the script's files with a version. Snapshots the current state
   * first ("Before restore"), so restoring is itself undoable.
   */
  restoreVersion: (scriptId: string, versionId: string) => void
  clearVersions: (scriptId: string) => void
}

export const useIndicatorScriptsStore = create<IndicatorScriptsStore>(
  (set, get) => ({
    scripts: [],
    loaded: false,
    history: {},
    historyLoaded: false,

    load() {
      if (get().loaded) return
      set({ scripts: loadFromStorage(), loaded: true })
    },

    createScript(name, source, modules) {
      const now = Date.now()
      const script: IndicatorScript = {
        id: generateId(),
        name,
        source,
        ...(modules?.length ? { modules } : {}),
        meta: null,
        metaError: null,
        createdAt: now,
        updatedAt: now,
      }
      const next = [...get().scripts, script]
      set({ scripts: next })
      saveToStorage(next)
      return script.id
    },

    updateScript(id, patch) {
      const next = get().scripts.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
      )
      set({ scripts: next })
      saveToStorage(next)
    },

    cacheMeta(id, patch) {
      const current = get().scripts.find((s) => s.id === id)
      if (!current) return
      // A no-op run is the common case (open a script, it re-runs, the meta
      // comes back identical). Bailing out keeps it from re-serializing every
      // script to localStorage and waking the other windows for nothing.
      const meta = patch.meta === undefined ? current.meta : patch.meta
      const metaError =
        patch.metaError === undefined ? current.metaError : patch.metaError
      if (
        metaError === current.metaError &&
        JSON.stringify(meta) === JSON.stringify(current.meta)
      ) {
        return
      }
      const next = get().scripts.map((s) =>
        s.id === id ? { ...s, meta, metaError } : s,
      )
      set({ scripts: next })
      saveToStorage(next)
    },

    deleteScript(id) {
      const next = get().scripts.filter((s) => s.id !== id)
      set({ scripts: next })
      saveToStorage(next)
      // A deleted script's past goes with it.
      get().clearVersions(id)
    },

    setFileSource(id, path, source) {
      const script = get().scripts.find((s) => s.id === id)
      if (!script) return
      if (path === ENTRY_FILE) {
        if (script.source === source) return
        get().snapshotVersion(id, 'save')
        get().updateScript(id, { source })
        return
      }
      const modules = script.modules ?? []
      const current = modules.find((m) => m.path === path)
      if (!current || current.source === source) return
      get().snapshotVersion(id, 'save')
      get().updateScript(id, {
        modules: modules.map((m) => (m.path === path ? { ...m, source } : m)),
      })
    },

    addModule(id, path, source = '') {
      const script = get().scripts.find((s) => s.id === id)
      if (!script || path === ENTRY_FILE) return
      const modules = script.modules ?? []
      if (modules.some((m) => m.path === path)) return
      get().snapshotVersion(id, 'add', path)
      get().updateScript(id, { modules: [...modules, { path, source }] })
    },

    renameModule(id, from, to) {
      const script = get().scripts.find((s) => s.id === id)
      if (!script || from === ENTRY_FILE || to === ENTRY_FILE) return
      const modules = script.modules ?? []
      if (!modules.some((m) => m.path === from)) return
      if (modules.some((m) => m.path === to)) return
      get().snapshotVersion(id, 'rename', `${from} → ${to}`)
      get().updateScript(id, {
        modules: modules.map((m) => (m.path === from ? { ...m, path: to } : m)),
      })
    },

    deleteModule(id, path) {
      const script = get().scripts.find((s) => s.id === id)
      if (!script || path === ENTRY_FILE) return
      const modules = script.modules ?? []
      if (!modules.some((m) => m.path === path)) return
      get().snapshotVersion(id, 'delete', path)
      get().updateScript(id, {
        modules: modules.filter((m) => m.path !== path),
      })
    },

    // ── Version history ──

    loadHistory() {
      if (get().historyLoaded) return
      set({ history: loadHistoryFromStorage(), historyLoaded: true })
    },

    listVersions(scriptId) {
      get().loadHistory()
      return get().history[scriptId] ?? []
    },

    snapshotVersion(scriptId, kind, detail) {
      const script = get().scripts.find((s) => s.id === scriptId)
      if (!script) return
      get().loadHistory()

      const history = get().history
      const versions = history[scriptId] ?? []
      const newest = versions[0]
      const now = Date.now()

      // Coalesce a burst of same-kind changes (the Cmd+S habit) into the
      // single entry that opened it. The *older* snapshot is the valuable
      // one — it predates the whole burst — so the burst adds nothing and
      // the window stays anchored to the first save rather than rolling.
      // Restores never coalesce: each one must stay individually undoable.
      if (
        kind !== 'restore' &&
        newest &&
        newest.kind === kind &&
        now - newest.createdAt < VERSION_COALESCE_MS
      ) {
        return
      }

      const version: IndicatorVersion = {
        id: generateId(),
        kind,
        label: versionLabel(kind, detail),
        ...(detail ? { detail } : {}),
        createdAt: now,
        files: scriptFiles(script).map((f) => ({
          path: f.path,
          source: f.source,
        })),
      }
      const next: IndicatorHistory = {
        ...history,
        [scriptId]: trimVersions([version, ...versions]),
      }
      set({ history: next })
      saveHistoryToStorage(next)
    },

    restoreVersion(scriptId, versionId) {
      const script = get().scripts.find((s) => s.id === scriptId)
      if (!script) return
      const version = get()
        .listVersions(scriptId)
        .find((v) => v.id === versionId)
      if (!version) return

      // Snapshot what we are about to overwrite, so restore is undoable too.
      get().snapshotVersion(scriptId, 'restore')

      const source =
        version.files.find((f) => f.path === ENTRY_FILE)?.source ?? ''
      const modules = version.files
        .filter((f) => f.path !== ENTRY_FILE)
        .map((f) => ({ path: f.path, source: f.source }))
      get().updateScript(scriptId, { source, modules })
    },

    clearVersions(scriptId) {
      get().loadHistory()
      const history = get().history
      if (!(scriptId in history)) return
      const next = { ...history }
      delete next[scriptId]
      set({ history: next })
      saveHistoryToStorage(next)
    },
  }),
)

// Cross-window / cloud-merge hydration: refresh in-memory state only —
// the writer already persisted, so no re-write (prevents sync loops).
onHydrate((key, value) => {
  if (key === SYNC_KEY && Array.isArray(value)) {
    useIndicatorScriptsStore.setState({
      scripts: value as Array<IndicatorScript>,
      loaded: true,
    })
  }
})
