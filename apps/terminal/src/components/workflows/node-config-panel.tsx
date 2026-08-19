// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Slider } from '@pairlens/ui/components/ui/slider'

import { getStepType } from '@pairlens/workflow-engine/step-registry'
import {
  MASTER_DETAIL_LIST_HEADER_CLASS,
  MASTER_DETAIL_LIST_TITLE_CLASS,
} from '../master-detail'
import type { WorkflowStepConfigField } from '@pairlens/workflow-engine/step-registry'

import { PAGE_COLUMN_FLUSH } from '@/components/chrome/page-chrome'
import { useWorkflowStore } from '@/stores/workflow-store'
import {
  stepCompatRequires,
  stepFieldLabel,
  stepOptionLabel,
  stepTypeLabel,
} from '@/lib/registry-labels'

type StepConfigPanelProps = {
  stepId: string
  stepType: string
  data: Record<string, unknown>
  onClose: () => void
}

export function StepConfigPanel({
  stepId,
  stepType,
  data,
  onClose,
}: StepConfigPanelProps) {
  const { t } = useTranslation()
  const updateStepData = useWorkflowStore((s) => s.updateStepData)
  const stepDef = getStepType(stepType)

  if (!stepDef || stepDef.configSchema.length === 0) {
    return null
  }

  const handleChange = (key: string, value: unknown) => {
    updateStepData(stepId, { [key]: value })
  }

  const errors = stepDef.validate(data)

  return (
    // A column beside the canvas, like the palette: ground divides them.
    <div className={`w-56 shrink-0 ${PAGE_COLUMN_FLUSH}`}>
      <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
        <span className={MASTER_DETAIL_LIST_TITLE_CLASS}>
          {stepTypeLabel(t, 'workflows', stepDef)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {stepDef.configSchema
          .filter(
            (field) =>
              !field.showWhen ||
              (data[field.showWhen.key] ??
                stepDef.configSchema.find((f) => f.key === field.showWhen!.key)
                  ?.default) === field.showWhen.equals,
          )
          .map((field) => (
            <ConfigField
              key={field.key}
              stepType={stepType}
              field={field}
              value={data[field.key] ?? field.default}
              onChange={(v) => handleChange(field.key, v)}
            />
          ))}
        {errors.length > 0 && (
          <ul className="space-y-0.5 rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5">
            {errors.map((err, i) => (
              <li
                key={i}
                className="text-[10px] text-red-600 dark:text-red-400"
              >
                {err}
              </li>
            ))}
          </ul>
        )}
        {stepDef.compat && (
          <p className="rounded-[10px] bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">
            {t('workflows.steps.configPanel.requiresNote', {
              requirement: stepCompatRequires(
                t,
                'workflows',
                stepType,
                stepDef.compat.requires,
              ),
            })}
          </p>
        )}
      </div>
    </div>
  )
}

function ConfigField({
  stepType,
  field,
  value,
  onChange,
}: {
  stepType: string
  field: WorkflowStepConfigField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  switch (field.type) {
    case 'number':
      return (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {stepFieldLabel(t, 'workflows', stepType, field)}
          </label>
          <Input
            type="number"
            className="nodrag h-7 font-mono text-xs"
            value={String(value ?? '')}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              if (Number.isFinite(n)) onChange(n)
            }}
          />
        </div>
      )

    case 'select':
      return (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {stepFieldLabel(t, 'workflows', stepType, field)}
          </label>
          <select
            className="nodrag h-7 w-full rounded border border-border bg-card px-2 text-xs"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {stepOptionLabel(t, 'workflows', stepType, field.key, opt)}
              </option>
            ))}
          </select>
        </div>
      )

    case 'slider':
      return (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {stepFieldLabel(t, 'workflows', stepType, field)}
            </label>
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(value)}%
            </span>
          </div>
          <Slider
            className="nodrag"
            value={[Number(value) || 0]}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      )

    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {stepFieldLabel(t, 'workflows', stepType, field)}
          </label>
          <button
            type="button"
            className="nodrag rounded border border-border px-2 py-0.5 text-[10px]"
            onClick={() => onChange(!value)}
          >
            {value
              ? t('workflows.steps.configPanel.on')
              : t('workflows.steps.configPanel.off')}
          </button>
        </div>
      )

    default:
      return null
  }
}
