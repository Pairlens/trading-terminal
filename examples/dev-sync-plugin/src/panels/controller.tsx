// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useState } from 'react'
import { usePluginService, useServiceRegistry } from '@pairlens/plugin-sdk'

/**
 * The service contract — shared between controller and display.
 * In a real plugin you'd put this in a shared types file.
 */
export type SyncDisplayService = {
  setColor: (color: string) => void
  setMessage: (message: string) => void
  ping: () => void
}

const COLORS = [
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Violet', value: '#8b5cf6' },
]

const MESSAGES = [
  'Hello from Controller!',
  'Service Registry is working',
  'Cross-panel sync demo',
  'Plugins can talk to each other',
]

/**
 * Controller panel — sends commands to the Display panel via the Service Registry.
 *
 * This panel does NOT register a service. It discovers and calls
 * the "dev-sync:display" service registered by the Display panel.
 */
export function ControllerPanel() {
  const display = usePluginService<SyncDisplayService>('dev-sync:display')
  const [pingCount, setPingCount] = useState(0)

  const handlePing = useCallback(() => {
    display?.ping()
    setPingCount((c) => c + 1)
  }, [display])

  const connected = display !== null

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Sync Controller</span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 9999,
            background: connected
              ? 'color-mix(in srgb, var(--chart-2) 20%, transparent)'
              : 'color-mix(in srgb, var(--destructive) 20%, transparent)',
            color: connected ? 'var(--chart-2)' : 'var(--destructive)',
          }}
        >
          {connected ? 'connected' : 'waiting for display'}
        </span>
      </div>

      {!connected ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--muted-foreground)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 24 }}>&#128268;</span>
          <span>Add a "Sync Display" panel to connect</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            The display registers "dev-sync:display" in the Service Registry
          </span>
        </div>
      ) : (
        <>
          {/* Color buttons */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted-foreground)',
                marginBottom: 6,
              }}
            >
              Set color
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => display.setColor(c.value)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: c.value,
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message buttons */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted-foreground)',
                marginBottom: 6,
              }}
            >
              Set message
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {MESSAGES.map((msg) => (
                <button
                  key={msg}
                  onClick={() => display.setMessage(msg)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Ping */}
          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={handlePing}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Ping display ({pingCount})
            </button>
          </div>
        </>
      )}

      <div
        style={{
          fontSize: 10,
          color: 'var(--muted-foreground)',
          opacity: 0.5,
        }}
      >
        Uses usePluginService('dev-sync:display') to discover the display
      </div>
    </div>
  )
}
