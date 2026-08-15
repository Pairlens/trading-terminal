// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import i18n from '@/lib/i18n'

/** Format an ISO date or epoch-ms as a coarse relative time ("just now", "5m ago", "3h ago", "2d ago"). */
export function formatRelativeTime(when: string | number): string {
  const diff = Date.now() - new Date(when).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return i18n.t('time.daysAgo', { n: days })
}

/**
 * The mirror, forwards: how long until a deadline ("in 5m", "in 3h", "in 2d").
 *
 * A prediction market's close is the one number that changes what a price
 * MEANS — 60¢ a month out and 60¢ an hour out are different bets — so the
 * event cards and the positions rows both read it. A deadline in the past
 * returns the closed reading rather than a negative one.
 */
export function formatTimeUntil(when: string | number): string {
  const diff = new Date(when).getTime() - Date.now()
  if (!Number.isFinite(diff)) return ''
  if (diff <= 0) return i18n.t('time.closed')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return i18n.t('time.inMinutes', { n: Math.max(1, minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t('time.inHours', { n: hours })
  return i18n.t('time.inDays', { n: Math.floor(hours / 24) })
}
