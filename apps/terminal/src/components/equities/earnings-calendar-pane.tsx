// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Who reports, and when.
 *
 * Shipped as the real frame with an honest body: no installed connector serves
 * an earnings feed. A broker publishes the schedule of its own VENUE (the
 * clock and the trading calendar, which the session panes do read) and knows
 * nothing about who reports on Thursday, so the pane says which kind of plugin
 * would fill it rather than pretending the feed is merely slow.
 *
 * The column set is not decoration: it is the contract in
 * `lib/equities/calendar-types.ts`, on screen, so a provider author can see
 * what the pane will render before writing a line of it.
 */
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PaneEmpty, Th } from '@/components/panes/pane-primitives'

export function EarningsCalendarPane() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[13px] font-semibold">
          {t('earningsCalendar.title')}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {t('earningsCalendar.subtitle')}
        </span>
      </div>

      <table className="w-full shrink-0 px-3 text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <Th>{t('earningsCalendar.columns.symbol')}</Th>
            <Th>{t('earningsCalendar.columns.when')}</Th>
            <Th align="right">{t('earningsCalendar.columns.epsEstimate')}</Th>
            <Th align="right">
              {t('earningsCalendar.columns.revenueEstimate')}
            </Th>
            <Th align="right">{t('earningsCalendar.columns.impliedMove')}</Th>
          </tr>
        </thead>
      </table>

      <div className="min-h-0 flex-1">
        <PaneEmpty
          body={t('earningsCalendar.emptyBody')}
          icon={CalendarDays}
          title={t('earningsCalendar.emptyTitle')}
        />
      </div>
    </div>
  )
}
