// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Macro releases by the clock.
 *
 * The frame is real, the body is honest. Nothing serves a macro feed here: a
 * broker's calendar covers its own sessions, not CPI, and the App Server's
 * fundamentals provider publishes company filings and earnings dates with no
 * forward macro calendar behind them. So this pane keeps the seam the earnings
 * pane just outgrew: it names the kind of provider that fills it and shows the
 * columns such a provider must produce (`EconCalendarEvent` in
 * `lib/equities/calendar-types.ts`).
 *
 * Release times ride the wire as instants, never as a wall clock: '08:30' is
 * only a time if you already know which city, and this pane is read from every
 * one of them.
 */
import { CalendarRange } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PaneEmpty, Th } from '@/components/panes/pane-primitives'

export function EconomicCalendarPane() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <table className="w-full shrink-0 px-3 text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <Th>{t('economicCalendar.columns.time')}</Th>
            <Th>{t('economicCalendar.columns.event')}</Th>
            <Th align="right">{t('economicCalendar.columns.actual')}</Th>
            <Th align="right">{t('economicCalendar.columns.consensus')}</Th>
            <Th align="right">{t('economicCalendar.columns.prior')}</Th>
          </tr>
        </thead>
      </table>

      <div className="min-h-0 flex-1">
        <PaneEmpty
          body={t('economicCalendar.emptyBody')}
          icon={CalendarRange}
          title={t('economicCalendar.emptyTitle')}
        />
      </div>
    </div>
  )
}
