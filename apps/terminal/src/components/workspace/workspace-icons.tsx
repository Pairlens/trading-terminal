// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Activity,
  BarChart3,
  Brain,
  CandlestickChart,
  Compass,
  Crosshair,
  Diamond,
  Eye,
  Flame,
  Gauge,
  Globe,
  Home,
  Layers,
  Radio,
  Rocket,
  Scan,
  Shield,
  Star,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  Layers,
  BarChart3,
  CandlestickChart,
  TrendingUp,
  Activity,
  Target,
  Zap,
  Brain,
  Globe,
  Home,
  Shield,
  Star,
  Gauge,
  Eye,
  Rocket,
  Compass,
  Diamond,
  Flame,
  Crosshair,
  Radio,
  Scan,
}

export const DEFAULT_WORKSPACE_ICON = 'Layers'

export function getWorkspaceIcon(name?: string): LucideIcon {
  if (!name) return WORKSPACE_ICONS[DEFAULT_WORKSPACE_ICON]
  return WORKSPACE_ICONS[name] ?? WORKSPACE_ICONS[DEFAULT_WORKSPACE_ICON]
}
