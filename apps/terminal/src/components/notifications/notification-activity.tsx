// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What already fired, rendered the same way everywhere it is shown.
 *
 * Three surfaces read this log — the bell's Activity tab, the full-history
 * sheet behind its "See all", and the Activity tab on the Notifications
 * page — and they used to be one implementation and two copies waiting to
 * happen. A row is the whole story of one firing: which rule, what it said,
 * where it was sent, and whether any of those deliveries failed.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { NotificationLogEntry } from '@/lib/notifications/notification-runtime'
import { formatRelativeTime } from '@/lib/format-time'

export const SEVERITY_DOT: Record<NotificationLogEntry['severity'], string> = {
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

/**
 * A failed delivery is the only thing here worth interrupting for: the alert
 * fired and the user was not told, which from their side is indistinguishable
 * from the market never moving.
 */
export function NotificationActivityRow({
  entry,
  compact = false,
  unread = false,
}: {
  entry: NotificationLogEntry
  /** Drops the channel line — the bell has ~300px to work with. */
  compact?: boolean
  unread?: boolean
}) {
  const { t } = useTranslation()
  const failures = entry.deliveries?.filter((d) => !d.ok) ?? []

  return (
    <div
      className={cn(
        'rounded-md px-2 py-1.5 transition-colors hover:bg-muted',
        unread && 'bg-primary/[0.05]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            SEVERITY_DOT[entry.severity],
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {entry.title}
        </span>
        <span className="shrink-0 text-[9px] text-muted-foreground">
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>
      <p
        className={cn(
          'mt-0.5 pl-3 text-[11px] text-muted-foreground',
          compact ? 'truncate' : 'text-pretty',
        )}
      >
        {entry.body}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-3">
        {!compact && (
          <span className="text-[9px] text-muted-foreground">
            {entry.ruleName} · {entry.channels.join(', ')}
          </span>
        )}
        {failures.map((failure) => (
          <span
            key={failure.channel}
            className="rounded bg-red-500/10 px-1 text-[9px] text-red-600 dark:text-red-400"
            title={failure.error}
          >
            {t('notifications.builder.sidebar.channelFailed', {
              channel: failure.channel,
            })}
          </span>
        ))}
      </div>
    </div>
  )
}

export function NotificationActivityList({
  entries,
  compact = false,
  unreadSince,
  emptyLabel,
  className,
}: {
  entries: Array<NotificationLogEntry>
  compact?: boolean
  /** Entries newer than this are marked as not-yet-seen. */
  unreadSince?: number
  emptyLabel: string
  className?: string
}) {
  if (entries.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className={className}>
      {entries.map((entry) => (
        <NotificationActivityRow
          key={entry.id}
          entry={entry}
          compact={compact}
          unread={unreadSince !== undefined && entry.timestamp > unreadSince}
        />
      ))}
    </div>
  )
}
