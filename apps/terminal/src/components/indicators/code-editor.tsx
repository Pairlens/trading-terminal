// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'

import { cn } from '@pairlens/ui'

import type { SdkCompletion } from '@/lib/python/sdk-completions'
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import {
  MEMBER_COMPLETIONS,
  PAIRLENS_COMPLETIONS,
  TA_COMPLETIONS,
  lookupSdkSymbol,
} from '@/lib/python/sdk-completions'

/** The entry module of a script — the only file the meta/compute contract applies to. */
const ENTRY_FILE = 'main.py'

/** Past this many parse errors the file is broken enough that more noise doesn't help. */
const MAX_SYNTAX_DIAGNOSTICS = 40

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Invoked on Cmd/Ctrl+S inside the editor. */
  onSave?: () => void
  /** Invoked on Cmd/Ctrl+Enter inside the editor. */
  onRun?: () => void
  /**
   * Path of the file being edited, e.g. `main.py` or `helpers/ema.py`. The
   * `meta`/`compute` contract warnings only fire for the entry module, so they
   * stay off until the editor is told which file it is showing.
   */
  filePath?: string
  /**
   * Receives an "insert this text at the cursor" function once the editor is
   * live, and null on unmount. Lets the SDK reference drop a snippet into the
   * buffer without the workbench reaching into CodeMirror itself.
   */
  onInsertReady?: (insert: ((text: string) => void) | null) => void
  className?: string
}

// ── SDK autocompletion ───────────────────────────────────────────────────────
// Pure helpers: they run inside CodeMirror callbacks but import nothing from
// it, so they can live at module scope alongside the SSR-safe lazy imports.

function toCompletion(entry: SdkCompletion): Completion {
  return {
    label: entry.label,
    type: entry.type,
    detail: entry.detail,
    info: entry.info,
    apply: entry.apply,
  }
}

const IDENTIFIER = /[A-Za-z0-9_]/
const FROM_PAIRLENS_IMPORT = /^\s*from\s+pairlens(\.ta)?\s+import\s+([\w\s,]*)$/
const MEMBER_ACCESS = /([A-Za-z_]\w*)\.([A-Za-z_]\w*)?$/
const TRAILING_WORD = /[A-Za-z_]\w*$/

const TOP_LEVEL_OPTIONS: Array<Completion> = [
  ...PAIRLENS_COMPLETIONS,
  ...TA_COMPLETIONS,
].map(toCompletion)
const PAIRLENS_OPTIONS: Array<Completion> =
  PAIRLENS_COMPLETIONS.map(toCompletion)
const TA_OPTIONS: Array<Completion> = TA_COMPLETIONS.map(toCompletion)
const MEMBER_OPTIONS: Record<string, Array<Completion>> = Object.fromEntries(
  Object.entries(MEMBER_COMPLETIONS).map(([name, entries]) => [
    name,
    entries.map(toCompletion),
  ]),
)

/**
 * Completes the Pairlens Python SDK: `from pairlens import ...` lists, members
 * of the namespace objects (`input.`, `ctx.`, `ta.`, ...) and bare SDK names.
 * Registered as language data rather than an `override`, so CodeMirror keeps
 * running lang-python's own local/global sources for the user's identifiers.
 */
function sdkCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)

  const fromImport = FROM_PAIRLENS_IMPORT.exec(before)
  if (fromImport) {
    const typed = TRAILING_WORD.exec(fromImport[2] ?? '')?.[0] ?? ''
    return {
      from: context.pos - typed.length,
      options: fromImport[1] ? TA_OPTIONS : PAIRLENS_OPTIONS,
      validFor: /^\w*$/,
    }
  }

  const member = MEMBER_ACCESS.exec(before)
  if (member) {
    const options =
      member[1] === 'pairlens' ? PAIRLENS_OPTIONS : MEMBER_OPTIONS[member[1]]
    if (!options) return null
    const typed = member[2] ?? ''
    return {
      from: context.pos - typed.length,
      options,
      validFor: /^\w*$/,
    }
  }

  const word = context.matchBefore(/\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return { from: word.from, options: TOP_LEVEL_OPTIONS, validFor: /^\w*$/ }
}

/**
 * The SDK symbol under `offset` in `text`, plus the exact range it spans.
 * A leading `object.` qualifies the lookup so `input.int` resolves to the
 * builder and not to Python's `int`.
 */
function sdkSymbolAt(
  text: string,
  offset: number,
): { entry: SdkCompletion; start: number; end: number } | null {
  let start = offset
  let end = offset
  while (start > 0 && IDENTIFIER.test(text[start - 1])) start--
  while (end < text.length && IDENTIFIER.test(text[end])) end++
  if (start === end) return null

  let qualifier: string | null = null
  if (start > 0 && text[start - 1] === '.') {
    let qualifierStart = start - 1
    while (qualifierStart > 0 && IDENTIFIER.test(text[qualifierStart - 1])) {
      qualifierStart--
    }
    qualifier = text.slice(qualifierStart, start - 1) || null
  }

  const entry = lookupSdkSymbol(text.slice(start, end), qualifier)
  return entry ? { entry, start, end } : null
}

/**
 * Minimal CodeMirror 6 wrapper (Python). The editor is created imperatively in
 * an effect — CodeMirror is browser-only, and the route module may still be
 * evaluated during SSR, so every `@codemirror/*` import stays inside the
 * effect (same lazy-import pattern as the plugin sandbox worker).
 *
 * On top of syntax highlighting it teaches the editor the indicator SDK:
 * completions and hover docs sourced from `lib/python/sdk-completions`, plus a
 * Lezer-tree linter that surfaces Python syntax errors as you type without
 * paying for a Pyodide round trip.
 *
 * Styling uses the app's CSS variables so the editor follows the active theme
 * (light/dark and theme plugins) without a bundled CodeMirror theme.
 */
export function CodeEditor({
  value,
  onChange,
  onSave,
  onRun,
  filePath,
  onInsertReady,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onRunRef = useRef(onRun)
  const filePathRef = useRef(filePath)
  const onInsertReadyRef = useRef(onInsertReady)
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onRunRef.current = onRun
  filePathRef.current = filePath
  onInsertReadyRef.current = onInsertReady

  useEffect(() => {
    let cancelled = false
    let view: EditorView | null = null

    void (async () => {
      const [
        { basicSetup },
        { EditorView: View, keymap, hoverTooltip },
        { Prec },
        { python, pythonLanguage },
        { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree },
        { linter },
        { tags },
      ] = await Promise.all([
        import('codemirror'),
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/lang-python'),
        import('@codemirror/language'),
        import('@codemirror/lint'),
        import('@lezer/highlight'),
      ])
      if (cancelled || !containerRef.current) return

      const theme = View.theme({
        '&': {
          height: '100%',
          fontSize: '12.5px',
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.55',
        },
        '.cm-content': { caretColor: 'var(--primary)' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--muted-foreground)',
          border: 'none',
          opacity: '0.7',
        },
        '.cm-activeLine': {
          backgroundColor:
            'color-mix(in oklch, var(--accent) 35%, transparent)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
        },
        '&.cm-focused > .cm-scroller .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
          {
            backgroundColor:
              'color-mix(in oklch, var(--primary) 22%, transparent)',
          },
        '.cm-selectionMatch': {
          backgroundColor:
            'color-mix(in oklch, var(--primary) 14%, transparent)',
        },
        '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
          backgroundColor:
            'color-mix(in oklch, var(--primary) 18%, transparent)',
          outline: 'none',
        },
        '.cm-tooltip': {
          backgroundColor: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 'calc(var(--radius) - 4px)',
        },
        '.cm-tooltip-autocomplete ul li[aria-selected]': {
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-foreground)',
        },
        // Signature + prose for SDK symbols, shared by the completion tooltip
        // and the hover card so both read the same way.
        '.cm-completionInfo, .cm-sdk-doc': {
          maxWidth: '380px',
          padding: '8px 10px',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          lineHeight: '1.55',
          color: 'var(--popover-foreground)',
        },
        '.cm-sdk-doc-signature': {
          display: 'block',
          fontFamily: 'var(--font-mono)',
          fontSize: '11.5px',
          color: 'var(--primary)',
          marginBottom: '5px',
          overflowWrap: 'anywhere',
        },
        '.cm-sdk-doc-info': {
          display: 'block',
          color: 'var(--muted-foreground)',
        },
        '.cm-panels': {
          backgroundColor: 'var(--muted)',
          color: 'var(--foreground)',
        },
      })

      // Warm Precision syntax palette: primary for keywords, the chart series
      // hues for literals — concrete colors come from the CSS variables, so
      // both themes (and theme plugins) restyle the code automatically.
      const highlight = HighlightStyle.define([
        { tag: tags.keyword, color: 'var(--primary)', fontWeight: '500' },
        {
          tag: [tags.string, tags.special(tags.string)],
          color: 'var(--chart-2)',
        },
        { tag: [tags.number, tags.bool, tags.null], color: 'var(--chart-4)' },
        {
          tag: tags.comment,
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
        },
        {
          tag: [
            tags.function(tags.variableName),
            tags.function(tags.propertyName),
          ],
          color: 'var(--chart-5)',
        },
        { tag: [tags.className, tags.typeName], color: 'var(--chart-3)' },
        { tag: tags.propertyName, color: 'var(--foreground)' },
        {
          tag: [tags.operator, tags.punctuation],
          color: 'var(--muted-foreground)',
        },
        { tag: tags.definition(tags.variableName), color: 'var(--foreground)' },
      ])

      // Hover docs for any SDK symbol under the pointer, rendered with the
      // same signature/prose pair the completion tooltip shows.
      const sdkHover = hoverTooltip((hoverView, pos, side) => {
        const line = hoverView.state.doc.lineAt(pos)
        const offset = pos - line.from
        const hit = sdkSymbolAt(line.text, offset)
        if (!hit) return null
        if (
          (hit.start === offset && side < 0) ||
          (hit.end === offset && side > 0)
        ) {
          return null
        }
        return {
          pos: line.from + hit.start,
          end: line.from + hit.end,
          above: true,
          create: () => {
            const dom = document.createElement('div')
            dom.className = 'cm-sdk-doc'
            const signature = document.createElement('span')
            signature.className = 'cm-sdk-doc-signature'
            signature.textContent = `${hit.entry.label}${hit.entry.detail ? ` ${hit.entry.detail}` : ''}`
            dom.appendChild(signature)
            if (hit.entry.info) {
              const info = document.createElement('span')
              info.className = 'cm-sdk-doc-info'
              info.textContent = hit.entry.info
              dom.appendChild(info)
            }
            return { dom }
          },
        }
      })

      // Diagnostics straight off the Lezer tree — no Python round trip, so it
      // can run while the user types. Error nodes become syntax errors; the
      // entry module additionally has to declare `meta` and `compute`.
      const sdkLinter = linter(
        (lintView) => {
          const state = lintView.state
          if (state.doc.length === 0) return []
          const diagnostics: Array<Diagnostic> = []
          const tree = syntaxTree(state)
          const seen = new Set<number>()

          tree.iterate({
            enter: (node) => {
              if (!node.type.isError) return
              if (diagnostics.length >= MAX_SYNTAX_DIAGNOSTICS) return false
              if (seen.has(node.from)) return
              seen.add(node.from)
              let from = node.from
              let to = node.to
              if (to <= from) {
                if (from < state.doc.length) to = from + 1
                else if (from > 0) from -= 1
                else return
              }
              diagnostics.push({
                from,
                to,
                severity: 'error',
                message: 'Syntax error',
              })
            },
          })

          if (filePathRef.current === ENTRY_FILE) {
            let hasMeta = false
            let hasCompute = false
            const cursor = tree.cursor()
            if (cursor.firstChild()) {
              do {
                if (cursor.name === 'AssignStatement') {
                  const target = cursor.node.firstChild
                  if (
                    target &&
                    state.doc.sliceString(target.from, target.to) === 'meta'
                  ) {
                    hasMeta = true
                  }
                } else if (cursor.name === 'FunctionDefinition') {
                  const name = cursor.node.getChild('VariableName')
                  if (
                    name &&
                    state.doc.sliceString(name.from, name.to) === 'compute'
                  ) {
                    hasCompute = true
                  }
                }
              } while (cursor.nextSibling())
            }
            const first = state.doc.line(1)
            if (!hasMeta) {
              diagnostics.push({
                from: first.from,
                to: first.to,
                severity: 'warning',
                message:
                  'main.py defines no top-level `meta = indicator(...)` — the chart has nothing to draw.',
              })
            }
            if (!hasCompute) {
              diagnostics.push({
                from: first.from,
                to: first.to,
                severity: 'warning',
                message:
                  'main.py defines no top-level `def compute(ctx)` — the script will fail to load.',
              })
            }
          }

          return diagnostics
        },
        { delay: 400 },
      )

      view = new View({
        parent: containerRef.current,
        doc: valueRef.current,
        extensions: [
          // Cmd/Ctrl+S and Cmd/Ctrl+Enter must win over the default keymap in
          // basicSetup (Mod-Enter is otherwise a plain newline).
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-s',
                run: () => {
                  onSaveRef.current?.()
                  return true
                },
              },
              {
                key: 'Mod-Enter',
                run: () => {
                  if (!onRunRef.current) return false
                  onRunRef.current()
                  return true
                },
              },
            ]),
          ),
          basicSetup,
          python(),
          pythonLanguage.data.of({ autocomplete: sdkCompletionSource }),
          sdkHover,
          sdkLinter,
          indentUnit.of('    '),
          theme,
          syntaxHighlighting(highlight),
          View.updateListener.of((update) => {
            if (update.docChanged) {
              const doc = update.state.doc.toString()
              valueRef.current = doc
              onChangeRef.current(doc)
            }
          }),
        ],
      })
      viewRef.current = view
      // Hand the workbench a way to drop text at the cursor (SDK reference
      // snippets). Replaces the selection if there is one, then focuses back.
      onInsertReadyRef.current?.((text: string) => {
        const target = viewRef.current
        if (!target) return
        const { from, to } = target.state.selection.main
        target.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        })
        target.focus()
      })
    })()

    return () => {
      cancelled = true
      onInsertReadyRef.current?.(null)
      view?.destroy()
      viewRef.current = null
    }
  }, [])

  // External value changes (script switch, template insert) replace the doc.
  useEffect(() => {
    valueRef.current = value
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn('h-full min-h-0 overflow-hidden text-left', className)}
    />
  )
}
