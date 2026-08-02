// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Globe } from 'lucide-react'

import { BottomPanelPlaceholder } from './bottom-panel-placeholder'

export function SocialPane() {
  return (
    <BottomPanelPlaceholder
      icon={Globe}
      title="Social Trends"
      description="Aggregated social sentiment and trending topics."
    />
  )
}
