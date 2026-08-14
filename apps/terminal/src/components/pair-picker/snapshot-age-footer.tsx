// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Snapshot staleness, shown ONCE as a list footer and only when the server
 * snapshot backing the venue badges is more than a day old. No per-row
 * staleness noise; nothing at all while the snapshot is fresh or absent
 * (absence is "unknown", which the badges already express by omission).
 * Shared by both shells (mobile imports from the app, never the reverse).
 */
import { useTranslation } from 'react-i18next'
import { getLocalInstrumentIndex } from '@/lib/instruments/local-index'
import { useLocalIndexVersion } from '@/lib/instruments/use-local-index'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export function SnapshotAgeFooter({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation()
  useLocalIndexVersion()
  if (!visible) return null
  const builtAt = getLocalInstrumentIndex()?.snapshotBuiltAt
  if (!builtAt || Date.now() - builtAt < STALE_AFTER_MS) return null
  const date = new Date(builtAt).toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
  })
  return (
    <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground/70">
      {t('search.staleListings', { date })}
    </div>
  )
}
