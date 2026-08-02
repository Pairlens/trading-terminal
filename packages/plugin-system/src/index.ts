// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export * from './types.ts'
export { PluginResolver } from './resolver.ts'
export { PluginManager } from './manager.ts'
export type { PluginFactory } from './manager.ts'
export type {
  AccessProvider,
  CapabilityAccessResult,
  CapabilityAccessStatus,
  ContributedCommand,
  ContributedPanel,
  ContributedSettingsPage,
  ContributedStatusBarItem,
  PluginLifecycleListener,
  PluginPermission,
} from './types.ts'
