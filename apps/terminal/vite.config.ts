// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { copyPyodideAssets } from './scripts/copy-pyodide'
import type { Plugin } from 'vite'

const terminalPort = Number.parseInt(process.env.TERMINAL_PORT ?? '', 10)

// The desktop bundle's version is the single version of record — browser and
// dev builds report the same number so "which build am I running" has one
// answer everywhere (desktop reads the installed bundle at runtime instead,
// see src/lib/app-version.ts).
const appVersion = (
  JSON.parse(
    readFileSync(
      new URL('../desktop/src-tauri/tauri.conf.json', import.meta.url),
      'utf8',
    ),
  ) as { version: string }
).version

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

// Identity of this particular build. The release number can't do that job on
// its own: the web terminal redeploys on every push to main, while the version
// only moves on `bun run release`, so between releases a deploy replaces every
// content hash under a number that never changes — and a tab holding the old
// hashes had no way to tell.
//
// It has to be the commit, not a timestamp. TanStack Start loads this config
// once per build environment (client, server, prerender), so anything derived
// from the clock produces a different value each time: the id baked into the
// bundle would never match the one written to version.json, and every tab
// would be told it was stale the moment it loaded.
function resolveBuildId(): string {
  // Vercel and GitHub Actions hand the SHA over directly. It has to be listed
  // in this app's turbo.json or strict env mode hides it from `vite build`.
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (fromCi) return fromCi.slice(0, 12)
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .slice(0, 12)
  } catch {
    // No CI metadata and no git: report "can't tell" rather than invent an
    // id. An empty build id is not an answer, and web-updater falls back to
    // comparing versions — see isDifferentBuild.
    return ''
  }
}

const buildId = resolveBuildId()

// Stage public/version.json (gitignored) carrying the version and build id the
// bundle bakes in. Deployed alongside the web terminal, it always reports the
// live build — browser builds poll it to learn a newer deploy shipped and
// prompt a refresh (see src/lib/web-updater.ts).
function versionManifest(): Plugin {
  return {
    name: 'pairlens:version-manifest',
    configResolved(config) {
      writeFileSync(
        join(config.root, 'public', 'version.json'),
        JSON.stringify({ version: appVersion, build: buildId }) + '\n',
      )
    },
  }
}

const config = defineConfig({
  resolve: {
    alias: {
      // ccxt support in the browser build. WsClient.js imports 'ws' at module
      // level but only dereferences it under Node — browsers use
      // self.WebSocket — so 'ws' maps to a shim exporting the native
      // WebSocket. undici is reached only through lazy imports on Node-only
      // paths; an empty shim keeps Rollup satisfied without shipping it.
      // protobufjs is NOT shimmed: MEXC's WS frames are protobuf and the real
      // module (a dependency of @pairlens/plugins) must load in the browser.
      // node:zlib/node:http stay on Vite's built-in browser-external handling
      // (ccxt catches the failed import and falls back to fflate for WS
      // decompression).
      ws: join(import.meta.dirname, 'src/lib/ccxt/ws-shim.ts'),
      undici: join(import.meta.dirname, 'src/lib/ccxt/empty-shim.ts'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
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
    // @pairlens/fast-financial-charts must stay unbundled: its indicator worker is created via
    // `new URL('./indicator.worker.ts', import.meta.url)`, which breaks when the
    // package is prebundled into .vite/deps (the worker URL 404s and indicator
    // computation stalls silently).
    exclude: ['@tauri-apps/plugin-keychain', '@pairlens/fast-financial-charts'],
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
    versionManifest(),
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
