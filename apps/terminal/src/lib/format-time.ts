// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import i18n from '@/lib/i18n'

/** Format an ISO date as a coarse relative time ("just now", "5m ago", "3h ago", "2d ago"). */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return i18n.t('time.daysAgo', { n: days })
}
