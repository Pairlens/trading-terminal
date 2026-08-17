// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared fakes for the data-tool suites.
 *
 * Two suites rather than one, because `hasAppServer` is a module constant read
 * from the build env: a file can mock it to exactly one value, and the whole
 * point of the standalone seam is that it answers differently. Everything they
 * both need lives here so the two cannot drift.
 */
import type { PluginInstance } from '@pairlens/plugin-system/types'

import type { AssistantDeps } from '../tool-deps'

/**
 * The venue-addressed tools build a call context, and that context carries the
 * user's region setting, which is read from `localStorage`. Bun's runner has no
 * DOM, so without this the tools return "localStorage is not defined" instead of
 * data and every venue test passes for the wrong reason.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

export type FakeCapability = { id: string; markets: Array<string> }

export type FakePluginSpec = {
  id: string
  name?: string
  assetClass?: string
  capabilities: Array<FakeCapability>
  /** What `execute` answers. Throw to simulate a venue refusing. */
  execute?: (input: {
    capability: string
    params: Record<string, unknown>
    context: unknown
  }) => Promise<unknown> | unknown
}

export type FakePlugin = {
  instance: PluginInstance
  /** Every `execute` the tool made against this plugin, in order. */
  calls: Array<{ capability: string; params: Record<string, unknown> }>
}

export function fakePlugin(spec: FakePluginSpec): FakePlugin {
  const calls: FakePlugin['calls'] = []
  const instance = {
    manifest: {
      id: spec.id,
      name: spec.name ?? spec.id,
      capabilities: spec.capabilities,
      metadata: spec.assetClass ? { assetClass: spec.assetClass } : {},
    },
    execute: async (input: {
      capability: string
      params: Record<string, unknown>
      context: unknown
    }) => {
      calls.push({ capability: input.capability, params: input.params })
      return spec.execute ? await spec.execute(input) : null
    },
  } as unknown as PluginInstance
  return { instance, calls }
}

export type StubOptions = {
  plugins?: Array<PluginInstance>
  /** Answers `pluginManager.execute`, the resolver-routed path. */
  managerExecute?: (
    capability: string,
    params: Record<string, unknown>,
  ) => Promise<unknown> | unknown
  focus?: { market?: string; pair?: string; timeframe?: string }
}

export type StubDeps = {
  deps: AssistantDeps
  /** Every resolver-routed call, so a test can assert one was never made. */
  managerCalls: Array<{ capability: string; params: Record<string, unknown> }>
}

export function stubDeps(options: StubOptions = {}): StubDeps {
  const managerCalls: StubDeps['managerCalls'] = []
  const deps = {
    pluginManager: {
      getActivePlugins: () => options.plugins ?? [],
      execute: async (
        capability: string,
        params: Record<string, unknown>,
      ): Promise<unknown> => {
        managerCalls.push({ capability, params })
        return options.managerExecute
          ? await options.managerExecute(capability, params)
          : null
      },
    },
    getMarketData: () => null,
    getChart: () => null,
    getWorkbench: () => null,
    getFocus: () => options.focus ?? {},
    navigate: () => {},
    registry: {} as AssistantDeps['registry'],
  } as unknown as AssistantDeps
  return { deps, managerCalls }
}

/** The options object the AI SDK hands `execute`. */
export const TOOL_OPTIONS = { toolCallId: 'test', messages: [] } as never

export type ToolResult = Record<string, unknown>
