// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { ArmLiveDialog } from './arm-live-dialog'
import { BotDetail } from './bot-detail'
import { BotList } from './bot-list'
import { BotsAssistantSurface } from './bots-assistant-surface'
import { BotsEmptyState } from './bots-empty-state'
import { CreateBotDialog } from './create-bot-dialog'

import type { BotDefinition } from '@pairlens/bot-engine/types'
import { PAGE_COLUMN_FLUSH, PAGE_GROUND } from '@/components/chrome/page-chrome'
import { useSearchSelection } from '@/hooks/use-search-selection'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

/**
 * The bots surface, as master-detail: the deployments down the left, one bot's
 * whole life in the middle.
 *
 * Same shell as the indicator workbench, for the same reason — a bot's ledger,
 * event log and settings are dense enough that they need the room, and picking
 * a different bot should never cost more than a click.
 *
 * Which bot that is lives in the URL (`?bot=<id>`), so the address always names
 * the deployment on screen.
 */
export function BotsPage({
  botId = null,
  deployScriptId = null,
}: {
  /** The bot the URL is naming, already validated by the route. */
  botId?: string | null
  /**
   * Strategy script arriving from the workbench's "Deploy as bot" — opens
   * the create dialog with it preselected. Consumed once: the URL is cleaned
   * so closing the dialog doesn't resurrect it.
   */
  deployScriptId?: string | null
} = {}) {
  const navigate = useNavigate()
  const bots = useBotsStore((s) => s.bots)
  const loaded = useBotsStore((s) => s.loaded)
  const loadBots = useBotsStore((s) => s.load)
  const loadRuns = useBotRunsStore((s) => s.load)
  // Every bot names a script, and this page reports the ones whose script is
  // gone. Reading that off an unloaded store would call every bot orphaned.
  const loadScripts = useIndicatorScriptsStore((s) => s.load)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createScriptId, setCreateScriptId] = useState<string | null>(null)
  const [armTarget, setArmTarget] = useState<BotDefinition | null>(null)

  useEffect(() => {
    loadBots()
    loadRuns()
    loadScripts()
  }, [loadBots, loadRuns, loadScripts])

  // Arriving from the workbench's "Deploy as bot": open the create flow with
  // that strategy already picked, then drop the param from the URL so a
  // cancelled dialog stays cancelled. Only that param — `bot` is the record
  // of what is on screen and has to survive.
  useEffect(() => {
    if (!deployScriptId) return
    setCreateScriptId(deployScriptId)
    setCreateOpen(true)
    void navigate({
      to: '/bots',
      search: (prev) => ({ ...prev, create: undefined }),
      replace: true,
    })
  }, [deployScriptId, navigate])

  // Auto-select the first bot, and re-select after a delete: an empty main
  // area while bots exist reads as "nothing here" when there plainly is.
  useEffect(() => {
    if (!loaded) return
    if (selectedId && bots.some((bot) => bot.id === selectedId)) return
    setSelectedId(bots[0]?.id ?? null)
  }, [loaded, bots, selectedId])

  const select = useCallback((id: string) => {
    if (!useBotsStore.getState().bots.some((bot) => bot.id === id)) return false
    setSelectedId(id)
    return true
  }, [])

  const write = useCallback(
    (id: string | null, { replace }: { replace: boolean }) => {
      void navigate({
        to: '/bots',
        search: (prev) => ({ ...prev, bot: id ?? undefined }),
        replace,
      })
    },
    [navigate],
  )

  useSearchSelection({
    param: botId,
    selected: selectedId,
    select,
    write,
    ready: loaded,
  })

  const selected = bots.find((bot) => bot.id === selectedId) ?? null

  // The arm dialog holds a snapshot; re-read it so a rename or a mode change
  // made elsewhere doesn't get confirmed against stale text.
  const armBot = armTarget
    ? (bots.find((bot) => bot.id === armTarget.id) ?? null)
    : null

  return (
    <div className={PAGE_GROUND}>
      <BotsAssistantSurface bot={selected} count={bots.length} />
      <BotList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={() => setCreateOpen(true)}
        onRequestArm={setArmTarget}
      />

      <div className={`flex-1 ${PAGE_COLUMN_FLUSH}`}>
        {selected ? (
          <BotDetail
            key={selected.id}
            bot={selected}
            onRequestArm={setArmTarget}
          />
        ) : (
          <BotsEmptyState
            onCreate={() => setCreateOpen(true)}
            onCreated={setSelectedId}
          />
        )}
      </div>

      <CreateBotDialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next)
          // A plain "New bot" afterwards should start from nothing.
          if (!next) setCreateScriptId(null)
        }}
        onCreated={setSelectedId}
        initialScriptId={createScriptId}
      />

      <ArmLiveDialog
        bot={armBot}
        onOpenChange={(open) => !open && setArmTarget(null)}
        onArmed={setSelectedId}
      />
    </div>
  )
}
