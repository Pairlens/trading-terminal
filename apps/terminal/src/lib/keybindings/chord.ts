// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

/**
 * Chord parsing, matching and display for user-customizable keybindings.
 *
 * A chord is one key plus its modifiers, serialized as a stable, portable
 * string (`Mod+Shift+P`, `Alt+1`, `Escape`) so bindings survive a round trip
 * through localStorage, cloud sync, and an export/import of the whole keymap.
 *
 * Two deliberate choices:
 *
 * 1. `Mod` is ⌘ on Apple hardware and Ctrl everywhere else — the same "primary
 *    modifier" convention Tauri accelerators (`CmdOrCtrl+N`) and every editor
 *    use, so one stored keymap reads correctly on every platform. A literal
 *    `Ctrl` chord is only representable on Apple; off Apple it folds into
 *    `Mod`, because there it IS Mod and keeping both would let a keymap define
 *    two commands on physically identical chords.
 *
 * 2. Matching keys off `event.code` (physical key) rather than `event.key`.
 *    macOS composes Option chords into other characters (⌥T → †), so `e.key`
 *    is useless for Alt bindings; `e.code` is stable. Layout-dependent keys
 *    fall back to `e.key` when the code is one we don't map.
 */

const isApplePlatform =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** `⌘` on Apple, `Ctrl+` elsewhere — the primary modifier's display form. */
export const modKeySymbol = isApplePlatform ? '⌘' : 'Ctrl+'

/** `⌥` on Apple, `Alt+` elsewhere. */
export const altKeySymbol = isApplePlatform ? '⌥' : 'Alt+'

export type Chord = {
  /** Canonical key token: `A`–`Z`, `0`–`9`, `F1`–`F12`, `Escape`, `[`, … */
  key: string
  /** ⌘ on Apple, Ctrl elsewhere. */
  mod: boolean
  alt: boolean
  shift: boolean
  /** Literal Control. Apple only — folded into `mod` on other platforms. */
  ctrl: boolean
}

/** Modifier keys never form a chord on their own. */
const BARE_MODIFIERS = new Set([
  'Meta',
  'Control',
  'Alt',
  'Shift',
  'CapsLock',
  'AltGraph',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
])

/** `event.code` → canonical key token, for codes that aren't self-describing. */
const CODE_TO_KEY: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
  NumpadEnter: 'Enter',
}

/** Key tokens whose display form differs from the token itself. */
const KEY_SYMBOLS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  Tab: '⇥',
  Space: '␣',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
}

/** Named keys accepted by `parseChord`, mapped to their canonical spelling. */
const NAMED_KEYS = new Map<string, string>(
  [
    'Escape',
    'Enter',
    'Tab',
    'Space',
    'Backspace',
    'Delete',
    'Insert',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ].map((k) => [k.toLowerCase(), k]),
)

function canonicalKeyToken(raw: string): string | null {
  const token = raw.trim()
  if (!token) return null

  const named = NAMED_KEYS.get(token.toLowerCase())
  if (named) return named

  // Aliases people (and other apps' keymaps) actually write.
  switch (token.toLowerCase()) {
    case 'esc':
      return 'Escape'
    case 'return':
      return 'Enter'
    case 'up':
      return 'ArrowUp'
    case 'down':
      return 'ArrowDown'
    case 'left':
      return 'ArrowLeft'
    case 'right':
      return 'ArrowRight'
    case 'del':
      return 'Delete'
    case 'pgup':
      return 'PageUp'
    case 'pgdn':
      return 'PageDown'
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) return token.toUpperCase()
  if (/^[a-z]$/i.test(token)) return token.toUpperCase()
  if (/^[0-9]$/.test(token)) return token
  // Single printable punctuation (`[`, `,`, `/`, …).
  if (token.length === 1) return token

  return null
}

/**
 * Parse a serialized chord. Returns `null` for anything unparseable so a
 * corrupted or hand-edited keymap degrades to "unbound" instead of throwing.
 */
export function parseChord(serialized: string): Chord | null {
  const parts = serialized.split('+').map((p) => p.trim())
  // A trailing `+` means the key IS "+" (e.g. `Mod++`).
  if (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.pop()
    parts[parts.length - 1] = '+'
  }

  const keyToken = parts.pop()
  if (!keyToken) return null

  const chord: Chord = {
    key: '',
    mod: false,
    alt: false,
    shift: false,
    ctrl: false,
  }

  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
      case 'cmd':
      case 'command':
      case 'meta':
      case 'cmdorctrl':
      case 'commandorcontrol':
        chord.mod = true
        break
      case 'ctrl':
      case 'control':
        // Off Apple, Ctrl IS the primary modifier — collapse the two so a
        // keymap can't bind `Ctrl+K` and `Mod+K` to different commands there.
        if (isApplePlatform) chord.ctrl = true
        else chord.mod = true
        break
      case 'alt':
      case 'option':
      case 'opt':
        chord.alt = true
        break
      case 'shift':
        chord.shift = true
        break
      default:
        return null
    }
  }

  const key = canonicalKeyToken(keyToken)
  if (!key) return null
  chord.key = key
  return chord
}

/** Serialize a chord back to its canonical, storable form. */
export function formatChord(chord: Chord): string {
  const parts: Array<string> = []
  if (chord.mod) parts.push('Mod')
  if (chord.ctrl) parts.push('Ctrl')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  parts.push(chord.key)
  return parts.join('+')
}

/** Normalize a serialized chord (`cmd+shift+p` → `Mod+Shift+P`). */
export function normalizeChord(serialized: string): string | null {
  const chord = parseChord(serialized)
  return chord ? formatChord(chord) : null
}

/** Human-facing label: `⌘⇧P` on Apple, `Ctrl+Shift+P` elsewhere. */
export function chordLabel(chord: Chord): string {
  const key = KEY_SYMBOLS[chord.key] ?? chord.key
  if (isApplePlatform) {
    return `${chord.ctrl ? '⌃' : ''}${chord.alt ? '⌥' : ''}${
      chord.shift ? '⇧' : ''
    }${chord.mod ? '⌘' : ''}${key}`
  }
  const parts: Array<string> = []
  if (chord.mod) parts.push('Ctrl')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** Label a serialized chord, or `''` when it can't be parsed. */
export function labelForSerializedChord(serialized: string): string {
  const chord = parseChord(serialized)
  return chord ? chordLabel(chord) : ''
}

/** The canonical key token a keyboard event resolves to, or `null`. */
function keyTokenFromEvent(e: KeyboardEvent): string | null {
  const code = e.code

  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (NAMED_KEYS.has(code.toLowerCase())) return code
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code]

  // Unmapped physical key (non-US layouts, media keys): fall back to the
  // produced character, which is at least meaningful without Alt in play.
  if (e.key.length === 1) return e.key.toUpperCase()
  if (NAMED_KEYS.has(e.key.toLowerCase())) return NAMED_KEYS.get(e.key)!
  return null
}

/**
 * Build the chord a keyboard event represents, or `null` when the event is a
 * bare modifier press (which is what the recorder waits through).
 */
export function chordFromEvent(e: KeyboardEvent): Chord | null {
  if (BARE_MODIFIERS.has(e.key)) return null
  const key = keyTokenFromEvent(e)
  if (!key) return null
  return {
    key,
    mod: isApplePlatform ? e.metaKey : e.ctrlKey,
    ctrl: isApplePlatform ? e.ctrlKey : false,
    alt: e.altKey,
    shift: e.shiftKey,
  }
}

/** Does this event fire the given chord? Modifiers must match exactly. */
export function chordMatchesEvent(chord: Chord, e: KeyboardEvent): boolean {
  const pressed = chordFromEvent(e)
  if (!pressed) return false
  return (
    pressed.key === chord.key &&
    pressed.mod === chord.mod &&
    pressed.ctrl === chord.ctrl &&
    pressed.alt === chord.alt &&
    pressed.shift === chord.shift
  )
}

/**
 * A chord the OS or browser will eat before the app sees it, or that would
 * leave the user unable to type. Surfaced as a warning in the editor rather
 * than a hard block — power users on Linux/Windows have different reserved
 * sets, and we'd rather not pretend to know theirs.
 */
export function isRiskyChord(chord: Chord): boolean {
  const bare = !chord.mod && !chord.alt && !chord.ctrl
  // A bare letter/digit is fine (chart panes use them) but a bare modifier-less
  // Tab or Enter breaks focus handling and form submission everywhere.
  if (bare && (chord.key === 'Tab' || chord.key === 'Enter')) return true
  if (chord.key === 'F5' && bare) return true
  if (chord.mod && !chord.alt && !chord.shift) {
    // Chords the browser/webview reliably claims for itself.
    return ['W', 'Q', 'R', 'T', 'N'].includes(chord.key) && !isApplePlatform
  }
  return false
}

/** Convert a chord to a Tauri accelerator string (`CmdOrCtrl+Shift+N`). */
export function chordToAccelerator(chord: Chord): string | null {
  const parts: Array<string> = []
  if (chord.mod) parts.push('CmdOrCtrl')
  if (chord.ctrl) parts.push('Control')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')

  const key = chord.key
  if (/^[A-Z0-9]$/.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    parts.push(key)
  } else if (NAMED_KEYS.has(key.toLowerCase())) {
    parts.push(key)
  } else if (key.length === 1) {
    parts.push(key)
  } else {
    return null
  }
  return parts.join('+')
}

export const isApple = isApplePlatform
