// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── What the assistant actually did ──────────────────────────────────
//
// One turn runs up to 28 steps and the SDK merges them all into a single
// assistant message, so a real run arrives as thirty-odd sibling tool
// parts. Rendered one chip per part that is more than a panel-height of
// near-identical pills, and every one of them was a dead end: the chip
// said "read the market snapshot" and nothing said which venue, on what
// timeframe, or what came back.
//
// So consecutive calls collapse into one group. It stays open while the
// run is working, because watching it work is the point, and folds to a
// summary once it is done. Each call opens to its arguments and its
// result, which is the only way to answer "why did it say that".

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type { NormalizedToolPart } from '@/components/copilot/tool-part'
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import { formatToolLabel } from '@/lib/copilot/tool-labels'

/** Longest JSON we will paste into a chat bubble. */
const DETAIL_LIMIT = 2000

export type AssistantToolActivityProps = {
  /** A run of consecutive tool parts, in call order. */
  tools: Array<NormalizedToolPart>
  toolLabels?: ToolLabelMap
}

export function AssistantToolActivity({
  tools,
  toolLabels,
}: AssistantToolActivityProps) {
  const { t } = useTranslation()
  const running = tools.some((tool) => !isSettled(tool))
  const failed = tools.filter((tool) => tool.state === 'output-error').length

  const [open, setOpen] = useState(running)
  const touchedRef = useRef(false)
  useEffect(() => {
    if (touchedRef.current) return
    setOpen(running)
  }, [running])

  // A single call is not a group. Giving one chip a "1 tool" header and a
  // disclosure of its own would be two rows to say what one row says.
  if (tools.length === 1) {
    return <ToolRow tool={tools[0]} toolLabels={toolLabels} />
  }

  return (
    <div className="ai-tile w-full min-w-0 rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          touchedRef.current = true
          setOpen((value) => !value)
        }}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px]"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        {running ? (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        ) : failed > 0 ? (
          <AlertCircle className="text-down size-3 shrink-0" />
        ) : (
          <span className="bg-up/80 size-1.5 shrink-0 rounded-full" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {running
            ? formatToolLabel(
                lastRunning(tools)?.toolName ?? '',
                'running',
                toolLabels,
              )
            : t('copilot.toolsUsed', { count: tools.length })}
        </span>
        {!running && failed > 0 ? (
          <span className="text-down shrink-0">
            {t('copilot.toolsFailed', { count: failed })}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-1 border-t border-[var(--ai-edge-soft)] p-1.5">
          {tools.map((tool, index) => (
            <ToolRow
              key={tool.toolCallId ?? `${tool.toolName}-${index}`}
              tool={tool}
              toolLabels={toolLabels}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ToolRow({
  tool,
  toolLabels,
  nested = false,
}: {
  tool: NormalizedToolPart
  toolLabels?: ToolLabelMap
  nested?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const isError = tool.state === 'output-error'
  const settled = isSettled(tool)
  const input = preview(tool.input)
  const output = preview(tool.output)
  const errorText = isError ? (tool.errorText ?? t('copilot.toolFailed')) : null
  const canExpand = Boolean(input || output)

  const label = (
    <>
      {isError ? (
        <AlertCircle className="size-3 shrink-0" />
      ) : settled ? (
        <span className="bg-up/80 size-1.5 shrink-0 rounded-full" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {formatToolLabel(
          tool.toolName,
          isError ? 'error' : settled ? 'done' : 'running',
          toolLabels,
        )}
        {errorText ? `: ${errorText}` : ''}
      </span>
    </>
  )

  const rowClass = cn(
    'flex w-full min-w-0 items-center gap-1.5 px-2.5 py-1 text-left text-[11px]',
    nested ? 'rounded-lg' : 'rounded-full',
    isError
      ? 'border-down/40 text-down bg-down/10 border'
      : nested
        ? 'text-muted-foreground hover:bg-[var(--ai-inset-strong)]'
        : 'ai-tile text-muted-foreground',
  )

  if (!canExpand) {
    return <div className={rowClass}>{label}</div>
  }

  return (
    <div className={nested ? 'min-w-0' : 'w-full min-w-0'}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(rowClass, !nested && 'cursor-pointer')}
      >
        {label}
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-60" />
        )}
      </button>

      {open ? (
        <div className="mt-1 flex flex-col gap-1.5 px-1">
          {input ? (
            <Detail label={t('copilot.toolInput')} body={input} />
          ) : null}
          {output ? (
            <Detail label={t('copilot.toolOutput')} body={output} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, body }: { label: string; body: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-0.5 text-[10px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <pre className="max-h-48 overflow-auto rounded-lg bg-[var(--ai-inset-strong)] p-2 font-mono text-[10px] leading-relaxed">
        {body}
      </pre>
    </div>
  )
}

/** Terminal states. Anything else is still in flight. */
function isSettled(tool: NormalizedToolPart): boolean {
  return tool.state === 'output-available' || tool.state === 'output-error'
}

function lastRunning(
  tools: Array<NormalizedToolPart>,
): NormalizedToolPart | null {
  for (let i = tools.length - 1; i >= 0; i--) {
    if (!isSettled(tools[i])) return tools[i]
  }
  return null
}

/**
 * A tool result is model-shaped, not user-shaped: a market snapshot is
 * kilobytes of numbers. Show the head of it and stop — this is a "what did
 * it see" affordance, not a data viewer.
 */
function preview(value: unknown): string | null {
  if (value === undefined || value === null) return null
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    return null
  }
  if (!text || text === '{}') return null
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}\n…` : text
}
