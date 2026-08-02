// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Replace,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

export type GridPlacement = 'replace' | 'left' | 'right' | 'top' | 'bottom'

type GridConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cols: number
  rows: number
  onConfirm: (placement: GridPlacement) => void
}

export function GridConfirmDialog({
  open,
  onOpenChange,
  cols,
  rows,
  onConfirm,
}: GridConfirmDialogProps) {
  const { t } = useTranslation()

  const handle = (placement: GridPlacement) => {
    onConfirm(placement)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('layout.gridConfirmTitle')}</DialogTitle>
          <DialogDescription>
            {t('layout.gridConfirmDescription', { cols, rows })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {/* Cross layout: directional buttons around a center replace */}
          <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
            {/* Row 1 */}
            <div />
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => handle('top')}
            >
              <ArrowUp className="size-3" />
              {t('layout.gridAbove')}
            </Button>
            <div />

            {/* Row 2 */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => handle('left')}
            >
              <ArrowLeft className="size-3" />
              {t('layout.gridLeft')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => handle('replace')}
            >
              <Replace className="size-3" />
              {t('layout.gridReplace')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => handle('right')}
            >
              {t('layout.gridRight')}
              <ArrowRight className="size-3" />
            </Button>

            {/* Row 3 */}
            <div />
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => handle('bottom')}
            >
              {t('layout.gridBelow')}
              <ArrowDown className="size-3" />
            </Button>
            <div />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
