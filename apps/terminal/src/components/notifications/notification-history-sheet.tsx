// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Everything the alerts have ever told you, back to the 200-entry cap.
 *
 * The bell shows the last handful because that is what fits above a chart;
 * this is where "See all" goes. Grouped by day, because the question people
 * bring here is "did it fire while I was away", and a flat list of relative
 * timestamps answers that badly.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@pairlens/ui/components/ui/sheet'

import { NotificationActivityRow } from './notification-activity'

import type { NotificationLogEntry } from '@/lib/notifications/notification-runtime'
import { useNotificationLogStore } from '@/stores/notification-log-store'

type DayGroup = {
  key: string
  label: string
  entries: Array<NotificationLogEntry>
}

/** Midnight-relative day label: Today, Yesterday, then the date itself. */
function dayLabel(timestamp: number, t: (key: string) => string): string {
  const day = new Date(timestamp)
  const today = new Date()
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(day)) / 86_400_000)
  if (diffDays === 0) return t('time.today')
  if (diffDays === 1) return t('time.yesterday')
  return day.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

export function NotificationHistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const entries = useNotificationLogStore((s) => s.entries)
  const seenAt = useNotificationLogStore((s) => s.seenAt)
  const clear = useNotificationLogStore((s) => s.clear)

  const groups = useMemo<Array<DayGroup>>(() => {
    const byDay = new Map<string, Array<NotificationLogEntry>>()
    for (const entry of entries) {
      const day = new Date(entry.timestamp)
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
      const list = byDay.get(key) ?? []
      list.push(entry)
      byDay.set(key, list)
    }
    return [...byDay.entries()].map(([key, list]) => ({
      key,
      label: dayLabel(list[0].timestamp, t),
      entries: list,
    }))
  }, [entries, t])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bell className="size-4" />
            {t('notifications.bell.historyTitle')}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t('notifications.bell.historyDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {groups.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {t('notifications.builder.sidebar.noActivity')}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.key} className="mb-3">
              <div className="sticky top-0 z-10 bg-background/95 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
                {group.label}
              </div>
              {group.entries.map((entry) => (
                <NotificationActivityRow
                  key={entry.id}
                  entry={entry}
                  unread={entry.timestamp > seenAt}
                />
              ))}
            </div>
          ))}
        </div>

        {entries.length > 0 && (
          <div className="border-t border-border p-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px] text-muted-foreground"
              onClick={clear}
            >
              {t('notifications.builder.sidebar.clearActivity')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
