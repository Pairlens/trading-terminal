// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { copyPyodideAssets } from './scripts/copy-pyodide'
import type { Plugin } from 'vite'

const terminalPort = Number.parseInt(process.env.TERMINAL_PORT ?? '', 10)

// Stage the pyodide core runtime into public/_pyodide/ (gitignored) so both
// `vite dev` and `vite build` serve it same-origin for the Python worker.
function pyodideAssets(): Plugin {
  return {
    name: 'pairlens:pyodide-assets',
    configResolved(config) {
      copyPyodideAssets(config.root)
    },
  }
}

const config = defineConfig({
  assetsInclude: ['**/*.glb'],
  server: {
    port: Number.isFinite(terminalPort) ? terminalPort : 3000,
    proxy: {
      // Proxy exchange REST API calls to bypass CORS in browser dev mode.
      // In Tauri desktop, fetch() has no CORS restrictions.
      '/__okx-global/': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__okx-global/, ''),
      },
      '/__okx-us/': {
        target: 'https://us.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__okx-us/, ''),
      },
      '/__okx-eu/': {
        target: 'https://eea.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__okx-eu/, ''),
      },
      '/__bitvavo/': {
        target: 'https://api.bitvavo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__bitvavo/, ''),
      },
      '/__mexc/': {
        target: 'https://api.mexc.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__mexc/, ''),
      },
      '/__mexc-ws': {
        target: 'wss://wbs-api.mexc.com',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__mexc-ws/, ''),
      },
      '/__kucoin-global/': {
        target: 'https://api.kucoin.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__kucoin-global/, ''),
      },
      '/__kucoin-eu/': {
        target: 'https://api.kucoin.eu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__kucoin-eu/, ''),
      },
      '/__kucoin-sandbox/': {
        target: 'https://openapi-sandbox.kucoin.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__kucoin-sandbox/, ''),
      },
      '/__gate-global/': {
        target: 'https://api.gateio.ws',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__gate-global/, ''),
      },
      '/__gate-testnet/': {
        target: 'https://api-testnet.gateapi.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__gate-testnet/, ''),
      },
      '/__bitget/': {
        target: 'https://api.bitget.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__bitget/, ''),
      },
      '/__coinbase/': {
        target: 'https://api.coinbase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__coinbase/, ''),
      },
      '/__coinbase-sandbox/': {
        target: 'https://api-sandbox.coinbase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__coinbase-sandbox/, ''),
      },
      '/__kraken/': {
        target: 'https://api.kraken.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__kraken/, ''),
      },
      '/__htx/': {
        target: 'https://api.huobi.pro',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__htx/, ''),
      },
      '/__cryptocom/': {
        target: 'https://api.crypto.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__cryptocom/, ''),
      },
      '/__cryptocom-sandbox/': {
        target: 'https://uat-api.3ona.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__cryptocom-sandbox/, ''),
      },
      '/__bitfinex/': {
        target: 'https://api-pub.bitfinex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__bitfinex/, ''),
      },
      '/__bitfinex-auth/': {
        target: 'https://api.bitfinex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__bitfinex-auth/, ''),
      },
      '/__upbit/': {
        target: 'https://sg-api.upbit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__upbit/, ''),
      },
      '/__upbit-id/': {
        target: 'https://id-api.upbit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__upbit-id/, ''),
      },
      '/__upbit-th/': {
        target: 'https://th-api.upbit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__upbit-th/, ''),
      },
    },
  },
  optimizeDeps: {
    // @tauri-apps/plugin-keychain only exists inside the Tauri desktop runtime.
    // Exclude it so Vite's dependency scanner doesn't choke in browser-only dev.
    // fast-financial-charts must stay unbundled: its indicator worker is created via
    // `new URL('./indicator.worker.ts', import.meta.url)`, which breaks when the
    // package is prebundled into .vite/deps (the worker URL 404s and indicator
    // computation stalls silently).
    exclude: ['@tauri-apps/plugin-keychain', 'fast-financial-charts'],
  },
  ssr: {
    noExternal: ['better-auth', /^@pairlens\//],
  },
  worker: {
    // The Python worker (`?worker&inline`) pulls in pyodide.mjs, which both
    // requires a module worker at runtime ("Classic web workers are not
    // supported") and carries dynamic imports the default iife format can't
    // bundle. Build workers as ES modules, inlined into a single chunk so
    // `?worker&inline` still yields one self-contained blob.
    format: 'es',
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [
    pyodideAssets(),
    devtools({
      eventBusConfig: {
        // Worktree-derived by scripts/env/with-worktree-env.ts to avoid
        // cross-worktree EADDRINUSE; falls back to 42070 for the main checkout.
        port: Number.parseInt(process.env.TSS_DEVTOOLS_PORT ?? '', 10) || 42070,
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json', '../../packages/ui/tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
  ],
})

export default config
