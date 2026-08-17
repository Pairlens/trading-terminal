// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Activity,
  BarChart3,
  Brain,
  Building2,
  CandlestickChart,
  Compass,
  Crosshair,
  Diamond,
  Droplets,
  Eye,
  Flame,
  Gauge,
  Globe,
  Home,
  Layers,
  ListOrdered,
  Radio,
  Rocket,
  Scale,
  Scan,
  Shield,
  ShieldCheck,
  Star,
  Target,
  Timer,
  TrendingUp,
  Vote,
  Waypoints,
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
  Scale,
  Vote,
  Building2,
  Droplets,
  ListOrdered,
  ShieldCheck,
  Timer,
  Waypoints,
}

export const DEFAULT_WORKSPACE_ICON = 'Layers'

export function getWorkspaceIcon(name?: string): LucideIcon {
  if (!name) return WORKSPACE_ICONS[DEFAULT_WORKSPACE_ICON]
  return WORKSPACE_ICONS[name] ?? WORKSPACE_ICONS[DEFAULT_WORKSPACE_ICON]
}
