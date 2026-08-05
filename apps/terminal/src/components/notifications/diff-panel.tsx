// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Cable, Minus, Pencil, Plus } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { NotificationDiff } from '@/stores/notification-store'

type DiffPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  diff: NotificationDiff
}

export function DiffPanel({ open, onOpenChange, diff }: DiffPanelProps) {
  const { t } = useTranslation()
  const totalChanges =
    diff.addedSteps.length +
    diff.removedSteps.length +
    diff.modifiedSteps.length +
    diff.addedEdges.length +
    diff.removedEdges.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('notifications.builder.diff.title', { count: totalChanges })}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {/* Added Steps */}
          {diff.addedSteps.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 rounded bg-emerald-500/10 px-2 py-1 text-xs"
            >
              <Plus className="size-3 text-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-400">
                {t('notifications.builder.diff.addedStep', { type: n.type })}
              </span>
            </div>
          ))}

          {/* Removed Steps */}
          {diff.removedSteps.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 rounded bg-red-500/10 px-2 py-1 text-xs"
            >
              <Minus className="size-3 text-red-500" />
              <span className="text-red-700 dark:text-red-400">
                {t('notifications.builder.diff.removedStep', { type: n.type })}
              </span>
            </div>
          ))}

          {/* Modified Steps */}
          {diff.modifiedSteps.map(({ before }) => (
            <div
              key={before.id}
              className="flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1 text-xs"
            >
              <Pencil className="size-3 text-amber-500" />
              <span className="text-amber-700 dark:text-amber-400">
                {t('notifications.builder.diff.modifiedStep', {
                  type: before.type,
                })}
              </span>
            </div>
          ))}

          {/* Added Edges */}
          {diff.addedEdges.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 rounded bg-emerald-500/10 px-2 py-1 text-xs"
            >
              <Cable className="size-3 text-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-400">
                {t('notifications.builder.diff.addedConnection')}
              </span>
            </div>
          ))}

          {/* Removed Edges */}
          {diff.removedEdges.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 rounded bg-red-500/10 px-2 py-1 text-xs"
            >
              <Cable className="size-3 text-red-500" />
              <span className="text-red-700 dark:text-red-400">
                {t('notifications.builder.diff.removedConnection')}
              </span>
            </div>
          ))}

          {totalChanges === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {t('notifications.builder.commitBar.noChanges')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
