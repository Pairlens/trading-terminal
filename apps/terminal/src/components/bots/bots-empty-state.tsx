// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the bots surface shows before the first deployment exists.
 *
 * Same three states as the other builders: not hydrated yet (blank), bots
 * exist but none is selected (a one-line nudge), otherwise the full panel.
 *
 * The "runs on this machine" caveat moved into the footnote. It still has to
 * be read once, before the first bot exists — it just no longer needs a box of
 * its own now that the panel has somewhere to put small print.
 */
import { useCallback, useMemo, useState } from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StarterEmptyState } from '../starter-empty-state'
import { applyBotTemplate, botTemplates } from './bot-templates'
import type { StarterTemplate } from '../starter-empty-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useBotsStore } from '@/stores/bots-store'

export function BotsEmptyState({
  onCreate,
  onCreated,
}: {
  /** Open the ordinary create dialog — the "skip the templates" hatch. */
  onCreate: () => void
  /** Select the bot a template just produced. */
  onCreated: (botId: string) => void
}) {
  const { t } = useTranslation()
  const bots = useBotsStore((s) => s.bots)
  const loaded = useBotsStore((s) => s.loaded)
  const { defaultMarket } = useAvailableMarkets()

  const [pendingId, setPendingId] = useState<string | null>(null)

  const templates = useMemo(() => botTemplates(t), [t])

  const handlePick = useCallback(
    (picked: StarterTemplate) => {
      const full = templates.find((candidate) => candidate.id === picked.id)
      if (!full || pendingId) return
      setPendingId(full.id)
      // Booting Python and reading the script's metadata is the slow part;
      // the card spins through it rather than the page going blank.
      applyBotTemplate(full, { market: defaultMarket })
        .then(onCreated)
        .catch((err: unknown) => {
          toast.error(t('botsPage.templateFailed'), {
            description: err instanceof Error ? err.message : String(err),
          })
        })
        .finally(() => setPendingId(null))
    },
    [t, templates, defaultMarket, onCreated, pendingId],
  )

  if (!loaded) return <div className="flex-1" />

  if (bots.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t('botsPage.pickBot')}
      </div>
    )
  }

  return (
    <StarterEmptyState
      eyebrow={t('nav.bots')}
      title={t('botsPage.emptyHeadline')}
      description={t('botsPage.emptyDescription')}
      icon={Bot}
      templates={templates}
      onPickTemplate={handlePick}
      pendingId={pendingId}
      // Same label the create dialog gives this group, so the shelf and the
      // dialog visibly offer the same thing.
      shelfLabel={t('botsPage.groupTemplates')}
      blankLabel={t('botsPage.newBot')}
      onCreateBlank={onCreate}
      // The "runs on this machine" caveat, in the one slot the panel has for
      // small print. It has to be read once, before the first bot exists.
      footnote={t('botsPage.localBody')}
    />
  )
}
