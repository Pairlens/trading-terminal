// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  DEFAULT_KEYMAP_ID,
  KEYBINDING_COMMANDS,
  KEYBINDING_COMMANDS_BY_ID,
  KEYMAPS,
  TIMEFRAME_COMMANDS,
  keymapDefaults,
  timeframeCommandId,
} from './commands'
import {
  chordLabel,
  chordMatchesEvent,
  normalizeChord,
  parseChord,
} from './chord'
import type { Chord } from './chord'
import type { KeybindingCommand, KeybindingScope, KeymapId } from './commands'
import { createSyncedSetting } from '@/lib/settings/synced-setting'
import { isStandalone } from '@/lib/platform'

/**
 * Resolved, live keybindings.
 *
 * State is `{ keymap, overrides }` — a chosen preset plus the user's per-command
 * edits on top of it. Resolution is `override ?? preset ?? shipped default`, so
 * switching presets keeps every deliberate edit, and clearing an override drops
 * a command back to whatever the current preset says.
 *
 * Persistence rides `createSyncedSetting`, which is the same localStorage +
 * sync-channel bus `usePersistedState` uses: edits reach every hook instance,
 * every sibling desktop window, and the non-React native menu builder without
 * anything having to poll.
 */

export type KeybindingsState = {
  keymap: KeymapId
  /** Per-command chord lists. `[]` means "deliberately unbound". */
  overrides: Record<string, Array<string>>
}

export const KEYBINDINGS_STORAGE_KEY = 'keybindings'

const DEFAULT_STATE: KeybindingsState = {
  keymap: DEFAULT_KEYMAP_ID,
  overrides: {},
}

const setting = createSyncedSetting<KeybindingsState>(
  KEYBINDINGS_STORAGE_KEY,
  DEFAULT_STATE,
)

/**
 * Coerce whatever storage/sync hands us into a usable state object.
 *
 * The input really is `unknown`: it comes back from JSON that a previous
 * version, another device, or a hand edit produced. Anything unrecognized is
 * dropped rather than trusted, so a bad payload costs you a binding, not the
 * whole keyboard.
 */
function sanitize(raw: unknown): KeybindingsState {
  const source = (raw ?? {}) as Partial<Record<keyof KeybindingsState, unknown>>
  const keymap = KEYMAPS.some((k) => k.id === source.keymap)
    ? (source.keymap as KeymapId)
    : DEFAULT_KEYMAP_ID

  const overrides: Record<string, Array<string>> = {}
  const rawOverrides =
    typeof source.overrides === 'object' && source.overrides !== null
      ? (source.overrides as Record<string, unknown>)
      : {}
  for (const [id, chords] of Object.entries(rawOverrides)) {
    if (!KEYBINDING_COMMANDS_BY_ID.has(id) || !Array.isArray(chords)) continue
    const normalized = chords
      .map((c) => (typeof c === 'string' ? normalizeChord(c) : null))
      .filter((c): c is string => c !== null)
    overrides[id] = [...new Set(normalized)]
  }
  return { keymap, overrides }
}

// ── Resolution cache ─────────────────────────────────────────────────
// Keydown handlers hit this on every keystroke, so resolution is computed once
// per state change rather than per lookup.

type Resolved = {
  state: KeybindingsState
  /** commandId → serialized chords currently in force. */
  serialized: Map<string, Array<string>>
  /** commandId → parsed chords, for matching. */
  parsed: Map<string, Array<Chord>>
  /** Normalized chord → every command bound to it (conflict source). */
  byChord: Map<string, Array<string>>
}

let cache: Resolved | null = null
const listeners = new Set<() => void>()

/** Commands that exist in this build (desktop-only ones are hidden on web). */
export function availableCommands(): Array<KeybindingCommand> {
  return KEYBINDING_COMMANDS.filter((c) => !c.desktopOnly || isStandalone)
}

function resolve(): Resolved {
  if (cache) return cache

  const state = sanitize(setting.get())
  const defaults = keymapDefaults(state.keymap)
  const serialized = new Map<string, Array<string>>()
  const parsed = new Map<string, Array<Chord>>()
  const byChord = new Map<string, Array<string>>()

  for (const command of availableCommands()) {
    const chords = state.overrides[command.id] ?? defaults[command.id] ?? []
    const normalized = chords
      .map(normalizeChord)
      .filter((c): c is string => c !== null)
    serialized.set(command.id, normalized)
    parsed.set(
      command.id,
      normalized.map(parseChord).filter((c): c is Chord => c !== null),
    )
    for (const chord of normalized) {
      const existing = byChord.get(chord)
      if (existing) existing.push(command.id)
      else byChord.set(chord, [command.id])
    }
  }

  cache = { state, serialized, parsed, byChord }
  return cache
}

/** Bumped on every change so `useSyncExternalStore` sees a new snapshot. */
let version = 0

function invalidate() {
  cache = null
  version += 1
  for (const listener of listeners) listener()
}

// Writes from this window, sibling windows, and cloud hydration all land here.
setting.subscribe(() => invalidate())

export function keybindingsVersion(): number {
  return version
}

export function subscribeKeybindings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Reads ────────────────────────────────────────────────────────────

export function getKeybindingsState(): KeybindingsState {
  return resolve().state
}

/** Serialized chords currently bound to a command. */
export function getCommandChords(commandId: string): Array<string> {
  return resolve().serialized.get(commandId) ?? []
}

/** The chords a command would have with the user's overrides removed. */
export function getCommandDefaults(commandId: string): Array<string> {
  const defaults = keymapDefaults(resolve().state.keymap)
  return (defaults[commandId] ?? [])
    .map(normalizeChord)
    .filter((c): c is string => c !== null)
}

export function isCommandCustomized(commandId: string): boolean {
  const override = resolve().state.overrides[commandId]
  if (!override) return false
  const defaults = getCommandDefaults(commandId)
  return (
    override.length !== defaults.length ||
    override.some((chord, i) => chord !== defaults[i])
  )
}

/**
 * Display label for a command's primary chord (`⌘⇧P`), or `''` when unbound —
 * what tooltips, `<Kbd>` badges and hold-⌘ hints render.
 */
export function getCommandLabel(commandId: string): string {
  const chord = resolve().parsed.get(commandId)?.[0]
  return chord ? chordLabel(chord) : ''
}

/**
 * A `1–9`-style range for the timeframe digits, for the toolbar's single hint
 * badge — spelling out eleven separate chords there would be noise.
 */
export function getTimeframeShortcutSummary(): string {
  const labels = TIMEFRAME_COMMANDS.map(({ value }) =>
    getCommandLabel(timeframeCommandId(value)),
  ).filter(Boolean)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels[0]}–${labels[labels.length - 1]}`
}

/** Every command sharing a chord with this one. */
export function getCommandConflicts(commandId: string): Array<string> {
  const { serialized, byChord } = resolve()
  const conflicts = new Set<string>()
  for (const chord of serialized.get(commandId) ?? []) {
    for (const other of byChord.get(chord) ?? []) {
      if (other !== commandId) conflicts.add(other)
    }
  }
  return [...conflicts]
}

/** Commands already using a chord, ignoring one command (the one being edited). */
export function commandsUsingChord(
  serializedChord: string,
  exceptCommandId?: string,
): Array<string> {
  const normalized = normalizeChord(serializedChord)
  if (!normalized) return []
  return (resolve().byChord.get(normalized) ?? []).filter(
    (id) => id !== exceptCommandId,
  )
}

/** Every chord bound to more than one command, for the settings summary. */
export function listConflicts(): Array<{
  chord: string
  commandIds: Array<string>
}> {
  return [...resolve().byChord.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([chord, commandIds]) => ({ chord, commandIds }))
}

/**
 * The command a keyboard event fires within a scope, or `null`.
 *
 * When a chord is double-bound the first command in catalog order wins, which
 * is exactly what the settings UI flags as a conflict — the shadowed command
 * simply never runs, rather than both running.
 */
export function matchCommand(
  e: KeyboardEvent,
  scope: KeybindingScope,
): string | null {
  const { parsed } = resolve()
  for (const command of availableCommands()) {
    if (command.scope !== scope) continue
    const chords = parsed.get(command.id)
    if (!chords?.length) continue
    for (const chord of chords) {
      if (chordMatchesEvent(chord, e)) return command.id
    }
  }
  return null
}

/** Does this event fire the given command? */
export function eventMatchesCommand(
  e: KeyboardEvent,
  commandId: string,
): boolean {
  const chords = resolve().parsed.get(commandId)
  if (!chords?.length) return false
  return chords.some((chord) => chordMatchesEvent(chord, e))
}

// ── Writes ───────────────────────────────────────────────────────────

function write(next: KeybindingsState) {
  // `createSyncedSetting.set` emits synchronously, so the subscription above
  // has already cleared the cache by the time this returns — a read right after
  // a write sees the new bindings.
  setting.set(next)
}

export function setKeymap(keymap: KeymapId) {
  write({ ...resolve().state, keymap })
}

/** Replace a command's chords. Pass `[]` to unbind it. */
export function setCommandChords(commandId: string, chords: Array<string>) {
  if (!KEYBINDING_COMMANDS_BY_ID.has(commandId)) return
  const normalized = [
    ...new Set(
      chords.map(normalizeChord).filter((c): c is string => c !== null),
    ),
  ]
  const state = resolve().state
  write({
    ...state,
    overrides: { ...state.overrides, [commandId]: normalized },
  })
}

export function addCommandChord(commandId: string, chord: string) {
  setCommandChords(commandId, [...getCommandChords(commandId), chord])
}

export function removeCommandChord(commandId: string, chord: string) {
  const normalized = normalizeChord(chord)
  setCommandChords(
    commandId,
    getCommandChords(commandId).filter((c) => c !== normalized),
  )
}

/** Drop the user's override so the command follows the active keymap again. */
export function resetCommand(commandId: string) {
  const state = resolve().state
  if (!(commandId in state.overrides)) return
  const overrides = { ...state.overrides }
  delete overrides[commandId]
  write({ ...state, overrides })
}

/** Clear every override, keeping the chosen keymap. */
export function resetAllCommands() {
  write({ ...resolve().state, overrides: {} })
}

/** Back to the shipped Pairlens keymap with no overrides at all. */
export function resetKeybindings() {
  write({ keymap: DEFAULT_KEYMAP_ID, overrides: {} })
}
