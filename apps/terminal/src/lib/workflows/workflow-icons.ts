// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Activity,
  ArrowUpDown,
  Bell,
  Clock,
  Filter,
  GitBranch,
  GitFork,
  Percent,
  Play,
  Puzzle,
  Repeat,
  ShieldAlert,
  Signal,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const WORKFLOW_STEP_ICONS: Record<string, LucideIcon> = {
  Activity,
  ArrowUpDown,
  Bell,
  Clock,
  Filter,
  GitBranch,
  GitFork,
  Percent,
  Play,
  Repeat,
  ShieldAlert,
  Signal,
  Target,
  Timer,
  TrendingUp,
  Zap,
}

export function getWorkflowStepIcon(name?: string): LucideIcon | null {
  if (!name) return null
  return WORKFLOW_STEP_ICONS[name] ?? null
}

export { Puzzle as FallbackStepIcon }
