// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'

import { ArmLiveDialog } from './arm-live-dialog'
import { BotDetail } from './bot-detail'
import { BotList } from './bot-list'
import { BotsEmptyState } from './bots-empty-state'
import { CreateBotDialog } from './create-bot-dialog'

import type { BotDefinition } from '@pairlens/bot-engine/types'
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
 */
export function BotsPage() {
  const bots = useBotsStore((s) => s.bots)
  const loaded = useBotsStore((s) => s.loaded)
  const loadBots = useBotsStore((s) => s.load)
  const loadRuns = useBotRunsStore((s) => s.load)
  // Every bot names a script, and this page reports the ones whose script is
  // gone. Reading that off an unloaded store would call every bot orphaned.
  const loadScripts = useIndicatorScriptsStore((s) => s.load)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [armTarget, setArmTarget] = useState<BotDefinition | null>(null)

  useEffect(() => {
    loadBots()
    loadRuns()
    loadScripts()
  }, [loadBots, loadRuns, loadScripts])

  // Auto-select the first bot, and re-select after a delete: an empty main
  // area while bots exist reads as "nothing here" when there plainly is.
  useEffect(() => {
    if (!loaded) return
    if (selectedId && bots.some((bot) => bot.id === selectedId)) return
    setSelectedId(bots[0]?.id ?? null)
  }, [loaded, bots, selectedId])

  const selected = bots.find((bot) => bot.id === selectedId) ?? null

  // The arm dialog holds a snapshot; re-read it so a rename or a mode change
  // made elsewhere doesn't get confirmed against stale text.
  const armBot = armTarget
    ? (bots.find((bot) => bot.id === armTarget.id) ?? null)
    : null

  return (
    <div className="flex h-full min-h-0">
      <BotList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={() => setCreateOpen(true)}
        onRequestArm={setArmTarget}
      />

      <div className="flex min-w-0 flex-1 flex-col">
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
        onOpenChange={setCreateOpen}
        onCreated={setSelectedId}
      />

      <ArmLiveDialog
        bot={armBot}
        onOpenChange={(open) => !open && setArmTarget(null)}
        onArmed={setSelectedId}
      />
    </div>
  )
}
