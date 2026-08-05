// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, House, RefreshCw } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import type { ErrorComponentProps } from '@tanstack/react-router'

/**
 * The last stop for a render error anywhere in the app.
 *
 * Without it the router falls back to its own unstyled panel, which offers no
 * way out: a route that throws on every render (a bad persisted layout, a
 * provider that went missing) reappears identically on reload, and the user is
 * stuck with a white page. So the three escapes that actually work are here —
 * re-render, hard reload, and a full document load of the home board, which is
 * the only one that also drops whatever in-memory state poisoned the tree.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  const [showDetails, setShowDetails] = useState(false)
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty className="max-w-lg">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle className="size-5" />
          </EmptyMedia>
          <EmptyTitle>{t('routes.crash.title')}</EmptyTitle>
          <EmptyDescription>{t('routes.crash.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" className="gap-2" onClick={reset}>
              <RefreshCw className="size-4" />
              {t('common.retry')}
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-4" />
              {t('routes.crash.reload')}
            </Button>
            <Button
              className="gap-2"
              onClick={() => window.location.assign('/')}
            >
              <House className="size-4" />
              {t('routes.goHome')}
            </Button>
          </div>
          <button
            type="button"
            className="mt-4 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {t('routes.crash.details')}
          </button>
          {showDetails && (
            <pre className="mt-2 max-h-56 w-full overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {message}
              {error instanceof Error && error.stack
                ? `\n\n${error.stack}`
                : ''}
            </pre>
          )}
        </EmptyContent>
      </Empty>
    </div>
  )
}
