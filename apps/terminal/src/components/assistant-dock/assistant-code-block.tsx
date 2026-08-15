// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Code the assistant wrote ─────────────────────────────────────────
//
// The three script tools only exist while the workbench is mounted, so
// everywhere else in the terminal an indicator or a strategy arrives as a
// markdown fence in the chat. That rendered as an unstyled <pre>: no
// language, no way to copy it, and no way to get it into the editor
// except selecting forty lines of Python inside a scrolling panel.
//
// Open in workbench is the action that matters. It writes the block into
// a real script and opens it, so "write me a squeeze indicator" ends on
// the chart instead of on the clipboard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, SquareFunction } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'
import { track } from '@/lib/analytics-events'

/** Languages we will offer to open in the Python workbench. */
const PYTHON = new Set(['python', 'py'])

export type AssistantCodeBlockProps = {
  code: string
  /** Fence language, lower-cased, or null for a bare fence. */
  language: string | null
}

export function AssistantCodeBlock({
  code,
  language,
}: AssistantCodeBlockProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createScript = useIndicatorScriptsStore((state) => state.createScript)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(() => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        track('assistant_code_copied', { language: language ?? 'none' })
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        // No clipboard permission. Nothing useful to say about it here.
      })
  }, [code, language])

  const openInWorkbench = useCallback(() => {
    const id = createScript(
      scriptName(code, t('indicatorsPage.blankName')),
      code,
    )
    track('assistant_code_opened_in_workbench')
    navigate({ to: '/indicators', search: { script: id } })
  }, [code, createScript, navigate, t])

  const isPython = language != null && PYTHON.has(language)

  return (
    <div className="my-2.5 overflow-hidden rounded-xl bg-[var(--ai-inset-strong)]">
      <div className="flex items-center gap-1 py-1 pr-1 pl-2.5">
        <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[10px] tracking-wide uppercase">
          {language ?? ''}
        </span>
        {isPython ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-6 gap-1 rounded-md px-1.5 text-[10px]"
            onClick={openInWorkbench}
          >
            <SquareFunction className="size-3" />
            {t('copilot.openInWorkbench')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground size-6 rounded-md"
          aria-label={
            copied ? t('copilot.messageCopied') : t('copilot.copyCode')
          }
          onClick={copy}
        >
          {copied ? (
            <Check className="text-up size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto px-2.5 pb-2.5">
        <code className="font-mono text-[11px] leading-relaxed">{code}</code>
      </pre>
    </div>
  )
}

/**
 * Name the script after the title the SDK's own `indicator(...)` call
 * declares, which is what the workbench sidebar will show. A block that
 * carries no title falls back to the workbench's own blank-script name
 * rather than inventing a second one.
 */
function scriptName(code: string, fallback: string): string {
  const match = code.match(/title\s*=\s*['"]([^'"]{1,60})['"]/)
  return match?.[1]?.trim() || fallback
}
