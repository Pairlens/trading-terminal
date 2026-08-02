// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import {
  useAuth,
  useNotify,
  usePanePair,
  usePluginHost,
} from '@pairlens/plugin-sdk'
// Design system — resolved at runtime via the host's `@pairlens/ui` import-map
// entry, so plugin UIs match Pairlens. Import from the ROOT specifier only
// (subpaths are not mapped). These components carry styles the host already
// ships; for your own ad-hoc layout, use inline styles / CSS vars (as below) or
// ship a `styles.css` with your plugin — arbitrary Tailwind utilities authored
// inside a plugin are not part of the host's compiled CSS.
import { Badge, Button, Separator } from '@pairlens/ui'

export function HelloWorldPanel() {
  const pair = usePanePair()
  const { isAuthenticated } = useAuth()
  const notify = useNotify()
  const host = usePluginHost()
  const [count, setCount] = useState(0)

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>Dev Starter Plugin</span>
        <Badge variant="secondary">v0.1.0</Badge>
      </div>
      <Separator />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 13,
          color: 'var(--muted-foreground)',
        }}
      >
        <div>
          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>
            Active pair:{' '}
          </span>
          {pair ? (
            <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
              {pair.pairKey}
            </span>
          ) : (
            <span style={{ opacity: 0.5 }}>none selected</span>
          )}
        </div>

        <div>
          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>
            Market:{' '}
          </span>
          <span style={{ fontFamily: 'monospace' }}>{pair?.market ?? '—'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>
            Authenticated:
          </span>
          <Badge variant={isAuthenticated ? 'default' : 'destructive'}>
            {isAuthenticated ? 'yes' : 'no'}
          </Badge>
        </div>

        <div>
          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>
            Plugin ID:{' '}
          </span>
          <span style={{ fontFamily: 'monospace' }}>{host.pluginId}</span>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <Button
          size="sm"
          onClick={() => {
            setCount((c) => c + 1)
            notify(
              `Button clicked ${count + 1} time${count === 0 ? '' : 's'}`,
              {
                type: 'success',
              },
            )
          }}
        >
          Click me ({count})
        </Button>
      </div>

      <div
        style={{
          marginTop: 'auto',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          opacity: 0.5,
        }}
      >
        This panel is loaded dynamically and styled with the @pairlens/ui design
        system + @pairlens/plugin-sdk hooks (pair, auth, notifications).
      </div>
    </div>
  )
}
