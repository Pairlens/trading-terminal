// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePluginHost } from './use-plugin-host'

export function usePluginConfig<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): T {
  return usePluginHost().config as T
}
