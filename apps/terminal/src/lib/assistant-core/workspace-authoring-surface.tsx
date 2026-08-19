// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Workspace authoring, published to the assistant ──────────────────
//
// Mounted with the built-in surfaces rather than by a route, because
// none of what it offers is about the screen: the pane catalogue is the
// plugin registry, the workspace tree is a store, and a user who says
// "build me a perps desk" while reading a chart should not have to be
// somewhere particular first.
//
// The actions themselves live in `workspace-authoring-tools.ts`, which
// takes its dependencies as getters. This file is the wiring: it is
// where the live pane registry, the ranked focus and the router are.

import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useAssistantSurface } from './use-assistant-surface'
import { useAssistantSurfaceRegistry } from './surface-registry'
import { buildWorkspaceAuthoringActions } from './workspace-authoring-tools'
import type { AssistantAction } from './types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { builtinProvider } from '@/lib/workspace-store/providers'
import { workspaceTemplateRegistry } from '@/lib/workspace-store/workspace-template-registry'

export function WorkspaceAuthoringSurface() {
  const registry = usePaneRegistry()
  const surfaces = useAssistantSurfaceRegistry()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const actions = useMemo<Array<AssistantAction>>(
    () =>
      buildWorkspaceAuthoringActions({
        getPaneDefinitions: () => registry.getDefinitions(),
        getPluginForPane: (paneType) => registry.getPluginForPane(paneType),
        translate: (key) => t(key),
        getFocus: () => surfaces.getFocus(),
        openWorkspace: (workspaceId) => {
          void navigate({
            to: '/workspace/$workspaceId',
            params: { workspaceId },
          })
        },
        listTemplates,
        isPhone: () =>
          typeof document !== 'undefined' &&
          document.documentElement.dataset.viewport === 'mobile',
        currentPath: () =>
          typeof window === 'undefined' ? '' : window.location.pathname,
      }),
    [registry, surfaces, navigate, t],
  )

  useAssistantSurface({
    id: 'workspace-authoring',
    // Publishes actions and nothing else. It is not a thing on screen,
    // so it must never outrank a surface that is.
    getPriority: () => -200,
    getActions: () => actions,
  })

  return null
}

/**
 * The templates a copy can be made from, without mounting the store's
 * query: the bundled catalogue is in-process and plugin-contributed
 * layouts are already registered, so this costs no network. Community
 * submissions stay on the Workspace Store page, where the trust gate and
 * the dependency panel are.
 */
async function listTemplates(): Promise<Array<WorkspaceTemplate>> {
  const bundled = await builtinProvider.list({ scope: 'all' }).catch(() => [])
  const byId = new Map<string, WorkspaceTemplate>()
  for (const template of bundled) byId.set(template.id, template)
  for (const template of workspaceTemplateRegistry.getTemplates()) {
    byId.set(template.id, template)
  }
  return [...byId.values()]
}
