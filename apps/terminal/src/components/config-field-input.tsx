// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'

import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Switch } from '@pairlens/ui/components/ui/switch'
import type { PluginConfigField } from '@pairlens/plugin-system'

export function ConfigFieldInput({
  fieldKey,
  field,
  value,
  disabled,
  onChange,
}: {
  fieldKey: string
  field: PluginConfigField
  value: unknown
  disabled: boolean
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const id = `plugin-config-${fieldKey}`

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {field.label}
        </label>
        <Switch
          id={id}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </label>
        <Select
          value={String(value ?? '')}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue
              placeholder={t('configField.selectLabel', {
                label: field.label.toLowerCase(),
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const inputType =
    field.type === 'secret'
      ? 'password'
      : field.type === 'number'
        ? 'number'
        : 'text'

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      <Input
        id={id}
        type={inputType}
        autoComplete="off"
        disabled={disabled}
        value={String(value ?? '')}
        placeholder={
          field.type === 'secret' ? t('configField.enterSecret') : undefined
        }
        onChange={(e) =>
          onChange(
            field.type === 'number' ? Number(e.target.value) : e.target.value,
          )
        }
      />
    </div>
  )
}
