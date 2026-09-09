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
 * ## Every bound is a plain number, and stays one
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
 *
 * ## The three that are not bounds
 *
 * Keywords narrow a column to a narrative; the launchpad chips narrow it to
 * the curves the trader works; the two switches keep only rows with a social
 * link and rows whose deployer gave up mint and freeze. All three are offered
 * on the launchpad columns only, where the feed publishes the fields they
 * read. Legendary keeps the keywords: a name is the one thing every row has.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
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
import { Switch } from '@pairlens/ui/components/ui/switch'
import type { LaunchpadStage } from '@pairlens/shared/instrument-types'

import type {
  LaunchpadFilters,
  NumericFilterKey,
} from '@/lib/memecoins/board-prefs'
import {
  FILTERS_FOR_STAGE,
  MAX_KEYWORDS,
  normalizeKeywords,
  pruneFilters,
} from '@/lib/memecoins/board-prefs'

/** Label and unit hint per field. Literal keys: the i18n audit reads source. */
const FIELD_LABELS: Record<NumericFilterKey, string> = {
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
const FIELD_UNITS: Partial<Record<NumericFilterKey, string>> = {
  minMcap: 'memecoins.filters.unitUsd',
  maxMcap: 'memecoins.filters.unitUsd',
  minLiquidity: 'memecoins.filters.unitUsd',
  minVolume: 'memecoins.filters.unitUsd',
  minCurve: 'memecoins.filters.unitPercent',
  maxCurve: 'memecoins.filters.unitPercent',
  maxAgeMinutes: 'memecoins.filters.unitMinutes',
}

/** Percent in, ratio out. The only field whose units are not what it stores. */
const isCurve = (field: NumericFilterKey): boolean =>
  field === 'minCurve' || field === 'maxCurve'

function toInput(field: NumericFilterKey, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  return String(isCurve(field) ? Math.round(value * 100) : value)
}

function fromInput(field: NumericFilterKey, raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return isCurve(field) ? parsed / 100 : parsed
}

/** The launchpad columns publish socials, audits and a launchpad; Legendary does not. */
const hasLaunchpadFields = (stage: LaunchpadStage): boolean =>
  stage !== 'legendary'

export function LaunchpadFilterDialog({
  stage,
  open,
  onOpenChange,
  filters,
  onApply,
  launchpadOptions,
}: {
  stage: LaunchpadStage
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: LaunchpadFilters | undefined
  onApply: (filters: LaunchpadFilters) => void
  /** The launchpads the loaded rows carry, so the chips offer what exists. */
  launchpadOptions: ReadonlyArray<string>
}) {
  const { t } = useTranslation()
  const fields = FILTERS_FOR_STAGE[stage]
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [keywords, setKeywords] = useState('')
  const [launchpads, setLaunchpads] = useState<Array<string>>([])
  const [hasSocials, setHasSocials] = useState(false)
  const [authoritiesRevoked, setAuthoritiesRevoked] = useState(false)

  // Re-seeded on every open rather than held across them: the dialog is a view
  // of the saved filters, and a draft that outlived a cancel would quietly
  // re-apply the edit somebody just abandoned.
  useEffect(() => {
    if (!open) return
    const seeded: Record<string, string> = {}
    for (const field of fields) seeded[field] = toInput(field, filters?.[field])
    setDraft(seeded)
    setKeywords((filters?.keywords ?? []).join(', '))
    setLaunchpads(filters?.launchpads ?? [])
    setHasSocials(filters?.hasSocials === true)
    setAuthoritiesRevoked(filters?.authoritiesRevoked === true)
  }, [open, fields, filters])

  const commit = () => {
    const next: LaunchpadFilters = {}
    for (const field of fields) {
      const value = fromInput(field, draft[field] ?? '')
      if (value !== undefined) next[field] = value
    }
    next.keywords = normalizeKeywords(keywords)
    if (hasLaunchpadFields(stage)) {
      next.launchpads = launchpads
      next.hasSocials = hasSocials
      next.authoritiesRevoked = authoritiesRevoked
    }
    onApply(pruneFilters(next))
    onOpenChange(false)
  }

  // A launchpad somebody picked earlier stays offered even when the current
  // rows happen not to carry it, or the chip would vanish with no way to
  // unpick it.
  const chips = [...new Set([...launchpadOptions, ...launchpads])].sort()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('memecoins.filters.title')}</DialogTitle>
          <DialogDescription>
            {t('memecoins.filters.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor={`filter-${stage}-keywords`}>
              {t('memecoins.filters.keywords')}
            </Label>
            <Input
              id={`filter-${stage}-keywords`}
              value={keywords}
              placeholder={t('memecoins.filters.keywordsPlaceholder')}
              onChange={(event) => setKeywords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
              }}
            />
            <p className="text-[10.5px] leading-snug text-muted-foreground/70">
              {t('memecoins.filters.keywordsHint', { max: MAX_KEYWORDS })}
            </p>
          </div>

          {hasLaunchpadFields(stage) && chips.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-xs">
                {t('memecoins.filters.launchpads')}
              </Label>
              <div className="flex flex-wrap gap-1">
                {chips.map((id) => {
                  const on = launchpads.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        'rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors',
                        on
                          ? 'border-primary text-foreground'
                          : 'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground',
                      )}
                      style={
                        on
                          ? {
                              backgroundColor:
                                'color-mix(in oklch, var(--primary) 14%, transparent)',
                            }
                          : undefined
                      }
                      onClick={() =>
                        setLaunchpads((prev) =>
                          on ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                    >
                      {id}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10.5px] leading-snug text-muted-foreground/70">
                {t('memecoins.filters.launchpadsHint')}
              </p>
            </div>
          )}

          {hasLaunchpadFields(stage) && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs" htmlFor={`filter-${stage}-socials`}>
                  {t('memecoins.filters.hasSocials')}
                </Label>
                <Switch
                  id={`filter-${stage}-socials`}
                  checked={hasSocials}
                  onCheckedChange={setHasSocials}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs" htmlFor={`filter-${stage}-revoked`}>
                  {t('memecoins.filters.authoritiesRevoked')}
                </Label>
                <Switch
                  id={`filter-${stage}-revoked`}
                  checked={authoritiesRevoked}
                  onCheckedChange={setAuthoritiesRevoked}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
                    setDraft((prev) => ({
                      ...prev,
                      [field]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit()
                  }}
                />
              </div>
            ))}
          </div>
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
