// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Indicator workbench service ──────────────────────────────────────
//
// The workbench is a route, so it renders below the outlet. It publishes
// the very bridge it already hands to its own assistant panel, so the dock
// above the outlet can select scripts, apply edits and re-run the preview
// without a second contract to keep in step.

import type { AssistantWorkbenchBridge } from '@/lib/assistant/assistant-tools'

/** The registry name the indicator workbench publishes under. */
export const WORKBENCH_SERVICE_NAME = 'indicator-workbench'

/**
 * Owner id for the registration. The workbench is terminal code rather than
 * a plugin, so it claims a name no plugin ledger entry can be swept with.
 */
export const WORKBENCH_SERVICE_OWNER = 'builtin'

export type WorkbenchServiceHandle = AssistantWorkbenchBridge
