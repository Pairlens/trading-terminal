// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Message protocol between the plugin sandbox host (main thread) and the
 * sandbox worker. All payloads must be structured-cloneable.
 */
import type { PluginExecuteParams } from '@pairlens/plugin-system'

export type HostToWorkerMessage =
  | {
      type: 'load'
      moduleText: string
      /**
       * Identity the host expects the module to declare (from the registry
       * entry / package manifest / cache meta). The worker rejects modules
       * whose exported manifest does not match, so a module cannot
       * impersonate another plugin id.
       */
      expected?: { id: string; version: string }
    }
  | { type: 'initialize'; id: number; config: Record<string, unknown> }
  | { type: 'execute'; id: number; params: PluginExecuteParams }
  | { type: 'subscribe'; subId: string; params: PluginExecuteParams }
  | { type: 'unsubscribe'; subId: string }
  | { type: 'destroy'; id: number }

export type WorkerToHostMessage =
  | { type: 'loaded'; manifest: unknown }
  | { type: 'load-error'; error: string }
  | { type: 'result'; id: number; ok: true; value: unknown }
  | { type: 'result'; id: number; ok: false; error: string }
  | { type: 'stream'; subId: string; data: unknown }
  | { type: 'subscribe-error'; subId: string; error: string }

/** Error message marker for modules that need main-realm APIs (bare imports). */
export const SANDBOX_IMPORT_ERROR_HINT =
  'This plugin imports host UI modules and cannot run sandboxed — it requires an explicit full-trust grant.'
