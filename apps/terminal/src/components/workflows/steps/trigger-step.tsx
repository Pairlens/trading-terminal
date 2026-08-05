// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { Play } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import type { NodeProps } from '@xyflow/react'

export function TriggerStep(_props: NodeProps) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'w-[180px] rounded-lg border border-emerald-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-emerald-500/10',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15">
          <Play className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('workflows.steps.trigger.title')}
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-[10px] text-emerald-400"
        >
          {t('workflows.steps.trigger.badge')}
        </Badge>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !rounded-full !border-2 !border-emerald-500 !bg-background"
      />
    </div>
  )
}
