// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

import { BottomPanelPlaceholder } from './bottom-panel-placeholder'

export function SocialPane() {
  const { t } = useTranslation()
  return (
    <BottomPanelPlaceholder
      icon={Globe}
      title={t('panes.social')}
      description="Aggregated social sentiment and trending topics."
    />
  )
}
