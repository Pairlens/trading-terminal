// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ArrowUpDown, Brain, CandlestickChart, Compass } from 'lucide-react'
import { PANE_CATEGORY_DEFINITIONS } from '@pairlens/shared/pane-categories'
import type { LucideIcon } from 'lucide-react'

export type PaneCategoryMeta = {
  id: string
  labelKey: string
  icon: LucideIcon
  order: number
}

const ICON_MAP: Record<string, LucideIcon> = {
  Compass,
  CandlestickChart,
  ArrowUpDown,
  Brain,
}

export const PANE_CATEGORIES: Array<PaneCategoryMeta> =
  PANE_CATEGORY_DEFINITIONS.map((cat) => ({
    id: cat.id,
    labelKey: cat.labelKey,
    icon: ICON_MAP[cat.icon] ?? Compass,
    order: cat.order,
  })).sort((a, b) => a.order - b.order)
