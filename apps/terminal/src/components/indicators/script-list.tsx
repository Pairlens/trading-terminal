// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Bot,
  Download,
  FileCode2,
  FilePlus2,
  History,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Sparkles,
  SquareFunction,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import {
  MASTER_DETAIL_LIST_CLASS,
  MASTER_DETAIL_LIST_HEADER_CLASS,
} from '../master-detail'

import type {
  IndicatorModule,
  IndicatorScript,
} from '@/stores/indicator-scripts-store'
import { BLANK_SCRIPT, EXAMPLE_SCRIPTS } from '@/lib/python/examples'
import { askAssistant } from '@/stores/assistant-store'
import { botsUsingScript } from '@/lib/bots/bot-script-link'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

type ScriptListProps = {
  selectedId: string | null
  onSelect: (id: string) => void
  onExport: (script: IndicatorScript) => void
  /** Open the version log for one script. */
  onShowHistory: (script: IndicatorScript) => void
  /** Open the import/fork dialog. */
  onImport: () => void
}

/**
 * The row's leading glyph. It answers "what is this?" — strategy, indicator, or
 * a draft that hasn't run yet and so hasn't declared itself. Health rides along
 * as tint rather than as a second glyph: a script whose last run failed is rare
 * and worth a colour, whereas the healthy state was previously a green dot on
 * nearly every row, which is a lot of pixels spent saying "normal".
 */
function KindIcon({ script }: { script: IndicatorScript }) {
  const { t } = useTranslation()
  const kind = !script.meta
    ? 'draft'
    : script.meta.strategy
      ? 'strategy'
      : 'indicator'
  const failed = script.metaError !== null
  const Icon =
    kind === 'strategy'
      ? Bot
      : kind === 'indicator'
        ? SquareFunction
        : FileCode2

  const kindLabel =
    kind === 'strategy'
      ? t('indicatorsPage.kindStrategy')
      : kind === 'indicator'
        ? t('indicatorsPage.kindIndicator')
        : t('indicatorsPage.kindDraft')
  const healthLabel = failed
    ? t('indicatorsPage.statusError')
    : kind === 'draft'
      ? t('indicatorsPage.neverRun')
      : t('indicatorsPage.statusReady')

  const label = `${kindLabel} · ${healthLabel}`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Icon
            aria-label={label}
            // Healthy icons inherit the row's own colour so they brighten with
            // it on hover and selection; only a failure overrides that.
            className={cn('size-3.5 shrink-0', failed && 'text-destructive')}
          />
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Pick a name that doesn't collide with existing scripts ("RSI 2", ...). */
function uniqueName(base: string, scripts: Array<IndicatorScript>): string {
  const names = new Set(scripts.map((s) => s.name))
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export function ScriptList({
  selectedId,
  onSelect,
  onExport,
  onShowHistory,
  onImport,
}: ScriptListProps) {
  const { t } = useTranslation()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const createScript = useIndicatorScriptsStore((s) => s.createScript)
  const updateScript = useIndicatorScriptsStore((s) => s.updateScript)
  const deleteScript = useIndicatorScriptsStore((s) => s.deleteScript)
  // Deleting a script is not a private act: bots are deployments OF a script,
  // and one that outlives its strategy can neither run nor be restarted.
  const bots = useBotsStore((s) => s.bots)
  const loadBots = useBotsStore((s) => s.load)
  const deleteBot = useBotsStore((s) => s.deleteBot)
  const resetRun = useBotRunsStore((s) => s.resetRun)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // The bots store is loaded by whichever window runs the runtime; this page
  // may be another one, and an unloaded store would report no bots at all.
  useEffect(() => {
    loadBots()
  }, [loadBots])

  useEffect(() => {
    if (renameId) {
      setRenameName(scripts.find((s) => s.id === renameId)?.name ?? '')
    }
  }, [renameId, scripts])

  const handleCreate = (
    templateName: string,
    source: string,
    modules?: Array<IndicatorModule>,
  ) => {
    const id = createScript(uniqueName(templateName, scripts), source, modules)
    onSelect(id)
  }

  const handleRename = () => {
    if (!renameId || !renameName.trim()) return
    updateScript(renameId, { name: renameName.trim() })
    setRenameId(null)
  }

  const deleteTarget = scripts.find((s) => s.id === deleteId)
  const deleteBots = deleteId ? botsUsingScript(bots, deleteId) : []

  /**
   * Deleting a script takes its bots with it, always — the alternative is a
   * deployment pointing at nothing, which keeps running until its next bar
   * close and can never be started again.
   *
   * Bots go first: the runtime reconciles off that store, so removing them is
   * what actually stops them, and doing it in this order means there is never
   * an instant where a live bot's strategy has already gone.
   */
  const handleDelete = () => {
    if (!deleteId) return
    for (const bot of deleteBots) {
      deleteBot(bot.id)
      resetRun(bot.id)
    }
    deleteScript(deleteId)
    setDeleteId(null)
    // The bots live on another page: without this, the consequence of the
    // confirmation happens entirely off screen.
    if (deleteBots.length > 0) {
      toast.success(
        t('indicatorsPage.deleteBotsDone', { count: deleteBots.length }),
      )
    }
  }

  return (
    <div className={MASTER_DETAIL_LIST_CLASS}>
      <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
        <span className="text-xs font-semibold uppercase tracking-wider">
          {t('indicatorsPage.scripts')}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t('indicatorsPage.newIndicator')}
              />
            }
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* First in the create menu because "describe it" is the fastest
                of the three ways to a script, and a menu that only offered
                blank files and templates hid that. */}
            <DropdownMenuItem
              onClick={() =>
                askAssistant(t('assistantDock.suggest.indicators'))
              }
            >
              <Sparkles
                className="size-3.5"
                style={{ color: 'var(--magic-1)' }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{t('assistant.buildWithAi')}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {t('assistant.buildWithAiHint')}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                handleCreate(t('indicatorsPage.blankName'), BLANK_SCRIPT)
              }
            >
              <FilePlus2 className="size-3.5" />
              {t('indicatorsPage.startFromScratch')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImport}>
              <Download className="size-3.5" />
              {t('indicatorsPage.importTitle')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Grouped by kind: a flat list left users unable to tell which
                templates could actually be deployed as a bot. */}
            {(['indicator', 'strategy'] as const).map((kind) => (
              <DropdownMenuGroup key={kind}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {kind === 'strategy'
                    ? t('indicatorsPage.templatesStrategies')
                    : t('indicatorsPage.templatesIndicators')}
                </DropdownMenuLabel>
                {EXAMPLE_SCRIPTS.filter((e) => e.kind === kind).map(
                  (example) => (
                    <DropdownMenuItem
                      key={example.name}
                      onClick={() =>
                        handleCreate(
                          example.name,
                          example.source,
                          example.modules,
                        )
                      }
                    >
                      {kind === 'strategy' ? (
                        <Bot className="size-3.5" />
                      ) : (
                        <SquareFunction className="size-3.5" />
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{example.name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {example.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {scripts.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('indicatorsPage.sidebarEmpty')}
          </p>
        )}
        {scripts.map((script) => (
          <div
            key={script.id}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
              selectedId === script.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => onSelect(script.id)}
          >
            <KindIcon script={script} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{script.name}</div>
              {/* The kind leads the subtitle because it is the one property
                  that decides what the script can DO — only a strategy can be
                  deployed as a bot, and there was previously nothing on screen
                  that said which kind you were looking at. */}
              <div className="truncate text-[10px] text-muted-foreground">
                {!script.meta
                  ? t('indicatorsPage.kindDraft')
                  : script.meta.strategy
                    ? t('indicatorsPage.kindStrategy')
                    : t('indicatorsPage.kindIndicator')}
                {' · '}
                {t('indicatorsPage.updated', {
                  time: formatDistanceToNow(script.updatedAt, {
                    addSuffix: true,
                  }),
                })}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('indicatorsPage.scriptActions')}
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={() => setRenameId(script.id)}>
                  <Pencil className="size-3.5" />
                  {t('indicatorsPage.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onShowHistory(script)}>
                  <History className="size-3.5" />
                  {t('indicatorsPage.versionHistory')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!script.meta}
                  onClick={() => onExport(script)}
                >
                  <Package className="size-3.5" />
                  {t('indicatorsPage.export')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteId(script.id)}
                >
                  <Trash2 className="size-3.5" />
                  {t('indicatorsPage.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameId}
        onOpenChange={(open) => !open && setRenameId(null)}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('indicatorsPage.renameTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t('indicatorsPage.namePlaceholder')}
            className="h-8 text-sm"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>
              {t('indicatorsPage.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              {t('indicatorsPage.rename')}
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
            <AlertDialogTitle>
              {deleteBots.length > 0
                ? t('indicatorsPage.deleteBotsTitle')
                : t('indicatorsPage.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBots.length > 0
                ? t('indicatorsPage.deleteBotsDescription', {
                    name: deleteTarget?.name ?? '',
                    count: deleteBots.length,
                  })
                : t('indicatorsPage.deleteDescription', {
                    name: deleteTarget?.name ?? '',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Named, not counted: "2 bots" is not enough to decide with when one
              of them might be the live one. Outside the description because a
              list cannot live inside a paragraph. */}
          {deleteBots.length > 0 && (
            <ul className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
              {deleteBots.map((bot) => (
                <li key={bot.id} className="flex items-center gap-2">
                  <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{bot.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {bot.pair} · {bot.timeframe}
                  </span>
                  {bot.mode === 'live' && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive">
                      {t('botsPage.modeLive')}
                    </span>
                  )}
                  {bot.enabled && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-500">
                      {t('botsPage.statusRunning')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t('indicatorsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={deleteBots.length > 0 ? 'destructive' : undefined}
              onClick={handleDelete}
            >
              {deleteBots.length > 0
                ? t('indicatorsPage.deleteBotsAction', {
                    count: deleteBots.length,
                  })
                : t('indicatorsPage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
