// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Handle, Position } from '@xyflow/react'
import { Webhook } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'

const methodOptions = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
] as const

export function WebhookStep({ id, data }: NodeProps) {
  const url = (data.url as string) ?? ''
  const method = (data.method as string) ?? 'POST'

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  // Truncate URL for display in the summary row
  const displayUrl = url
    ? url.length > 28
      ? url.slice(0, 28) + '...'
      : url
    : 'Not set'

  return (
    <div
      className={cn(
        'w-[210px] rounded-lg border border-blue-500/40 bg-card px-3 py-2.5',
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
          <Webhook className="size-3.5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            Webhook
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-blue-500/30 text-[10px] text-blue-400"
        >
          Channel
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* URL */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            URL
          </div>
          <input
            type="text"
            className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            placeholder="https://example.com/webhook"
            value={url}
            onChange={(e) => handleChange('url', e.target.value)}
          />
          {url && (
            <div
              className="mt-0.5 truncate font-mono text-[8px] text-muted-foreground"
              title={url}
            >
              {displayUrl}
            </div>
          )}
        </div>

        {/* Method */}
        <div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Method
          </div>
          <div className="nodrag nopan nowheel mt-0.5 flex overflow-hidden rounded border border-border text-[9px]">
            {methodOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'flex-1 px-1.5 py-0.5 transition-colors',
                  method === opt.value
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => handleChange('method', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
