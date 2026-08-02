// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Button } from '@pairlens/ui/components/ui/button'
import { Label } from '@pairlens/ui/components/ui/label'

type TextInputDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultText: string
  onSubmit: (text: string) => void
  onDelete: () => void
}

export function TextInputDialog({
  open,
  onOpenChange,
  defaultText,
  onSubmit,
  onDelete,
}: TextInputDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(defaultText)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync value when dialog opens with new defaultText
  useEffect(() => {
    if (open) {
      setValue(defaultText)
      // Auto-focus and select text after dialog animation
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [open, defaultText])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onSubmit(trimmed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('chart.textDialog.editText')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="drawing-text">
            {t('chart.textDialog.textContent')}
          </Label>
          <Input
            ref={inputRef}
            id="drawing-text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={t('chart.textDialog.enterText')}
          />
        </div>

        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            {t('common.delete')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!value.trim()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
