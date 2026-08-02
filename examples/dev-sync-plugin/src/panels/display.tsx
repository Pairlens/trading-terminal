// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { useServiceRegistry } from '@pairlens/plugin-sdk'
import type { SyncDisplayService } from './controller'

/**
 * Display panel — registers the "dev-sync:display" service so the
 * Controller panel (or any other panel) can discover and call it.
 *
 * This demonstrates the "provider" side of the Service Registry pattern.
 */
export function DisplayPanel() {
  const registry = useServiceRegistry()
  const [color, setColor] = useState('#06b6d4')
  const [message, setMessage] = useState('Waiting for commands...')
  const [pingCount, setPingCount] = useState(0)
  const [flash, setFlash] = useState(false)

  // Use refs so the service callbacks always see current state
  const colorRef = useRef(color)
  colorRef.current = color

  const handlePing = useCallback(() => {
    setPingCount((c) => c + 1)
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [])

  // Register the service on mount, unregister on unmount
  useEffect(() => {
    const service: SyncDisplayService = {
      setColor: (c) => setColor(c),
      setMessage: (m) => setMessage(m),
      ping: () => handlePing(),
    }
    return registry.register('dev-sync:display', service)
  }, [registry, handlePing])

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        transition: 'background-color 0.3s',
        backgroundColor: flash
          ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
          : 'transparent',
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
        <span style={{ fontSize: 14, fontWeight: 600 }}>Sync Display</span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 9999,
            background: 'color-mix(in srgb, var(--chart-2) 20%, transparent)',
            color: 'var(--chart-2)',
          }}
        >
          service registered
        </span>
      </div>

      {/* Visual display */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          borderRadius: 12,
          border: `2px solid ${color}`,
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
          transition: 'all 0.3s',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: color,
            transition: 'background 0.3s',
            boxShadow: `0 0 20px color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        />
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--foreground)',
            textAlign: 'center',
          }}
        >
          {message}
        </div>
        {pingCount > 0 && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted-foreground)',
              fontFamily: 'monospace',
            }}
          >
            pings received: {pingCount}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--muted-foreground)',
          opacity: 0.5,
        }}
      >
        Registers "dev-sync:display" via useServiceRegistry().register()
      </div>
    </div>
  )
}
