// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Bot,
  CandlestickChart,
  CircleCheck,
  Cloud,
  CloudOff,
  LayoutGrid,
  NotebookPen,
  Puzzle,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@pairlens/ui/components/ui/switch'

import type { SyncDomainId } from '@/lib/sync/sync-domains'
import { SYNC_DOMAINS } from '@/lib/sync/sync-domains'
import {
  setCloudSyncEnabled,
  setDomainSyncEnabled,
} from '@/lib/sync/sync-preferences'
import { useCloudSyncPreferences, useSyncStatus } from '@/hooks/use-cloud-sync'
import { useOptimisticSession } from '@/lib/session'
import { track } from '@/lib/analytics-events'

/**
 * Cloud Sync — what this device is willing to put in the account.
 *
 * The copy carries as much weight as the switches. Turning something off never
 * deletes the copy already in the account, it just stops updating it; turning
 * it back on merges rather than picking a winner; and two of these domains have
 * no local store at all, so off there means "not recorded", which the row has
 * to say out loud rather than imply.
 */

const DOMAIN_ICONS: Record<SyncDomainId, typeof Puzzle> = {
  preferences: SlidersHorizontal,
  charts: CandlestickChart,
  workspaces: LayoutGrid,
  automation: Workflow,
  plugins: Puzzle,
  copilot: Bot,
  trades: NotebookPen,
}

export function CloudSyncSection() {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const preferences = useCloudSyncPreferences()

  // The nav entry is hidden without an App Server, so the only way to land
  // here with nothing to sync is being signed out.
  if (!session) {
    return (
      <div className="max-w-4xl space-y-5">
        <section className="rounded-xl border border-dashed p-5">
          <div className="flex items-start gap-3">
            <CloudOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="font-medium">
                {t('settings.cloudSync.signedOutTitle')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.cloudSync.signedOut')}
              </p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const master = preferences.enabled

  const onMasterChange = (enabled: boolean) => {
    setCloudSyncEnabled(enabled)
    track('cloud_sync_toggled', { domain: 'all', enabled })
  }

  const onDomainChange = (id: SyncDomainId, enabled: boolean) => {
    setDomainSyncEnabled(id, enabled)
    track('cloud_sync_toggled', { domain: id, enabled })
  }

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium">
              {t('settings.cloudSync.masterTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.cloudSync.masterDescription')}
            </p>
          </div>
          <Switch checked={master} onCheckedChange={onMasterChange} />
        </div>
        <SyncStatusLine paused={!master} />
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.cloudSync.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.cloudSync.description')}
        </p>

        <div className="mt-4 space-y-2">
          {SYNC_DOMAINS.map((domain) => {
            const Icon = DOMAIN_ICONS[domain.id]
            const on = preferences.domains[domain.id] !== false
            return (
              <div
                key={domain.id}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                  master ? '' : 'opacity-50'
                }`}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(domain.labelKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(domain.descriptionKey)}
                  </p>
                  {/* Shown whether the row is on or off: the point is to warn
                    before the switch is flipped, not to explain afterwards. */}
                  {domain.cloudOnly ? (
                    <p
                      className={`mt-1.5 flex items-start gap-1.5 text-xs ${
                        !on && master
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span>{t('settings.cloudSync.cloudOnlyWarning')}</span>
                    </p>
                  ) : null}
                  {/* Only meaningful while the row is off — it describes what
                    deletions do NOT reach while syncing is paused. */}
                  {domain.caveatKey && !on && master ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span>{t(domain.caveatKey)}</span>
                    </p>
                  ) : null}
                </div>
                <Switch
                  className="mt-0.5"
                  checked={on}
                  disabled={!master}
                  onCheckedChange={(next) => onDomainChange(domain.id, next)}
                />
              </div>
            )
          })}
        </div>

        <div className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
          <p>{t('settings.cloudSync.deviceOnly')}</p>
          <p>{t('settings.cloudSync.nothingDeleted')}</p>
          <p>{t('settings.cloudSync.resumeNote')}</p>
        </div>
      </section>
    </div>
  )
}

/**
 * What the transport is doing right now. Paused wins over the last status:
 * "Synced" under a switch the user just turned off would read as a promise
 * that it is still keeping up.
 */
function SyncStatusLine({ paused }: { paused: boolean }) {
  const { t } = useTranslation()
  const status = useSyncStatus()

  if (paused) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CloudOff className="size-3.5 shrink-0" />
        {t('settings.cloudSync.pausedNotice')}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <TriangleAlert className="size-3.5 shrink-0" />
        {t('settings.cloudSync.status.error')}
      </p>
    )
  }

  if (status === 'syncing') {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5 shrink-0 animate-spin" />
        {t('settings.cloudSync.status.syncing')}
      </p>
    )
  }

  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      {status === 'synced' ? (
        <CircleCheck className="size-3.5 shrink-0" />
      ) : (
        <Cloud className="size-3.5 shrink-0" />
      )}
      {status === 'synced'
        ? t('settings.cloudSync.status.synced')
        : t('settings.cloudSync.status.idle')}
    </p>
  )
}
