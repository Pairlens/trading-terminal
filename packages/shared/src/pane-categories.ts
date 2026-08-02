// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type PaneCategoryId = string

export type PaneCategoryDefinition = {
  id: PaneCategoryId
  label: string
  labelKey: string
  icon: string // lucide icon name
  order: number
}

export const PANE_CATEGORY_DEFINITIONS: Array<PaneCategoryDefinition> = [
  {
    id: 'discovery',
    label: 'Discovery',
    labelKey: 'paneCategories.discovery',
    icon: 'Compass',
    order: 0,
  },
  {
    id: 'charting',
    label: 'Charting',
    labelKey: 'paneCategories.charting',
    icon: 'CandlestickChart',
    order: 1,
  },
  {
    id: 'trading',
    label: 'Trading',
    labelKey: 'paneCategories.trading',
    icon: 'ArrowUpDown',
    order: 2,
  },
  {
    id: 'ai-research',
    label: 'AI & Research',
    labelKey: 'paneCategories.aiResearch',
    icon: 'Brain',
    order: 3,
  },
]
