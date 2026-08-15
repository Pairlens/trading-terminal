// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bot picker: every deployment in one narrow column, so switching between
 * bots costs a click and the whole main area stays devoted to one of them.
 *
 * Deliberately the same shape as the indicator workbench's script list — the
 * two surfaces are the same job (pick one of mine, work on it), and a user who
 * has learned one should not have to learn the other.
 */
import { useEffect, useState } from 'react'
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Input } from '@pairlens/ui/components/ui/input'
import { Switch } from '@pairlens/ui/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import {
  MASTER_DETAIL_LIST_CLASS,
  MASTER_DETAIL_LIST_HEADER_CLASS,
} from '../master-detail'
import { KeepAwakeToggle } from './keep-awake-toggle'
import {
  TONE_FILL,
  TONE_SELECTED,
  requestBotToggle,
  rowTone,
} from './bot-display'

import type { BotDefinition } from '@pairlens/bot-engine/types'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { isScriptMissing } from '@/lib/bots/bot-script-link'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

type BotListProps = {
  selectedId: string | null
  onSelect: (id: string) => void
  /** Opens the create flow — the list owns the button, the page owns the dialog. */
  onCreate: () => void
  /** Arming a live bot is the page's dialog, not something a row decides. */
  onRequestArm: (bot: BotDefinition) => void
  /** Toggles the builder-assistant rail the page hosts. */
  onToggleAssistant?: () => void
  assistantOpen?: boolean
}

/** Pick a name that doesn't collide with an existing bot ("EMA cross 2", ...). */
function uniqueName(base: string, bots: Array<BotDefinition>): string {
  const names = new Set(bots.map((bot) => bot.name))
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export function BotList({
  selectedId,
  onSelect,
  onCreate,
  onRequestArm,
  onToggleAssistant,
  assistantOpen = false,
}: BotListProps) {
  const { t } = useTranslation()
  const bots = useBotsStore((s) => s.bots)
  const updateBot = useBotsStore((s) => s.updateBot)
  const deleteBot = useBotsStore((s) => s.deleteBot)
  const duplicateBot = useBotsStore((s) => s.duplicateBot)
  const stopAll = useBotsStore((s) => s.stopAll)
  const setEnabled = useBotsStore((s) => s.setEnabled)
  const resetRun = useBotRunsStore((s) => s.resetRun)
  const { markets } = useAvailableMarkets()

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (renameId) {
      setRenameName(bots.find((bot) => bot.id === renameId)?.name ?? '')
    }
  }, [renameId, bots])

  const runningCount = bots.filter((bot) => bot.enabled).length
  const deleteTarget = bots.find((bot) => bot.id === deleteId)

  const handleRename = () => {
    if (!renameId || !renameName.trim()) return
    updateBot(renameId, { name: renameName.trim() })
    setRenameId(null)
  }

  const handleDuplicate = (bot: BotDefinition) => {
    const id = duplicateBot(bot.id, uniqueName(bot.name, bots))
    if (id) onSelect(id)
  }

  return (
    <div className={MASTER_DETAIL_LIST_CLASS}>
      <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
        <span className="text-xs font-semibold uppercase tracking-wider">
          {t('botsPage.sidebarTitle')}
        </span>
        <div className="flex items-center gap-0.5">
          {onToggleAssistant && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={assistantOpen ? 'secondary' : 'ghost'}
                    size="icon"
                    className="size-6"
                    onClick={onToggleAssistant}
                    aria-label={t('assistant.title')}
                  />
                }
              >
                <Sparkles
                  className="size-3.5"
                  style={{ color: 'var(--magic-1)' }}
                />
              </TooltipTrigger>
              <TooltipContent>{t('assistant.title')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={onCreate}
                  aria-label={t('botsPage.newBot')}
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t('botsPage.newBot')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {bots.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('botsPage.sidebarEmpty')}
          </p>
        )}
        {bots.map((bot) => (
          <BotRow
            key={bot.id}
            bot={bot}
            selected={bot.id === selectedId}
            venueLabel={
              markets.find((m) => m.value === bot.market)?.label ??
              bot.market.toUpperCase()
            }
            onSelect={() => onSelect(bot.id)}
            onRename={() => setRenameId(bot.id)}
            onDuplicate={() => handleDuplicate(bot)}
            onDelete={() => setDeleteId(bot.id)}
            setEnabled={setEnabled}
            onRequestArm={() => onRequestArm(bot)}
          />
        ))}
      </div>

      <div className="grid gap-2 border-t border-border p-2">
        {/* The remedy sits with the constraint it answers: bots only run while
            this machine is awake, and this is the switch that keeps it so. */}
        <KeepAwakeToggle armed={runningCount > 0} compact />
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {t('botsPage.summary', {
              total: bots.length,
              running: runningCount,
            })}
          </span>
          {/* Kill switch: always mounted, never behind a confirm. Turning bots
              off can only ever make the situation safer, and a confirm step is
              exactly what you don't want mid-panic. */}
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7 shrink-0 gap-1.5 text-xs"
            disabled={runningCount === 0}
            onClick={() => {
              stopAll()
              toast.success(t('botsPage.stopAllDone'))
            }}
          >
            <Power className="size-3" />
            {t('botsPage.stopAll')}
          </Button>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameId}
        onOpenChange={(open) => !open && setRenameId(null)}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('botsPage.renameTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t('botsPage.namePlaceholder')}
            className="h-8 text-sm"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              {t('botsPage.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('botsPage.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('botsPage.deleteDescription', {
                name: deleteTarget?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteId) {
                  // The run log is a record of THIS bot; nothing else can read
                  // it once the definition is gone, so it goes too.
                  deleteBot(deleteId)
                  resetRun(deleteId)
                }
                setDeleteId(null)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type BotRowProps = {
  bot: BotDefinition
  selected: boolean
  venueLabel: string
  onSelect: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  setEnabled: (id: string, enabled: boolean) => void
  onRequestArm: () => void
}

function BotRow({
  bot,
  selected,
  venueLabel,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  setEnabled,
  onRequestArm,
}: BotRowProps) {
  const { t } = useTranslation()
  // A primitive selector, not `getRun()`: the runtime replaces the whole runs
  // map on every bar, and reading a status string means only the rows whose
  // status actually moved re-render (and nothing allocates per snapshot).
  const status = useBotRunsStore((s) => s.runs[bot.id]?.status) ?? 'stopped'
  // A boolean, not the script record: this row only asks whether the strategy
  // still exists, and selecting the object would re-render every row whenever
  // anything about any script changed.
  const scriptMissing = useIndicatorScriptsStore((s) =>
    isScriptMissing(s, bot.scriptId),
  )
  const isLive = bot.mode === 'live'
  const tone = rowTone(status, bot.needsRearm === true, scriptMissing)
  // Colour alone can't carry a state — it is invisible to a good few readers
  // and ambiguous to everyone at a glance. States that need doing something
  // about therefore say so in words; running and stopped don't need to,
  // because the switch beside them already says which one it is.
  const flag = scriptMissing
    ? { text: t('botsPage.scriptMissing'), className: 'text-destructive' }
    : bot.needsRearm === true
      ? { text: t('botsPage.rearm'), className: 'text-amber-500' }
      : status === 'error'
        ? { text: t('botsPage.statusError'), className: 'text-destructive' }
        : status === 'halted'
          ? { text: t('botsPage.statusHalted'), className: 'text-amber-500' }
          : status === 'warming-up'
            ? {
                text: t('botsPage.statusWarmingUp'),
                className: 'text-muted-foreground',
              }
            : null

  // Arming is refused rather than merely ignored: the switch says so before it
  // is touched, and `requestBotToggle` refuses again behind it.
  const toggle = (
    <Switch
      size="sm"
      checked={bot.enabled}
      disabled={scriptMissing}
      onCheckedChange={(next) =>
        requestBotToggle({ ...bot, scriptMissing }, next === true, {
          setEnabled,
          requestArm: onRequestArm,
        })
      }
      aria-label={t('botsPage.toggleAria', { name: bot.name })}
      className={cn('shrink-0', bot.enabled && 'data-checked:bg-up')}
    />
  )

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        // Selection is a ring, state is a fill: the two are independent facts,
        // so they must not compete for the same channel.
        TONE_FILL[tone],
        selected && TONE_SELECTED[tone],
      )}
    >
      {/* A real button, not a clickable div: this is the row's primary action
          and it has to be reachable by keyboard. The per-row menu stays a
          sibling rather than a child, since a button cannot nest a button.

          Both lines carry an explicit line-height so the controls opposite can
          be pinned to the same two heights. Every row then lands on the same
          grid whatever its name, venue or state happens to be — the layout
          must not rearrange itself per entry. */}
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="block h-5 truncate text-sm leading-5">{bot.name}</span>
        <span className="flex h-4 min-w-0 items-center gap-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
          <span className="truncate">
            {venueLabel} · {bot.pair} · {bot.timeframe}
          </span>
          {flag && (
            <span className={cn('shrink-0 font-sans', flag.className)}>
              {flag.text}
            </span>
          )}
        </span>
      </button>

      {/* Controls stack to mirror the two text lines: arming beside the name,
          the mode label beside the venue. Both slots keep their height whether
          or not anything is in them, so rows never jostle. */}
      <div className="flex shrink-0 flex-col items-end">
        <div className="flex h-5 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  // Reserved space, not conditional rendering: revealing the
                  // menu on hover must not shove the switch sideways.
                  className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('botsPage.botActions')}
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="size-3.5" />
                {t('botsPage.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="size-3.5" />
                {t('botsPage.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Arming lives in the list because the list is where you scan:
              deciding which bots should be on is a comparison between them,
              and walking into each one's detail to make it defeats the point.
              Same rule as everywhere — a live bot routes through the dialog.

              A disabled switch swallows its own pointer events, so the reason
              it is dead has to be hung on a wrapper or it never appears. */}
          {scriptMissing ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                {toggle}
              </TooltipTrigger>
              <TooltipContent>
                {t('botsPage.scriptMissingTitle')}
              </TooltipContent>
            </Tooltip>
          ) : (
            toggle
          )}
        </div>
        <div className="flex h-4 items-center">
          {/* Overriding the height too, not just the text: the base badge is
              `h-5`, which the 16px slot was squashing rather than sizing. The
              mode is a footnote next to the venue, not a headline. */}
          <Badge
            variant={isLive ? 'destructive' : 'secondary'}
            className="h-3.5 shrink-0 px-1 py-0 text-[8px] uppercase leading-none tracking-wide"
          >
            {isLive ? t('botsPage.modeLive') : t('botsPage.modePaper')}
          </Badge>
        </div>
      </div>
    </div>
  )
}
