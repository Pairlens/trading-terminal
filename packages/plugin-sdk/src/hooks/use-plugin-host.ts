// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useContext } from 'react'

import { PluginHostContext } from '../host-context'
import type { PluginHostServices } from '../host-context'

export function usePluginHost(): PluginHostServices {
  const ctx = useContext(PluginHostContext)
  if (!ctx) {
    throw new Error(
      'usePluginHost must be used within a PluginHostContext.Provider — ' +
        'this usually means the component is not rendered inside a terminal pane.',
    )
  }
  return ctx
}
