// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The script in the workbench, published to the assistant ──────────
//
// The workbench already hands the assistant a live bridge through the
// ServiceRegistry, which is how `update_script` writes into the editor.
// What it never published was the plain reading of the screen: which
// script, which file inside it, whether it compiles, and what the preview
// is pointed at. Those are the four things a user means by "this".

import type { IndicatorScript } from '@/stores/indicator-scripts-store'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'

export function IndicatorsAssistantSurface({
  script,
  activePath,
  files,
  dirty,
  count,
  preview,
}: {
  /** The script open in the editor, or null when none is selected. */
  script: IndicatorScript | null
  /** The file inside it that the editor is showing. */
  activePath: string
  /** Every file in the script, entry first. */
  files: Array<string>
  /** True while the editor holds unsaved buffers. */
  dirty: boolean
  count: number
  /** What the preview chart is running the script against. */
  preview: { market: string; pair: string; timeframe: string }
}) {
  useAssistantSurface({
    id: 'page:indicators',
    getPriority: () => 60,
    revision: `${script?.id ?? 'none'}:${activePath}`,
    getContext: () => {
      if (!script) {
        return {
          summary:
            count > 0
              ? `The user is in the indicator and strategy workbench with no script open. They have ${count}; list_scripts names them.`
              : 'The user is in the indicator and strategy workbench and has no scripts yet. create_script writes one.',
        }
      }

      const kind = script.meta?.strategy ? 'strategy' : 'indicator'
      return {
        summary: `The user is editing the Python ${kind} "${script.name}" (id ${script.id}), file ${activePath}. Read its source with get_script and write to the open editor with update_script.`,
        detail: {
          scriptId: script.id,
          name: script.name,
          kind,
          activeFile: activePath,
          files,
          unsavedEdits: dirty,
          // A script that will not compile is the most likely reason the
          // user is asking anything at all, so it stays in the detail.
          metaError: script.metaError,
          inputs: script.meta?.inputs.map((input) => input.key) ?? [],
          previewTarget: `${preview.pair} on ${preview.market}, ${preview.timeframe}`,
          savedScripts: count,
        },
      }
    },
    getSuggestion: () =>
      script
        ? {
            key: 'assistantDock.suggest.indicatorsScript',
            values: { name: script.name },
          }
        : { key: 'assistantDock.suggest.indicators' },
  })

  return null
}
