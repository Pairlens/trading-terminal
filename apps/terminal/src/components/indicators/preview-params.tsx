// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Switch } from '@pairlens/ui/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type {
  CustomIndicatorInputSpec,
  CustomIndicatorMeta,
} from '@pairlens/shared/plugin-types'

export type PreviewParams = Record<string, number | boolean | string>

/** Default value for every declared input. */
export function defaultPreviewParams(meta: CustomIndicatorMeta): PreviewParams {
  const params: PreviewParams = {}
  for (const input of meta.inputs) params[input.key] = input.default
  return params
}

/** True when every value still equals the script's declared default. */
function isPristine(meta: CustomIndicatorMeta, params: PreviewParams): boolean {
  return meta.inputs.every((input) => params[input.key] === input.default)
}

type PreviewParamsBarProps = {
  meta: CustomIndicatorMeta
  params: PreviewParams
  onChange: (params: PreviewParams) => void
  disabled?: boolean
}

/**
 * Live controls for a script's declared `inputs`, so a length can be dialled
 * in against the preview instead of edited in source and re-run. Mirrors the
 * settings the chart's indicator picker shows once the script is installed.
 */
export function PreviewParamsBar({
  meta,
  params,
  onChange,
  disabled,
}: PreviewParamsBarProps) {
  const { t } = useTranslation()
  if (meta.inputs.length === 0) return null

  const set = (key: string, value: number | boolean | string): void => {
    onChange({ ...params, [key]: value })
  }

  return (
    // No rule of its own: in the workbench this row sits under the preview
    // toolbar's hairline and over the plot, and on a bot's settings it sits
    // inside a well, where a border would draw a line across the fill.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
      <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
      {meta.inputs.map((input) => (
        <ParamControl
          key={input.key}
          input={input}
          value={params[input.key]}
          onChange={(value) => set(input.key, value)}
          disabled={disabled}
        />
      ))}
      {!isPristine(meta, params) && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={() => onChange(defaultPreviewParams(meta))}
                disabled={disabled}
                aria-label={t('indicatorsPage.paramsReset')}
              />
            }
          >
            <RotateCcw className="size-3" />
          </TooltipTrigger>
          <TooltipContent>{t('indicatorsPage.paramsReset')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function ParamControl({
  input,
  value,
  onChange,
  disabled,
}: {
  input: CustomIndicatorInputSpec
  value: number | boolean | string | undefined
  onChange: (value: number | boolean | string) => void
  disabled?: boolean
}) {
  const label = input.label ?? input.key

  if (input.kind === 'bool') {
    return (
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        <Switch
          checked={value === true}
          onCheckedChange={(next) => onChange(next === true)}
          disabled={disabled}
          className="scale-75"
          aria-label={label}
        />
      </label>
    )
  }

  if (input.kind === 'choice' || input.kind === 'source') {
    const options =
      input.kind === 'choice'
        ? input.options
        : ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']
    return (
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        <Select
          value={String(value ?? input.default)}
          onValueChange={(next) => next && onChange(next)}
          disabled={disabled}
        >
          <SelectTrigger
            size="sm"
            className="h-6 w-auto min-w-20 text-xs"
            aria-label={label}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    )
  }

  const step = input.step ?? (input.kind === 'int' ? 1 : 0.1)
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        value={String(value ?? input.default)}
        min={input.min}
        max={input.max}
        step={step}
        disabled={disabled}
        // Blank/garbled input keeps the last good value — the preview must
        // never re-run against NaN.
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="h-6 w-20 px-1.5 text-right font-mono text-xs"
        aria-label={label}
      />
    </label>
  )
}
