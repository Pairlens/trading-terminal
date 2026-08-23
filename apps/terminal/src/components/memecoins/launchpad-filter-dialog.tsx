// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a column is allowed to show.
 *
 * One dialog for four columns, offering only the bounds that stage can
 * actually test (`FILTERS_FOR_STAGE`). Legendary gets no holder floor because
 * CoinGecko publishes a market-cap ranking and no holder counts, and a filter
 * that silently empties a column is worse than a filter that is not there.
 *
 * ## Every field is a plain number, and stays one
 *
 * The dialog edits STRINGS and commits numbers, which is the difference
 * between a field you can clear and a field that snaps back to zero the moment
 * you delete the last digit. An empty string is "no bound", parsed away by
 * `pruneFilters` on save, so the persisted shape only ever holds bounds
 * somebody set.
 *
 * Curve progress is the one field whose stored form differs from what is
 * typed: the contract carries 0..1 and the reader thinks in percent, so it is
 * scaled at this boundary and nowhere else.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import type { LaunchpadStage } from '@pairlens/shared/instrument-types'

import type { LaunchpadFilters } from '@/lib/memecoins/board-prefs'
import { FILTERS_FOR_STAGE, pruneFilters } from '@/lib/memecoins/board-prefs'

/** Label and unit hint per field. Literal keys: the i18n audit reads source. */
const FIELD_LABELS: Record<keyof LaunchpadFilters, string> = {
  minMcap: 'memecoins.filters.minMcap',
  maxMcap: 'memecoins.filters.maxMcap',
  minLiquidity: 'memecoins.filters.minLiquidity',
  minHolders: 'memecoins.filters.minHolders',
  minCurve: 'memecoins.filters.minCurve',
  maxCurve: 'memecoins.filters.maxCurve',
  maxAgeMinutes: 'memecoins.filters.maxAgeMinutes',
  minVolume: 'memecoins.filters.minVolume',
  minTrades: 'memecoins.filters.minTrades',
}

/** A hint under the field, in the unit the reader is typing. */
const FIELD_UNITS: Partial<Record<keyof LaunchpadFilters, string>> = {
  minMcap: 'memecoins.filters.unitUsd',
  maxMcap: 'memecoins.filters.unitUsd',
  minLiquidity: 'memecoins.filters.unitUsd',
  minVolume: 'memecoins.filters.unitUsd',
  minCurve: 'memecoins.filters.unitPercent',
  maxCurve: 'memecoins.filters.unitPercent',
  maxAgeMinutes: 'memecoins.filters.unitMinutes',
}

/** Percent in, ratio out. The only field whose units are not what it stores. */
const isCurve = (field: keyof LaunchpadFilters): boolean =>
  field === 'minCurve' || field === 'maxCurve'

function toInput(
  field: keyof LaunchpadFilters,
  value: number | undefined,
): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  return String(isCurve(field) ? Math.round(value * 100) : value)
}

function fromInput(
  field: keyof LaunchpadFilters,
  raw: string,
): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return isCurve(field) ? parsed / 100 : parsed
}

export function LaunchpadFilterDialog({
  stage,
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  stage: LaunchpadStage
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: LaunchpadFilters | undefined
  onApply: (filters: LaunchpadFilters) => void
}) {
  const { t } = useTranslation()
  const fields = FILTERS_FOR_STAGE[stage]
  const [draft, setDraft] = useState<Record<string, string>>({})

  // Re-seeded on every open rather than held across them: the dialog is a view
  // of the saved filters, and a draft that outlived a cancel would quietly
  // re-apply the edit somebody just abandoned.
  useEffect(() => {
    if (!open) return
    const seeded: Record<string, string> = {}
    for (const field of fields) seeded[field] = toInput(field, filters?.[field])
    setDraft(seeded)
  }, [open, fields, filters])

  const commit = () => {
    const next: LaunchpadFilters = {}
    for (const field of fields) {
      const value = fromInput(field, draft[field] ?? '')
      if (value !== undefined) next[field] = value
    }
    onApply(pruneFilters(next))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('memecoins.filters.title')}</DialogTitle>
          <DialogDescription>
            {t('memecoins.filters.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto">
          {fields.map((field) => (
            <div className="grid gap-1.5" key={field}>
              <Label className="text-xs" htmlFor={`filter-${stage}-${field}`}>
                {t(FIELD_LABELS[field])}
              </Label>
              <Input
                id={`filter-${stage}-${field}`}
                inputMode="decimal"
                value={draft[field] ?? ''}
                placeholder={
                  FIELD_UNITS[field] ? t(FIELD_UNITS[field]) : undefined
                }
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [field]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit()
                }}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onApply({})
              onOpenChange(false)
            }}
          >
            {t('memecoins.filters.clear')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={commit}>
            {t('memecoins.filters.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
