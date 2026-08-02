// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Host context
export {
  PluginHostContext,
  type PluginHostServices,
  type PanePairState,
  type PaneWalletState,
  type NotifyOptions,
} from './host-context'

// Hooks
export { usePluginHost } from './hooks/use-plugin-host'
export { usePanePair } from './hooks/use-pane-pair'
export { usePaneWallet } from './hooks/use-pane-wallet'
export { useCapability } from './hooks/use-capability'
export { useCapabilityStream } from './hooks/use-stream'
export { useAuth } from './hooks/use-auth'
export { usePluginNavigate } from './hooks/use-navigate'
export { useNotify } from './hooks/use-notify'
export { usePluginConfig } from './hooks/use-plugin-config'
export { usePluginStorage } from './hooks/use-persistence'

// TanStack Query hooks
export { usePluginQuery } from './hooks/use-plugin-query'
export { usePluginInfiniteQuery } from './hooks/use-plugin-infinite-query'
export { usePluginMutation } from './hooks/use-plugin-mutation'
export { usePluginFetch } from './hooks/use-plugin-fetch'

// Service registry hooks
export { useServiceRegistry } from './hooks/use-service-registry'
export { usePluginService } from './hooks/use-plugin-service'

// Types re-exports
export type {
  CapabilityId,
  ContributedCommand,
  ContributedPanel,
  ContributedSettingsPage,
  ContributedStatusBarItem,
  PluginManifest,
  PluginInstance,
  PluginFactory,
  PluginStatus,
  PluginContext,
  PluginExecuteParams,
  PluginCapabilityDeclaration,
  PluginConfigField,
  PluginConfigFieldType,
  PluginPermission,
} from './types/index'

// Workflow step types — re-exported for plugin authors
export type {
  WorkflowStepTypeDefinition,
  StepExecuteContext,
  HandleDef,
  WorkflowStepConfigField,
  StepCategory,
} from '@pairlens/workflow-engine/step-registry'
export {
  resolveSide,
  resolveSize,
  resolvePrice,
} from '@pairlens/workflow-engine/executor'
