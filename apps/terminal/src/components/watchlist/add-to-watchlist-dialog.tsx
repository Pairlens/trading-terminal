// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Checkbox } from '@pairlens/ui/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { useWatchlistsStore } from '@/stores/watchlists-store'

export function AddToWatchlistDialog() {
  const { t } = useTranslation()
  const dialog = useWatchlistsStore((s) => s.dialog)
  const lists = useWatchlistsStore((s) => s.state.lists)
  const addToWatchlist = useWatchlistsStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useWatchlistsStore((s) => s.removeFromWatchlist)
  const createList = useWatchlistsStore((s) => s.createList)
  const closeDialog = useWatchlistsStore((s) => s.closeDialog)

  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const symbol = dialog.symbol

  const handleToggle = useCallback(
    (listId: string, checked: boolean) => {
      if (!symbol) return
      if (checked) {
        addToWatchlist(symbol, [listId])
      } else {
        removeFromWatchlist(symbol, listId)
      }
    },
    [symbol, addToWatchlist, removeFromWatchlist],
  )

  const handleCreate = useCallback(() => {
    const name = newName.trim()
    if (!name || !symbol) return
    const id = createList(name)
    addToWatchlist(symbol, [id])
    setNewName('')
    setIsCreating(false)
  }, [newName, symbol, createList, addToWatchlist])

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog()
          setIsCreating(false)
          setNewName('')
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('watchlist.addTitle')}</DialogTitle>
          <DialogDescription>
            {t('watchlist.addDescription', { symbol })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {lists.map((list) => {
            const isChecked = symbol ? list.symbols.includes(symbol) : false
            return (
              <label
                key={list.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/40',
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    handleToggle(list.id, checked === true)
                  }
                />
                <span className="flex-1 truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {list.symbols.length}
                </span>
              </label>
            )
          })}
        </div>

        {isCreating ? (
          <form
            className="flex items-center gap-2 px-3"
            onSubmit={(e) => {
              e.preventDefault()
              handleCreate()
            }}
          >
            <input
              autoFocus
              className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              placeholder={t('watchlist.listNamePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsCreating(false)
                  setNewName('')
                }
              }}
            />
            <Button size="icon-xs" variant="ghost" type="submit">
              <Check className="size-3.5" />
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="mx-3 justify-start gap-2 text-muted-foreground"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="size-3.5" />
            {t('watchlist.newWatchlist')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
