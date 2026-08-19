// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { FileCode2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
  DialogDescription,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { IndicatorFile } from '@/stores/indicator-scripts-store'
import {
  ENTRY_FILE,
  isValidModulePath,
  normalizeModulePath,
} from '@/stores/indicator-scripts-store'

type FileTabsProps = {
  files: Array<IndicatorFile>
  activePath: string
  /** Paths with unsaved editor changes — marked with a dot. */
  dirtyPaths: ReadonlySet<string>
  onSelect: (path: string) => void
  onAdd: (path: string) => void
  onRename: (from: string, to: string) => void
  onDelete: (path: string) => void
}

/**
 * Tab strip for one indicator's Python files. `main.py` is the entry module
 * (it defines meta + compute) and is fixed; every other file is a helper the
 * entry imports by name, so it can be added, renamed and deleted freely.
 */
export function FileTabs({
  files,
  activePath,
  dirtyPaths,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: FileTabsProps) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [renamePath, setRenamePath] = useState<string | null>(null)
  const [deletePath, setDeletePath] = useState<string | null>(null)

  const taken = new Set(files.map((f) => f.path))

  return (
    // py-1.5 around h-7 items is the same recipe as the preview toolbar on the
    // other side of the split, so the two header rows line up exactly.
    <div className="flex items-center gap-0.5 overflow-x-auto border-y border-(--pane-rule) px-1.5 py-1.5">
      {files.map((file) => {
        const active = file.path === activePath
        const isEntry = file.path === ENTRY_FILE
        return (
          <div
            key={file.path}
            className={cn(
              'group flex h-7 shrink-0 items-center gap-1 rounded-md pl-2 pr-1 text-xs transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 font-mono"
              onClick={() => onSelect(file.path)}
            >
              <FileCode2 className="size-3 shrink-0 opacity-70" />
              {file.path}
              {dirtyPaths.has(file.path) && (
                <span
                  aria-label={t('indicatorsPage.unsaved')}
                  className="size-1.5 rounded-full bg-muted-foreground"
                />
              )}
            </button>
            {isEntry ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="px-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                      {t('indicatorsPage.entryFile')}
                    </span>
                  }
                />
                <TooltipContent side="bottom">
                  {t('indicatorsPage.entryFileHint')}
                </TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-4 shrink-0 opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
                      aria-label={t('indicatorsPage.fileActions', {
                        file: file.path,
                      })}
                    />
                  }
                >
                  <MoreHorizontal className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setRenamePath(file.path)}>
                    <Pencil className="size-3.5" />
                    {t('indicatorsPage.rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeletePath(file.path)}
                  >
                    <Trash2 className="size-3.5" />
                    {t('indicatorsPage.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={() => setAddOpen(true)}
        aria-label={t('indicatorsPage.newFile')}
      >
        <Plus className="size-3.5" />
      </Button>

      <FilePathDialog
        open={addOpen}
        title={t('indicatorsPage.newFileTitle')}
        description={t('indicatorsPage.newFileDescription')}
        confirmLabel={t('indicatorsPage.createFile')}
        initialValue=""
        taken={taken}
        onCancel={() => setAddOpen(false)}
        onConfirm={(path) => {
          onAdd(path)
          setAddOpen(false)
          onSelect(path)
        }}
      />

      <FilePathDialog
        open={renamePath !== null}
        title={t('indicatorsPage.renameFileTitle')}
        description={t('indicatorsPage.newFileDescription')}
        confirmLabel={t('indicatorsPage.rename')}
        initialValue={renamePath ?? ''}
        taken={taken}
        allowValue={renamePath ?? undefined}
        onCancel={() => setRenamePath(null)}
        onConfirm={(path) => {
          if (renamePath && path !== renamePath) onRename(renamePath, path)
          setRenamePath(null)
          onSelect(path)
        }}
      />

      <AlertDialog
        open={deletePath !== null}
        onOpenChange={(open) => !open && setDeletePath(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('indicatorsPage.deleteFileTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('indicatorsPage.deleteFileDescription', {
                file: deletePath ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('indicatorsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePath) {
                  onDelete(deletePath)
                  if (activePath === deletePath) onSelect(ENTRY_FILE)
                }
                setDeletePath(null)
              }}
            >
              {t('indicatorsPage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type FilePathDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  initialValue: string
  taken: ReadonlySet<string>
  /** The path being renamed — allowed to stay itself. */
  allowValue?: string
  onCancel: () => void
  onConfirm: (path: string) => void
}

/** Name prompt shared by "new file" and "rename file", with live validation. */
function FilePathDialog({
  open,
  title,
  description,
  confirmLabel,
  initialValue,
  taken,
  allowValue,
  onCancel,
  onConfirm,
}: FilePathDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  const path = normalizeModulePath(value)
  const collides = path !== allowValue && taken.has(path)
  const error =
    value.trim().length === 0
      ? null
      : collides
        ? t('indicatorsPage.fileExists')
        : isValidModulePath(path)
          ? null
          : t('indicatorsPage.fileNameInvalid')
  const canConfirm = path.length > 0 && !collides && isValidModulePath(path)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          className="h-8 font-mono text-sm"
          placeholder="helpers.py"
          value={value}
          aria-invalid={error !== null}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm(path)
          }}
          autoFocus
        />
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('indicatorsPage.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            onClick={() => onConfirm(path)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
