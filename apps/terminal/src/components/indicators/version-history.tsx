// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { FileCode2, History, RotateCcw, Trash2 } from 'lucide-react'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type { DiffLine } from '@/lib/indicators/diff-lines'
import type {
  IndicatorScript,
  IndicatorVersion,
} from '@/stores/indicator-scripts-store'
import { diffLines, diffSummary } from '@/lib/indicators/diff-lines'
import {
  scriptFiles,
  useIndicatorScriptsStore,
  versionChars,
} from '@/stores/indicator-scripts-store'

const NO_VERSIONS: Array<IndicatorVersion> = []

/** Unchanged lines kept on each side of a change before collapsing. */
const DIFF_CONTEXT = 3

type VersionHistoryDialogProps = {
  script: IndicatorScript | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A rendered diff row: either a line, or a collapsed run of unchanged ones. */
type DiffRow =
  | { kind: 'line'; line: DiffLine }
  | { kind: 'gap'; key: string; count: number }

type FileDiff = {
  path: string
  rows: Array<DiffRow>
  added: number
  removed: number
  /** The file exists in the version but not in the current script. */
  gone: boolean
  /** The file was created after this version was taken. */
  isNew: boolean
}

function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} B`
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Collapse long stretches of untouched code so a 2000-line file diff renders
 * as the handful of lines that actually moved. Runs of one unchanged line are
 * kept as context — a gap row would be bigger than what it hides.
 */
function withContext(lines: Array<DiffLine>): Array<DiffRow> {
  const keep = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type === 'same') continue
    const from = Math.max(0, i - DIFF_CONTEXT)
    const to = Math.min(lines.length - 1, i + DIFF_CONTEXT)
    for (let j = from; j <= to; j++) keep[j] = true
  }

  const rows: Array<DiffRow> = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      rows.push({ kind: 'line', line: lines[i] })
      i += 1
      continue
    }
    const start = i
    while (i < lines.length && !keep[i]) i += 1
    const count = i - start
    if (count === 1) {
      rows.push({ kind: 'line', line: lines[start] })
    } else {
      rows.push({ kind: 'gap', key: `gap-${start}`, count })
    }
  }
  return rows
}

/** Every file that differs between a version and the script as it stands. */
function buildFileDiffs(
  script: IndicatorScript,
  version: IndicatorVersion,
): Array<FileDiff> {
  const current = scriptFiles(script)
  const paths = current.map((f) => f.path)
  for (const file of version.files) {
    if (!paths.includes(file.path)) paths.push(file.path)
  }

  const diffs: Array<FileDiff> = []
  for (const path of paths) {
    const before = version.files.find((f) => f.path === path)
    const after = current.find((f) => f.path === path)
    const lines = diffLines(before?.source ?? '', after?.source ?? '')
    const { added, removed } = diffSummary(lines)
    if (added === 0 && removed === 0) continue
    diffs.push({
      path,
      rows: withContext(lines),
      added,
      removed,
      gone: !after,
      isNew: !before,
    })
  }
  return diffs
}

/**
 * Version history for one indicator: every snapshot taken before a save,
 * diffed against the files as they stand now, with a one-click restore.
 */
export function VersionHistoryDialog({
  script,
  open,
  onOpenChange,
}: VersionHistoryDialogProps) {
  const { t } = useTranslation()
  const loadHistory = useIndicatorScriptsStore((s) => s.loadHistory)
  const restoreVersion = useIndicatorScriptsStore((s) => s.restoreVersion)
  const clearVersions = useIndicatorScriptsStore((s) => s.clearVersions)
  const scriptId = script?.id ?? null
  const historyLoaded = useIndicatorScriptsStore((s) => s.historyLoaded)
  const versions = useIndicatorScriptsStore((s) =>
    scriptId ? (s.history[scriptId] ?? NO_VERSIONS) : NO_VERSIONS,
  )

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // Lazily paged in: a long history never delays the script list itself.
  useEffect(() => {
    if (open) loadHistory()
  }, [open, loadHistory])

  // Reopening, or switching scripts, starts back at the newest version.
  useEffect(() => {
    setPickedId(null)
  }, [scriptId, open])

  const selected =
    versions.find((v) => v.id === pickedId) ?? versions[0] ?? null

  const fileDiffs = useMemo(
    () => (script && selected ? buildFileDiffs(script, selected) : []),
    [script, selected],
  )

  const versionText = (version: IndicatorVersion): string => {
    switch (version.kind) {
      case 'add':
        return t('indicatorsPage.versionAdded', { file: version.detail })
      case 'rename':
        return t('indicatorsPage.versionRenamed', { file: version.detail })
      case 'delete':
        return t('indicatorsPage.versionDeleted', { file: version.detail })
      case 'restore':
        return t('indicatorsPage.versionBeforeRestore')
      case 'save':
      default:
        return t('indicatorsPage.versionSaved')
    }
  }

  const handleRestore = () => {
    if (!script || !selected) return
    restoreVersion(script.id, selected.id)
    setConfirmRestore(false)
    onOpenChange(false)
    toast.success(
      t('indicatorsPage.versionRestored', {
        time: formatDistanceToNow(selected.createdAt, { addSuffix: true }),
      }),
    )
  }

  const handleClear = () => {
    if (script) clearVersions(script.id)
    setConfirmClear(false)
  }

  if (!script) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('indicatorsPage.versionHistory')}</DialogTitle>
            <DialogDescription>
              {t('indicatorsPage.versionHistoryDescription')}
            </DialogDescription>
          </DialogHeader>

          {!historyLoaded ? (
            // The history key is read in an effect; hold the space for a
            // frame rather than flashing "no versions" at someone who has
            // fifty of them.
            <div className="h-[55vh]" />
          ) : versions.length === 0 ? (
            <Empty className="border-none py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History />
                </EmptyMedia>
                <EmptyTitle>{t('indicatorsPage.versionHistory')}</EmptyTitle>
                <EmptyDescription>
                  {t('indicatorsPage.versionHistoryEmpty')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex min-h-0 gap-3">
              {/* Version list */}
              <ScrollArea className="h-[55vh] w-52 shrink-0 rounded-md border border-border">
                <div className="p-1">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setPickedId(version.id)}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                        selected?.id === version.id
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <div className="truncate text-xs font-medium">
                        {versionText(version)}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {formatDistanceToNow(version.createdAt, {
                          addSuffix: true,
                        })}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {t('indicatorsPage.versionFiles', {
                          count: version.files.length,
                        })}{' '}
                        · {formatSize(versionChars(version))}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              {/* Diff against the current files */}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-[10px] text-muted-foreground">
                  {t('indicatorsPage.versionDiffHint')}
                </p>
                <ScrollArea className="h-[55vh] rounded-md border border-border">
                  {fileDiffs.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      {t('indicatorsPage.versionNoChanges')}
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {fileDiffs.map((diff) => (
                        <div key={diff.path}>
                          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur-sm">
                            <FileCode2 className="size-3 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono text-[11px]">
                              {diff.path}
                            </span>
                            {diff.gone && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal"
                              >
                                {t('indicatorsPage.versionFileGone')}
                              </Badge>
                            )}
                            {diff.isNew && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal"
                              >
                                {t('indicatorsPage.versionFileNew')}
                              </Badge>
                            )}
                            <span className="ml-auto shrink-0 font-mono text-[10px]">
                              <span className="text-up">+{diff.added}</span>{' '}
                              <span className="text-down">−{diff.removed}</span>
                            </span>
                          </div>
                          {diff.rows.map((row, index) =>
                            row.kind === 'gap' ? (
                              <div
                                key={row.key}
                                className="bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                ⋯{' '}
                                {t('indicatorsPage.versionDiffHidden', {
                                  lines: row.count,
                                })}
                              </div>
                            ) : (
                              <div
                                key={`${diff.path}:${index}`}
                                className={cn(
                                  'flex gap-2 whitespace-pre-wrap break-all px-2 font-mono text-[11px] leading-5',
                                  row.line.type === 'add' && 'bg-up/10 text-up',
                                  row.line.type === 'remove' &&
                                    'bg-down/10 text-down',
                                  row.line.type === 'same' &&
                                    'text-muted-foreground',
                                )}
                              >
                                <span className="shrink-0 select-none opacity-60">
                                  {row.line.type === 'add'
                                    ? '+'
                                    : row.line.type === 'remove'
                                      ? '−'
                                      : ' '}
                                </span>
                                <span>{row.line.text}</span>
                              </div>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={versions.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="size-3.5" />
              {t('indicatorsPage.versionClear')}
            </Button>
            <Button
              size="sm"
              disabled={!selected}
              onClick={() => setConfirmRestore(true)}
            >
              <RotateCcw className="size-3.5" />
              {t('indicatorsPage.versionRestore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <AlertDialog
        open={confirmRestore}
        onOpenChange={(next) => !next && setConfirmRestore(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('indicatorsPage.versionRestoreTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('indicatorsPage.versionRestoreDescription', {
                name: script.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('indicatorsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              {t('indicatorsPage.versionRestore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear-history confirmation */}
      <AlertDialog
        open={confirmClear}
        onOpenChange={(next) => !next && setConfirmClear(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('indicatorsPage.versionClearTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('indicatorsPage.versionClearDescription', {
                name: script.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('indicatorsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear}>
              {t('indicatorsPage.versionClear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
