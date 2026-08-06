// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Handle, Position } from '@xyflow/react'
import { BellOff, Send, Volume2 } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'

import { useNotificationStepDataUpdate } from '../use-step-data'
import type { NodeProps } from '@xyflow/react'
import { useTelegramConnection } from '@/hooks/use-telegram-connection'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

/**
 * The Telegram channel node.
 *
 * It shows connection state because this is the one channel that can be fully
 * configured on the canvas and still deliver nothing: the bot token lives in
 * the keychain, set up in Settings. A node that looked complete while no bot
 * was connected would fail silently at the first alert, so the unconnected
 * state is a button that goes and fixes it.
 */
export function TelegramStep({ id, data }: NodeProps) {
  const { t } = useTranslation()
  const connection = useTelegramConnection()
  const openSettings = useSettingsDialogStore((s) => s.open)

  const chatId = (data.chatId as string) ?? ''
  const silent = (data.silent as boolean) ?? false

  const updateStepData = useNotificationStepDataUpdate()
  const handleChange = (key: string, value: unknown) =>
    updateStepData(id, { [key]: value })

  const linkedChat = connection?.chat?.title ?? ''

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
          <Send className="size-3.5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">
            {t('notifications.builder.steps.telegram.title')}
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-blue-500/30 text-[10px] text-blue-400"
        >
          {t('notifications.builder.category.channel')}
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {connection ? (
          <>
            <div className="truncate font-mono text-[9px] text-muted-foreground">
              @{connection.botUsername}
            </div>

            {/* Chat ID — blank routes to the chat linked in settings */}
            <div>
              <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('notifications.builder.steps.telegram.chatId')}
              </div>
              <input
                type="text"
                className="nodrag nopan nowheel mt-0.5 h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
                placeholder={
                  linkedChat ||
                  t('notifications.builder.steps.telegram.noChatLinked')
                }
                value={chatId}
                onChange={(e) => handleChange('chatId', e.target.value)}
              />
              {!chatId && !linkedChat && (
                <button
                  type="button"
                  className="nodrag nopan mt-1 text-[9px] text-blue-400 underline-offset-2 hover:underline"
                  onClick={() => openSettings('notifications')}
                >
                  {t('notifications.builder.steps.telegram.linkChat')}
                </button>
              )}
            </div>

            {/* Silent delivery */}
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('notifications.builder.steps.telegram.silent')}
              </div>
              <button
                type="button"
                className={cn(
                  'nodrag nopan nowheel flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors',
                  silent
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-muted text-muted-foreground',
                )}
                onClick={() => handleChange('silent', !silent)}
              >
                {silent ? (
                  <>
                    <BellOff className="size-2.5" />
                    {t('notifications.builder.toggleOn')}
                  </>
                ) : (
                  <>
                    <Volume2 className="size-2.5" />
                    {t('notifications.builder.toggleOff')}
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              {t('notifications.builder.steps.telegram.notConnected')}
            </p>
            <button
              type="button"
              className="nodrag nopan w-full rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
              onClick={() => openSettings('notifications')}
            >
              {t('notifications.builder.steps.telegram.connect')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
