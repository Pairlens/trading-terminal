// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

import { cn } from '@pairlens/ui'

import {
  MASTER_DETAIL_LIST_HEADER_CLASS,
  MASTER_DETAIL_LIST_TITLE_CLASS,
} from '../master-detail'
import type { NotificationStepTypeDefinition } from '@pairlens/notification-engine/step-registry'

import { PAGE_COLUMN_FLUSH } from '@/components/chrome/page-chrome'
import { useNotificationStepRegistry } from '@/lib/notifications/notification-step-registry'
import {
  FallbackStepIcon,
  getNotificationStepIcon,
} from '@/lib/notifications/notification-icons'
import { stepTypeLabel } from '@/lib/registry-labels'

const CATEGORY_ORDER = ['event', 'condition', 'channel'] as const

type StepPaletteProps = {
  onAddStep?: (stepType: string) => void
}

export function StepPalette({ onAddStep }: StepPaletteProps) {
  const { t } = useTranslation()
  const CATEGORY_LABELS: Record<string, string> = {
    event: t('notifications.builder.palette.categoryEvents'),
    condition: t('notifications.builder.palette.categoryConditions'),
    channel: t('notifications.builder.palette.categoryChannels'),
  }
  const registry = useNotificationStepRegistry()
  const stepTypes = registry.getAllDefinitions()

  // Group by category
  const grouped = new Map<string, Array<NotificationStepTypeDefinition>>()
  for (const st of stepTypes) {
    const existing = grouped.get(st.category) ?? []
    existing.push(st)
    grouped.set(st.category, existing)
  }

  const handleClick = useCallback(
    (stepType: string) => {
      onAddStep?.(stepType)
    },
    [onAddStep],
  )

  return (
    // Its own column on the ground, the same as the rule list opposite: what
    // used to divide it from the canvas was a `border-l`, and what divides it
    // now is 10px of ground.
    <div className={`w-56 shrink-0 ${PAGE_COLUMN_FLUSH}`}>
      <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
        <span className={MASTER_DETAIL_LIST_TITLE_CLASS}>
          {t('notifications.builder.palette.addStep')}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat)
          if (!items?.length) return null
          return (
            <div key={cat} className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {items.map((st) => {
                const CustomIcon = registry.getIconComponent(st.type)
                const LucideIcon = getNotificationStepIcon(st.icon)
                const Icon = CustomIcon ?? LucideIcon ?? FallbackStepIcon
                return (
                  <div
                    key={st.type}
                    onClick={() => handleClick(st.type)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                      'text-muted-foreground transition-colors',
                      'hover:bg-muted hover:text-foreground',
                      'active:bg-accent',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span>{stepTypeLabel(t, 'notifications', st)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
