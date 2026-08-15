// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'

import { ArmLiveDialog } from './arm-live-dialog'
import { BotDetail } from './bot-detail'
import { BotList } from './bot-list'
import { BotsEmptyState } from './bots-empty-state'
import { CreateBotDialog } from './create-bot-dialog'

import type { BotDefinition } from '@pairlens/bot-engine/types'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import {
  hasAssistantIntent,
  subscribeAssistantIntents,
} from '@/lib/assistant/assistant-chat-cache'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'
import { usePersistedState } from '@/hooks/use-persisted-state'

/**
 * The bots surface, as master-detail: the deployments down the left, one bot's
 * whole life in the middle.
 *
 * Same shell as the indicator workbench, for the same reason — a bot's ledger,
 * event log and settings are dense enough that they need the room, and picking
 * a different bot should never cost more than a click.
 */
export function BotsPage({
  deployScriptId = null,
}: {
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
  // Open by default, like the workbench: building a bot from nothing is a
  // conversation (which strategy, which market, how big), and the rail is
  // where that happens. Persisted, so closing it sticks.
  const [assistantOpen, setAssistantOpen] = usePersistedState<boolean>(
    'assistant.bots.open',
    true,
  )

  // The empty state's composer, or a handoff arriving from the workbench.
  // The panel consumes the request; this makes sure it is mounted to do so.
  useEffect(() => {
    const open = () => {
      if (hasAssistantIntent('bots')) setAssistantOpen(true)
    }
    open()
    return subscribeAssistantIntents(open)
  }, [setAssistantOpen])

  useEffect(() => {
    loadBots()
    loadRuns()
    loadScripts()
  }, [loadBots, loadRuns, loadScripts])

  // Arriving from the workbench's "Deploy as bot": open the create flow with
  // that strategy already picked, then drop the param from the URL so a
  // cancelled dialog stays cancelled.
  useEffect(() => {
    if (!deployScriptId) return
    setCreateScriptId(deployScriptId)
    setCreateOpen(true)
    void navigate({ to: '/bots', search: {}, replace: true })
  }, [deployScriptId, navigate])

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
        onToggleAssistant={() => setAssistantOpen(!assistantOpen)}
        assistantOpen={assistantOpen}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="bots-main" defaultSize={72} minSize={40}>
          <div className="flex h-full min-w-0 flex-1 flex-col">
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
                onStartAssistant={() => setAssistantOpen(true)}
              />
            )}
          </div>
        </ResizablePanel>
        {assistantOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel id="bots-assistant" defaultSize={28} minSize={18}>
              <AssistantPanel
                surface="bots"
                onClose={() => setAssistantOpen(false)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

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
