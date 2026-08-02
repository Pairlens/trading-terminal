// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'

import type { PythonLogLevel } from '@/lib/python/protocol'
import type { ConsoleLine } from '@/hooks/use-python-console'
import { ERROR_LEVELS } from '@/hooks/use-python-console'

/** Text color per severity — `log.*` levels read differently from raw output. */
const LEVEL_CLASS: Record<PythonLogLevel, string> = {
  stdout: 'text-foreground/80',
  stderr: 'text-destructive',
  info: 'text-foreground/80',
  warning: 'text-[--color-chart-4]',
  error: 'text-destructive',
}

/** Prefix shown for leveled lines; bare print() gets none. */
const LEVEL_PREFIX: Partial<Record<PythonLogLevel, string>> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
}

type ConsolePanelProps = {
  lines: Array<ConsoleLine>
  open: boolean
  onOpenChange: (open: boolean) => void
  onClear: () => void
}

/**
 * Everything the script printed. Scripts run in a Web Worker, so `print()`
 * never reaches the browser devtools console — this panel is the only way to
 * see it.
 */
export function ConsolePanel({
  lines,
  open,
  onOpenChange,
  onClear,
}: ConsolePanelProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  // Follow the tail, unless the user scrolled up to read something.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [lines, open])

  const errorCount = lines.reduce(
    (n, line) => (ERROR_LEVELS.has(line.level) ? n + 1 : n),
    0,
  )

  return (
    <div className="flex shrink-0 flex-col border-t border-border">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
        >
          <Terminal className="size-3.5" />
          {t('indicatorsPage.console')}
          {lines.length > 0 && (
            <span
              className={cn(
                'rounded-full px-1.5 py-px font-mono text-[10px]',
                errorCount > 0
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {lines.length}
            </span>
          )}
          {open ? (
            <ChevronDown className="ml-auto size-3.5" />
          ) : (
            <ChevronUp className="ml-auto size-3.5" />
          )}
        </button>
        {open && lines.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={onClear}
            aria-label={t('indicatorsPage.consoleClear')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            pinnedRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-32 overflow-y-auto border-t border-border bg-muted/20 px-3 py-2"
        >
          {lines.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground/70">
              {t('indicatorsPage.consoleEmpty')}
            </p>
          ) : (
            lines.map((line) => (
              <pre
                key={line.id}
                className={cn(
                  'whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed',
                  LEVEL_CLASS[line.level],
                )}
              >
                {LEVEL_PREFIX[line.level] && (
                  <span className="mr-1.5 opacity-60">
                    {LEVEL_PREFIX[line.level]}
                  </span>
                )}
                {line.text}
              </pre>
            ))
          )}
        </div>
      )}
    </div>
  )
}
