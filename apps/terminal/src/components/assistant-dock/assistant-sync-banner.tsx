// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Asking once about cloud sync ─────────────────────────────────────
//
// Conversations are written to this device and stay there unless the user
// says otherwise. This is where they are asked, in the rail, next to the
// threads the question is about.
//
// It asks exactly once. The `assistant` sync domain is the only one with
// three states rather than two: no entry at all means nobody has been
// asked, and that is the only state this renders in. Either button writes
// an explicit boolean, so the banner is gone for good and the answer is
// then a switch in Settings like every other domain.
//
// Signed out there is nothing to offer, so it does not render at all
// rather than showing a sign-in pitch: the rail is for finding a thread,
// and an account is not needed to have one.

import { useTranslation } from 'react-i18next'
import { Cloud } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'

import type { AssistantRailSurface } from './assistant-conversation-list'
import { track } from '@/lib/analytics-events'
import { useCloudSyncPreferences } from '@/hooks/use-cloud-sync'
import { setDomainSyncEnabled } from '@/lib/sync/sync-preferences'
import { useOptimisticSession } from '@/lib/session'

export function AssistantSyncBanner({
  surface = 'dock',
}: {
  surface?: AssistantRailSurface
}) {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  // Subscribed rather than read once: answering has to make this disappear
  // in the same tick, and in every window at that.
  const preferences = useCloudSyncPreferences()

  // No account, no question. Also covers standalone builds, where
  // `useOptimisticSession` reports null and there is no server to sync to.
  if (!session) return null
  if (preferences.domains.assistant !== undefined) return null

  const answer = (enabled: boolean) => {
    setDomainSyncEnabled('assistant', enabled)
    track('assistant_sync_choice', { enabled, surface })
  }

  return (
    <div className="ai-tile mx-2 mb-2 flex shrink-0 flex-col gap-2 rounded-xl p-2.5">
      <div className="flex items-start gap-2">
        <Cloud
          className="mt-0.5 size-3.5 shrink-0"
          style={{ color: 'var(--magic-1)' }}
        />
        <div className="min-w-0">
          <p className="text-[11px] leading-snug font-medium">
            {t('assistantDock.conversations.syncTitle')}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
            {t('assistantDock.conversations.syncDescription')}
          </p>
        </div>
      </div>
      {/* Stacked, and each label free to wrap. The rail leaves the tile
          about 150px: a row of two buttons reads fine in English and
          breaks in half the catalogue, and even full-width a single line
          clips the longer Slavic and Romance labels. */}
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          className="h-auto min-h-6 w-full rounded-full px-2 py-1 text-[11px] leading-tight whitespace-normal"
          onClick={() => answer(true)}
        >
          {t('assistantDock.conversations.syncEnable')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-auto min-h-6 w-full rounded-full px-2 py-1 text-[11px] leading-tight whitespace-normal"
          onClick={() => answer(false)}
        >
          {t('assistantDock.conversations.syncDecline')}
        </Button>
      </div>
      {/* Says where the decision lives afterwards, so declining does not
          read as closing the door. */}
      <p className="text-muted-foreground/70 text-[10px] leading-snug">
        {t('assistantDock.conversations.syncChangeLater')}
      </p>
    </div>
  )
}
