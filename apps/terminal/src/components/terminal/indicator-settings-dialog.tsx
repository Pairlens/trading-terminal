// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Switch } from '@pairlens/ui/components/ui/switch'
import { getCatalogEntry, getIndicatorParamSpecs } from './indicator-params'
import type {
  IndicatorInstanceInput,
  IndicatorParams,
} from 'fast-financial-charts/types'
import type { IndicatorParamSpec } from './indicator-params'
import {
  customIndicatorDefaultParams,
  getIndicatorDisplayLabel,
} from '@/lib/indicators/custom-indicator-definitions'

type DraftParams = Record<string, string | boolean>

function toDraft(
  params: IndicatorParams,
  specs: Array<IndicatorParamSpec>,
): DraftParams {
  const draft: DraftParams = {}
  for (const spec of specs) {
    const value = params[spec.key]
    if (spec.type === 'boolean') {
      draft[spec.key] = value === true
    } else {
      draft[spec.key] = value === undefined ? '' : String(value)
    }
  }
  return draft
}

type IndicatorSettingsDialogProps = {
  /** Indicator instance being edited; `null` keeps the dialog closed. */
  target: IndicatorInstanceInput | null
  onOpenChange: (open: boolean) => void
  onApply: (id: string, params: IndicatorParams) => void
}

export function IndicatorSettingsDialog({
  target,
  onOpenChange,
  onApply,
}: IndicatorSettingsDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target ? (
        <IndicatorSettingsContent
          key={target.id ?? target.type}
          target={target}
          onOpenChange={onOpenChange}
          onApply={onApply}
        />
      ) : null}
    </Dialog>
  )
}

function IndicatorSettingsContent({
  target,
  onOpenChange,
  onApply,
}: {
  target: IndicatorInstanceInput
  onOpenChange: (open: boolean) => void
  onApply: (id: string, params: IndicatorParams) => void
}) {
  const { t } = useTranslation()

  const entry = getCatalogEntry(target.type)
  const specs = useMemo(() => getIndicatorParamSpecs(target.type), [target])
  // Custom (script-defined) indicators have no catalog entry — their
  // defaults come from the registered script's declared inputs.
  const defaults = useMemo(
    () => entry?.defaultParams ?? customIndicatorDefaultParams(target.type),
    [entry, target.type],
  )

  const [draft, setDraft] = useState<DraftParams>(() =>
    toDraft({ ...defaults, ...target.params }, specs),
  )

  const setParam = (key: string, value: string | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleReset = () => {
    setDraft(toDraft(defaults, specs))
  }

  const handleApply = () => {
    if (!target.id) return
    const params: IndicatorParams = { ...defaults, ...target.params }
    for (const spec of specs) {
      const raw = draft[spec.key]
      if (spec.type === 'boolean') {
        params[spec.key] = raw === true
        continue
      }
      if (spec.type === 'select') {
        if (typeof raw === 'string' && raw) params[spec.key] = raw
        continue
      }
      const parsed = typeof raw === 'string' ? Number(raw) : NaN
      if (!Number.isFinite(parsed)) continue
      let value = spec.type === 'int' ? Math.round(parsed) : parsed
      if (spec.min !== undefined) value = Math.max(spec.min, value)
      if (spec.max !== undefined) value = Math.min(spec.max, value)
      params[spec.key] = value
    }
    onApply(target.id, params)
    onOpenChange(false)
  }

  const displayName = entry
    ? t(entry.labelKey)
    : getIndicatorDisplayLabel(target.type)

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{displayName}</DialogTitle>
        <DialogDescription>
          {t('indicators.settings.description')}
        </DialogDescription>
      </DialogHeader>

      {specs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('indicators.settings.noParams')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {specs.map((spec) => (
            <ParamRow
              key={spec.key}
              spec={spec}
              value={draft[spec.key] ?? ''}
              onChange={(value) => setParam(spec.key, value)}
            />
          ))}
        </div>
      )}

      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={specs.length === 0}
        >
          <RotateCcw className="size-3.5" />
          {t('indicators.settings.reset')}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('indicators.settings.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={specs.length === 0 || !target.id}
          >
            {t('indicators.settings.apply')}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

function ParamRow({
  spec,
  value,
  onChange,
}: {
  spec: IndicatorParamSpec
  value: string | boolean
  onChange: (value: string | boolean) => void
}) {
  const { t } = useTranslation()
  const inputId = `indicator-param-${spec.key}`
  const label = spec.label ?? t(spec.labelKey, { defaultValue: spec.key })

  if (spec.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId} className="text-sm font-normal">
          {label}
        </Label>
        <Switch
          id={inputId}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    )
  }

  if (spec.type === 'select') {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId} className="text-sm font-normal">
          {label}
        </Label>
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(next) => {
            if (next !== null) onChange(next)
          }}
        >
          <SelectTrigger id={inputId} size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label ??
                  t(option.labelKey, { defaultValue: option.value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={inputId} className="text-sm font-normal">
        {label}
      </Label>
      <Input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-32"
      />
    </div>
  )
}
