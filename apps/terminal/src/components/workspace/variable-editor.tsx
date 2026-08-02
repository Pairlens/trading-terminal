// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { Dispatch, SetStateAction } from 'react'
import type {
  WorkspaceVariableDefinition,
  WorkspaceVariableType,
} from '@/lib/layout/types'
import type { VariableEditorRow } from '@/lib/layout/variable-utils'
import {
  DEFAULT_TIMEFRAME,
  VARIABLE_TIMEFRAME_OPTIONS,
  addRow,
  removeRow,
  updateRow,
} from '@/lib/layout/variable-utils'

type VariableEditorProps = {
  rows: Array<VariableEditorRow>
  // Functional updates keep rapid interactions (double-click Add) lossless
  onChange: Dispatch<SetStateAction<Array<VariableEditorRow>>>
  /** Bound-pane count per variable name — enables usage hints + safe delete. */
  usage?: Record<string, number>
}

export function VariableEditor({ rows, onChange, usage }: VariableEditorProps) {
  const { t } = useTranslation()

  const handleAdd = useCallback(
    () => onChange((prev) => addRow(prev)),
    [onChange],
  )

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{t('workspace.variables.title')}</Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleAdd}
        >
          <Plus className="size-3" />
          {t('common.add')}
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('workspace.variables.emptyState')}
        </p>
      )}

      {rows.map((row) => (
        <VariableRow
          key={row.key}
          row={row}
          usageCount={usage?.[row.def.name] ?? 0}
          onUpdate={(patch) =>
            onChange((prev) => updateRow(prev, row.key, patch))
          }
          onRemove={() => onChange((prev) => removeRow(prev, row.key))}
        />
      ))}
    </div>
  )
}

function VariableRow({
  row,
  usageCount,
  onUpdate,
  onRemove,
}: {
  row: VariableEditorRow
  usageCount: number
  onUpdate: (patch: Partial<WorkspaceVariableDefinition>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { def } = row

  return (
    <div className="grid gap-1.5 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Input
          value={def.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-8 flex-1 text-xs"
          placeholder={t('workspace.variables.labelPlaceholder')}
        />
        <Select
          value={def.type}
          items={{
            pair: t('workspace.variables.typePair'),
            timeframe: t('workspace.variables.typeTimeframe'),
            wallet: t('workspace.variables.typeWallet'),
            string: t('workspace.variables.typeString'),
          }}
          onValueChange={(val) =>
            onUpdate({ type: val as WorkspaceVariableType })
          }
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pair">
              {t('workspace.variables.typePair')}
            </SelectItem>
            <SelectItem value="timeframe">
              {t('workspace.variables.typeTimeframe')}
            </SelectItem>
            <SelectItem value="wallet">
              {t('workspace.variables.typeWallet')}
            </SelectItem>
            <SelectItem value="string">
              {t('workspace.variables.typeString')}
            </SelectItem>
          </SelectContent>
        </Select>
        <RemoveVariableButton usageCount={usageCount} onRemove={onRemove} />
      </div>

      <div className="flex min-h-5 items-center gap-2 text-[10px] text-muted-foreground/70">
        <span className="font-mono">{def.name}</span>
        {usageCount > 0 && (
          <span className="flex items-center gap-1">
            <Link2 className="size-2.5" />
            {t('workspace.variables.usedByPanes', { count: usageCount })}
          </span>
        )}
        <DefaultValueControl def={def} onUpdate={onUpdate} />
      </div>
    </div>
  )
}

/** Inline default-value editor for types with sensible literal defaults. */
function DefaultValueControl({
  def,
  onUpdate,
}: {
  def: WorkspaceVariableDefinition
  onUpdate: (patch: Partial<WorkspaceVariableDefinition>) => void
}) {
  const { t } = useTranslation()

  if (def.type === 'timeframe') {
    return (
      <span className="ml-auto flex items-center gap-1.5">
        {t('workspace.variables.default')}
        <Select
          value={(def.defaultValue as string | undefined) ?? DEFAULT_TIMEFRAME}
          items={VARIABLE_TIMEFRAME_OPTIONS}
          onValueChange={(v) => {
            if (v) onUpdate({ defaultValue: v })
          }}
        >
          <SelectTrigger className="h-6 w-16 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VARIABLE_TIMEFRAME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
    )
  }

  if (def.type === 'string') {
    return (
      <span className="ml-auto flex items-center gap-1.5">
        {t('workspace.variables.default')}
        <Input
          value={(def.defaultValue as string | undefined) ?? ''}
          onChange={(e) =>
            onUpdate({ defaultValue: e.target.value || undefined })
          }
          className="h-6 w-24 text-[10px]"
          placeholder="—"
        />
      </span>
    )
  }

  return null
}

/**
 * Two-step delete for variables that panes are bound to: the first click
 * arms the button (showing what's at stake), the second removes.
 */
function RemoveVariableButton({
  usageCount,
  onRemove,
}: {
  usageCount: number
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [armed, setArmed] = useState(false)
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current)
    },
    [],
  )

  if (usageCount > 0 && !armed) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-7 text-muted-foreground hover:text-destructive"
        aria-label={t('common.delete')}
        onClick={() => {
          setArmed(true)
          disarmTimer.current = setTimeout(() => setArmed(false), 3000)
        }}
      >
        <Trash2 className="size-3" />
      </Button>
    )
  }

  if (armed) {
    return (
      <Button
        variant="destructive"
        size="sm"
        className="h-7 px-2 text-[10px]"
        onClick={onRemove}
      >
        {t('workspace.variables.confirmRemove')}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="size-7 text-muted-foreground hover:text-destructive"
      aria-label={t('common.delete')}
      onClick={onRemove}
    >
      <Trash2 className="size-3" />
    </Button>
  )
}
