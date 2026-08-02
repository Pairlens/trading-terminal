// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { Bell, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

export function OsNotificationStep({ id, data }: NodeProps) {
  const sound = (data.sound as boolean) ?? true

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  return (
    <div
      className={cn(
        'w-[200px] rounded-lg border border-blue-500/40 bg-card px-3 py-2.5',
        'shadow-sm shadow-blue-500/10',
        !!data.disconnected && 'border-blue-500/20 opacity-60',
        !!data.isNew && 'ring-1 ring-blue-400/50',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !rounded-full !border-2 !border-blue-500 !bg-background"
      />

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-500/15">
          <Bell className="size-3.5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            OS Notification
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-blue-500/30 text-[10px] text-blue-400"
        >
          Channel
        </Badge>
      </div>

      <div className="mt-2">
        {/* Sound toggle */}
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Sound
          </div>
          <button
            type="button"
            className={cn(
              'nodrag nopan nowheel flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors',
              sound
                ? 'bg-blue-500/15 text-blue-400'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={() => handleChange('sound', !sound)}
          >
            {sound ? (
              <>
                <Volume2 className="size-2.5" />
                On
              </>
            ) : (
              <>
                <VolumeX className="size-2.5" />
                Off
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
