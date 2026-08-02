// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

type BottomPanelPlaceholderProps = {
  icon: LucideIcon
  title: string
  description?: string
}

export function BottomPanelPlaceholder({
  icon: Icon,
  title,
  description,
}: BottomPanelPlaceholderProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">
        <Icon className="mx-auto mb-2 size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          {description ?? t('common.comingSoon')}
        </p>
      </div>
    </div>
  )
}
