// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
var Q = Object.defineProperty
var I = (o, n) => {
  for (var r in n)
    Q(o, r, {
      get: n[r],
      enumerable: !0,
      configurable: !0,
      set: (m) => (n[r] = () => m),
    })
}
var M = (o, n) => () => (o && (n = o((o = 0))), n)
var _ = {}
I(_, { ControllerPanel: () => $ })
import { useCallback as U, useState as W } from 'react'
import { usePluginService as X } from '@pairlens/plugin-sdk'
import { jsxDEV as i, Fragment as A } from 'react/jsx-dev-runtime'
function $() {
  let o = X('dev-sync:display'),
    [n, r] = W(0),
    m = U(() => {
      ;(o?.ping(), r((a) => a + 1))
    }, [o]),
    p = o !== null
  return i(
    'div',
    {
      style: {
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      },
      children: [
        i(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 12,
            },
            children: [
              i(
                'span',
                {
                  style: { fontSize: 14, fontWeight: 600 },
                  children: 'Sync Controller',
                },
                void 0,
                !1,
                void 0,
                this,
              ),
              i(
                'span',
                {
                  style: {
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 9999,
                    background: p
                      ? 'color-mix(in srgb, var(--chart-2) 20%, transparent)'
                      : 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                    color: p ? 'var(--chart-2)' : 'var(--destructive)',
                  },
                  children: p ? 'connected' : 'waiting for display',
                },
                void 0,
                !1,
                void 0,
                this,
              ),
            ],
          },
          void 0,
          !0,
          void 0,
          this,
        ),
        !p
          ? i(
              'div',
              {
                style: {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: 'var(--muted-foreground)',
                  fontSize: 12,
                  textAlign: 'center',
                },
                children: [
                  i(
                    'span',
                    { style: { fontSize: 24 }, children: '\uD83D\uDD0C' },
                    void 0,
                    !1,
                    void 0,
                    this,
                  ),
                  i(
                    'span',
                    { children: 'Add a "Sync Display" panel to connect' },
                    void 0,
                    !1,
                    void 0,
                    this,
                  ),
                  i(
                    'span',
                    {
                      style: { fontSize: 10, opacity: 0.6 },
                      children:
                        'The display registers "dev-sync:display" in the Service Registry',
                    },
                    void 0,
                    !1,
                    void 0,
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              void 0,
              this,
            )
          : i(
              A,
              {
                children: [
                  i(
                    'div',
                    {
                      children: [
                        i(
                          'div',
                          {
                            style: {
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: 'var(--muted-foreground)',
                              marginBottom: 6,
                            },
                            children: 'Set color',
                          },
                          void 0,
                          !1,
                          void 0,
                          this,
                        ),
                        i(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                            },
                            children: Y.map((a) =>
                              i(
                                'button',
                                {
                                  onClick: () => o.setColor(a.value),
                                  style: {
                                    padding: '4px 10px',
                                    fontSize: 11,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: a.value,
                                    cursor: 'pointer',
                                  },
                                  children: a.label,
                                },
                                a.value,
                                !1,
                                void 0,
                                this,
                              ),
                            ),
                          },
                          void 0,
                          !1,
                          void 0,
                          this,
                        ),
                      ],
                    },
                    void 0,
                    !0,
                    void 0,
                    this,
                  ),
                  i(
                    'div',
                    {
                      children: [
                        i(
                          'div',
                          {
                            style: {
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: 'var(--muted-foreground)',
                              marginBottom: 6,
                            },
                            children: 'Set message',
                          },
                          void 0,
                          !1,
                          void 0,
                          this,
                        ),
                        i(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            },
                            children: Z.map((a) =>
                              i(
                                'button',
                                {
                                  onClick: () => o.setMessage(a),
                                  style: {
                                    padding: '4px 10px',
                                    fontSize: 11,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--foreground)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                  },
                                  children: a,
                                },
                                a,
                                !1,
                                void 0,
                                this,
                              ),
                            ),
                          },
                          void 0,
                          !1,
                          void 0,
                          this,
                        ),
                      ],
                    },
                    void 0,
                    !0,
                    void 0,
                    this,
                  ),
                  i(
                    'div',
                    {
                      style: { marginTop: 'auto' },
                      children: i(
                        'button',
                        {
                          onClick: m,
                          style: {
                            padding: '6px 14px',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--primary)',
                            color: 'var(--primary-foreground)',
                            cursor: 'pointer',
                            width: '100%',
                          },
                          children: ['Ping display (', n, ')'],
                        },
                        void 0,
                        !0,
                        void 0,
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    void 0,
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              void 0,
              this,
            ),
        i(
          'div',
          {
            style: {
              fontSize: 10,
              color: 'var(--muted-foreground)',
              opacity: 0.5,
            },
            children:
              "Uses usePluginService('dev-sync:display') to discover the display",
          },
          void 0,
          !1,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
var Y, Z
var b = M(() => {
  ;((Y = [
    { label: 'Cyan', value: '#06b6d4' },
    { label: 'Green', value: '#22c55e' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Rose', value: '#f43f5e' },
    { label: 'Violet', value: '#8b5cf6' },
  ]),
    (Z = [
      'Hello from Controller!',
      'Service Registry is working',
      'Cross-panel sync demo',
      'Plugins can talk to each other',
    ]))
})
var q = {}
I(q, { DisplayPanel: () => v })
import {
  useCallback as G,
  useEffect as L,
  useRef as N,
  useState as t,
} from 'react'
import { useServiceRegistry as h } from '@pairlens/plugin-sdk'
import { jsxDEV as f } from 'react/jsx-dev-runtime'
function v() {
  let o = h(),
    [n, r] = t('#06b6d4'),
    [m, p] = t('Waiting for commands...'),
    [a, H] = t(0),
    [J, y] = t(!1),
    K = N(n)
  K.current = n
  let z = G(() => {
    ;(H((P) => P + 1), y(!0), setTimeout(() => y(!1), 300))
  }, [])
  return (
    L(() => {
      let P = {
        setColor: (l) => r(l),
        setMessage: (l) => p(l),
        ping: () => z(),
      }
      return o.register('dev-sync:display', P)
    }, [o, z]),
    f(
      'div',
      {
        style: {
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          transition: 'background-color 0.3s',
          backgroundColor: J
            ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
            : 'transparent',
        },
        children: [
          f(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 12,
              },
              children: [
                f(
                  'span',
                  {
                    style: { fontSize: 14, fontWeight: 600 },
                    children: 'Sync Display',
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
                f(
                  'span',
                  {
                    style: {
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 9999,
                      background:
                        'color-mix(in srgb, var(--chart-2) 20%, transparent)',
                      color: 'var(--chart-2)',
                    },
                    children: 'service registered',
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
              ],
            },
            void 0,
            !0,
            void 0,
            this,
          ),
          f(
            'div',
            {
              style: {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                borderRadius: 12,
                border: `2px solid ${n}`,
                background: `color-mix(in srgb, ${n} 8%, transparent)`,
                transition: 'all 0.3s',
              },
              children: [
                f(
                  'div',
                  {
                    style: {
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: n,
                      transition: 'background 0.3s',
                      boxShadow: `0 0 20px color-mix(in srgb, ${n} 40%, transparent)`,
                    },
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
                f(
                  'div',
                  {
                    style: {
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      textAlign: 'center',
                    },
                    children: m,
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
                a > 0 &&
                  f(
                    'div',
                    {
                      style: {
                        fontSize: 11,
                        color: 'var(--muted-foreground)',
                        fontFamily: 'monospace',
                      },
                      children: ['pings received: ', a],
                    },
                    void 0,
                    !0,
                    void 0,
                    this,
                  ),
              ],
            },
            void 0,
            !0,
            void 0,
            this,
          ),
          f(
            'div',
            {
              style: {
                fontSize: 10,
                color: 'var(--muted-foreground)',
                opacity: 0.5,
              },
              children:
                'Registers "dev-sync:display" via useServiceRegistry().register()',
            },
            void 0,
            !1,
            void 0,
            this,
          ),
        ],
      },
      void 0,
      !0,
      void 0,
      this,
    )
  )
}
var w = () => {}
import { lazy as B } from 'react'
var c = {
  id: 'dev-sync',
  name: 'Dev Sync',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Demonstrates cross-panel communication via the Service Registry — one panel controls another',
  homepage: 'https://pairlens.finance',
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'controller',
        label: 'Sync Controller',
        icon: 'Radio',
        category: 'discovery',
        description:
          'Sends commands to the Sync Display panel via the Service Registry',
      },
      {
        id: 'display',
        label: 'Sync Display',
        icon: 'Monitor',
        category: 'discovery',
        description:
          'Receives and renders commands from the Sync Controller panel',
      },
    ],
  },
}
function e(o) {
  return {
    manifest: o,
    status: 'installed',
    config: {},
    execute: async (n) => null,
    getContributedComponents: () => ({
      controller: B(() =>
        Promise.resolve()
          .then(() => (b(), _))
          .then((n) => ({ default: n.ControllerPanel })),
      ),
      display: B(() =>
        Promise.resolve()
          .then(() => (w(), q))
          .then((n) => ({ default: n.DisplayPanel })),
      ),
    }),
  }
}
export { c as manifest, e as createPlugin }
