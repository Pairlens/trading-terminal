// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { lazy as Q } from 'react'
import { useState as y } from 'react'
import {
  usePanePair as q,
  useAuth as F,
  useNotify as G,
  usePluginHost as H,
} from '@pairlens/plugin-sdk'
import { Badge as i, Button as L, Separator as M } from '@pairlens/ui'
import { jsxDEV as l } from 'react/jsx-dev-runtime'
function S() {
  let r = q(),
    { isAuthenticated: b } = F(),
    v = G(),
    k = H(),
    [g, o] = y(0)
  return l(
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
        l(
          'div',
          {
            style: { display: 'flex', alignItems: 'center', gap: 8 },
            children: [
              l(
                'span',
                { style: { fontSize: 16 }, children: 'Dev Starter Plugin' },
                void 0,
                !1,
                void 0,
                this,
              ),
              l(
                i,
                { variant: 'secondary', children: 'v0.1.0' },
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
        l(M, {}, void 0, !1, void 0, this),
        l(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 13,
              color: 'var(--muted-foreground)',
            },
            children: [
              l(
                'div',
                {
                  children: [
                    l(
                      'span',
                      {
                        style: { fontWeight: 500, color: 'var(--foreground)' },
                        children: ['Active pair:', ' '],
                      },
                      void 0,
                      !0,
                      void 0,
                      this,
                    ),
                    r
                      ? l(
                          'span',
                          {
                            style: {
                              fontFamily: 'monospace',
                              color: 'var(--primary)',
                            },
                            children: r.pairKey,
                          },
                          void 0,
                          !1,
                          void 0,
                          this,
                        )
                      : l(
                          'span',
                          {
                            style: { opacity: 0.5 },
                            children: 'none selected',
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
              l(
                'div',
                {
                  children: [
                    l(
                      'span',
                      {
                        style: { fontWeight: 500, color: 'var(--foreground)' },
                        children: ['Market:', ' '],
                      },
                      void 0,
                      !0,
                      void 0,
                      this,
                    ),
                    l(
                      'span',
                      {
                        style: { fontFamily: 'monospace' },
                        children: r?.market ?? '—',
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
              l(
                'div',
                {
                  style: { display: 'flex', alignItems: 'center', gap: 6 },
                  children: [
                    l(
                      'span',
                      {
                        style: { fontWeight: 500, color: 'var(--foreground)' },
                        children: 'Authenticated:',
                      },
                      void 0,
                      !1,
                      void 0,
                      this,
                    ),
                    l(
                      i,
                      {
                        variant: b ? 'default' : 'destructive',
                        children: b ? 'yes' : 'no',
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
              l(
                'div',
                {
                  children: [
                    l(
                      'span',
                      {
                        style: { fontWeight: 500, color: 'var(--foreground)' },
                        children: ['Plugin ID:', ' '],
                      },
                      void 0,
                      !0,
                      void 0,
                      this,
                    ),
                    l(
                      'span',
                      {
                        style: { fontFamily: 'monospace' },
                        children: k.pluginId,
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
            ],
          },
          void 0,
          !0,
          void 0,
          this,
        ),
        l(
          'div',
          {
            style: { marginTop: 8 },
            children: l(
              L,
              {
                size: 'sm',
                onClick: () => {
                  ;(o((w) => w + 1),
                    v(`Button clicked ${g + 1} time${g === 0 ? '' : 's'}`, {
                      type: 'success',
                    }))
                },
                children: ['Click me (', g, ')'],
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
        l(
          'div',
          {
            style: {
              marginTop: 'auto',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              opacity: 0.5,
            },
            children:
              'This panel is loaded dynamically and styled with the @pairlens/ui design system + @pairlens/plugin-sdk hooks (pair, auth, notifications).',
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
var K = {
  id: 'dev-starter',
  name: 'Dev Starter',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'A starter plugin demonstrating the Plugin SDK — use as a template for building your own plugins',
  homepage: 'https://pairlens.finance',
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'hello',
        label: 'Hello World',
        icon: 'Sparkles',
        category: 'discovery',
        description: 'A demo panel showing SDK hooks in action',
      },
    ],
    commands: [
      { id: 'greet', label: 'Dev Starter: Say Hello', icon: 'Sparkles' },
    ],
  },
}
var e = K
function h(r) {
  return {
    manifest: r,
    status: 'installed',
    config: {},
    execute: async (b) => null,
    executeCommand: (b, v) => {
      if (b === 'greet')
        console.log('[dev-starter] Hello from the Dev Starter plugin!', v)
    },
    getContributedComponents: () => ({
      hello: Q(() => Promise.resolve({ default: S })),
    }),
  }
}
export { e as manifest, h as createPlugin }
