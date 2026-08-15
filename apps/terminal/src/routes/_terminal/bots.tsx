// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'
import { useTranslation } from 'react-i18next'

import { DesktopSurfaceNudge } from '@/components/feedback/desktop-nudge'
import { PageHeader } from '@/components/page-header'
import { lazyChunk } from '@/lib/lazy-chunk'
import { parseEntityId } from '@/lib/routing/pages'

// Lazy: the create flow pulls in the venue/pair pickers and the params
// editors, none of which the rest of the terminal needs on first paint.
const BotsPage = lazyChunk(() =>
  import('@/components/bots/bots-page').then((m) => ({
    default: m.BotsPage,
  })),
)

/**
 * `bot` is which deployment the page is showing, written on every selection
 * so the address names the bot the user is watching.
 *
 * `create` deep-links into the create flow with a strategy preselected —
 * the workbench's "Deploy as bot" button sends the user here. It is consumed
 * once and stripped, because a cancelled dialog should stay cancelled.
 */
type BotsSearch = {
  bot?: string
  create?: string
}

export const Route = createFileRoute('/_terminal/bots')({
  component: BotsRoute,
  validateSearch: (search: Record<string, unknown>): BotsSearch => ({
    bot: parseEntityId(search.bot),
    create: typeof search.create === 'string' ? search.create : undefined,
  }),
})

function BotsRoute() {
  const { t } = useTranslation()
  const { bot, create } = Route.useSearch()
  return (
    <SidebarInset className="overflow-hidden">
      {/* Browser build only, once per device: a bot runs in this tab, and a
          browser throttles then suspends the tab you are not looking at. */}
      <DesktopSurfaceNudge surface="bots" />
      <PageHeader>
        <Bot className="size-4" />
        <h1 className="text-sm font-semibold">{t('nav.bots')}</h1>
      </PageHeader>

      {/* Explicit height = viewport minus header. No flex chain needed. */}
      <div className="overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('botsPage.loading')}
            </div>
          }
        >
          <BotsPage botId={bot ?? null} deployScriptId={create ?? null} />
        </Suspense>
      </div>
    </SidebarInset>
  )
}
