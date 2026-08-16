// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Start the Pairlens dev stack (client side).
 *
 * Market data always streams directly from exchanges via connector plugins,
 * and persistence is local by default — no server is required for that.
 *
 * Cloud features (sign-in, sync, news, top coins, symbol logos, hosted AI)
 * come from an App Server. Resolution order:
 *
 *   1. VITE_APP_SERVER_URL   explicit override (shell or .env.local)
 *   2. localhost:4046        a locally-running App Server (auto-detected)
 *   3. Pairlens Cloud        https://api.pairlens.finance — the same hosted
 *                            API the shipped app uses, so dev behaves like
 *                            the real product out of the box
 *
 * Set PAIRLENS_STANDALONE=1 to skip all of it and run fully offline
 * (auth off, cloud panels hidden, local persistence only).
 *
 * Usage:
 *   bun scripts/dev.ts             # Terminal (Vite)
 *   bun scripts/dev.ts --desktop   # Tauri desktop
 */

import { resolve } from 'node:path'
import {
  CLOUD_APP_SERVER_URL,
  resolveAppServerUrl,
} from './env/resolve-app-server'
import { resolveDerivedEnv } from './env/with-worktree-env'

const withDesktop = process.argv.includes('--desktop')

const env = resolveDerivedEnv()
const terminalPort = env.TERMINAL_PORT ?? '3000'

const REPO_ROOT = resolve(import.meta.dir, '..')
const DESKTOP_DIR = resolve(REPO_ROOT, 'apps', 'desktop')

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'

const LOGO = [
  ' /$$$$$$$$          /$$           /$$',
  '| $$__  $$        |__/          | $$',
  '| $$  \\ $$ /$$$$$$  /$$  /$$$$$$| $$  /$$$$$$  /$$$$$$$   /$$$$$$$',
  '| $$$$$$$/|____  $$| $$ /$$__  $$| $$ /$$__  $$| $$__  $$ /$$_____/',
  '| $$____/  /$$$$$$$| $$| $$  \\__/| $$| $$$$$$$$| $$  \\ $$|  $$$$$$',
  '| $$      /$$__  $$| $$| $$      | $$| $$_____/| $$  | $$ \\____  $$',
  '| $$     |  $$$$$$$| $$| $$      | $$|  $$$$$$$| $$  | $$ /$$$$$$$/',
  '|__/      \\_______/|__/|__/      |__/ \\_______/|__/  |__/|_______/',
]

const W = 62

function pad(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length))
}

function boxLine(content: string): string {
  // Strip ANSI codes for length calculation
  // eslint-disable-next-line no-control-regex -- \x1b is the ANSI escape byte; stripping color codes is the point
  const stripped = content.replace(/\x1b\[[0-9;]*m/g, '')
  // Interior is W - 2 columns wide (the corners/rules span W); 2 of them go to
  // the left gutter, so the content + right padding fill the remaining W - 4.
  const padding = Math.max(0, W - 4 - stripped.length)
  return `  ${DIM}│${RESET}  ${content}${' '.repeat(padding)}${DIM}│${RESET}`
}

function boxTop(): string {
  return `  ${DIM}╭${'─'.repeat(W - 2)}╮${RESET}`
}

function boxBottom(): string {
  return `  ${DIM}╰${'─'.repeat(W - 2)}╯${RESET}`
}

function boxSep(): string {
  return `  ${DIM}├${'─'.repeat(W - 2)}┤${RESET}`
}

function printBanner(appServerUrl: string | null): void {
  const terminalUrl = `http://localhost:${terminalPort}`
  const isCloud = appServerUrl === CLOUD_APP_SERVER_URL
  const isLocal = appServerUrl?.includes('localhost') ?? false

  const lines: Array<string> = [
    '',
    boxTop(),
    boxLine(''),
    boxLine(`${BOLD}Pairlens Dev Server${RESET}`),
    boxLine(''),
    boxSep(),
    boxLine(''),
    boxLine(`${pad('Terminal', 18)}${CYAN}${terminalUrl}${RESET}`),
  ]

  if (appServerUrl) {
    // "already running" is load-bearing: this script only probes for an App
    // Server, it never spawns one. Without it the row reads like a service
    // the dev command just brought up.
    const label = isCloud ? ' (cloud)' : isLocal ? ' (already running)' : ''
    lines.push(
      boxLine(
        `${pad('App Server', 18)}${CYAN}${appServerUrl}${RESET}${DIM}${label}${RESET}`,
      ),
    )
  } else {
    lines.push(
      boxLine(`${pad('App Server', 18)}${DIM}none (standalone mode)${RESET}`),
    )
  }

  lines.push(boxLine(''))
  lines.push(boxSep())
  lines.push(boxLine(''))

  // Mode details
  lines.push(
    boxLine(
      `${BOLD}Mode${RESET}         ${withDesktop ? 'Desktop (Tauri + Vite)' : 'Browser (Vite dev server)'}`,
    ),
  )
  lines.push(
    boxLine(`${BOLD}Market Data${RESET}  Plugin-based (direct exchange WS)`),
  )
  lines.push(
    boxLine(
      `${BOLD}Hot Reload${RESET}   ${GREEN}Yes${RESET} ${DIM}React/TS via Vite HMR${RESET}`,
    ),
  )
  if (appServerUrl) {
    lines.push(
      boxLine(
        `${BOLD}Auth${RESET}         ${GREEN}Yes${RESET} ${DIM}${
          isCloud
            ? 'OTP codes are emailed to you'
            : 'OTP codes print to the App Server log'
        }${RESET}`,
      ),
    )
  } else {
    lines.push(
      boxLine(
        `${BOLD}Auth${RESET}         ${DIM}Off (local persistence only)${RESET}`,
      ),
    )
  }

  lines.push(boxLine(''))
  lines.push(boxSep())
  lines.push(boxLine(''))

  if (isCloud) {
    lines.push(
      boxLine(`${DIM}Offline / standalone: PAIRLENS_STANDALONE=1${RESET}`),
    )
  } else if (appServerUrl) {
    lines.push(boxLine(`${DIM}Detected, not started by this script${RESET}`))
    lines.push(
      boxLine(
        `${DIM}Sign in with${RESET} ${YELLOW}ai.agent@pairlens.finance${RESET}`,
      ),
    )
  } else {
    lines.push(
      boxLine(
        `${DIM}Optional: an App Server on :4046 enables auth/sync${RESET}`,
      ),
    )
  }
  lines.push(boxLine(`${DIM}Ctrl+C to stop the dev server${RESET}`))
  lines.push(boxLine(''))

  lines.push(boxBottom())
  lines.push('')

  console.info(lines.join('\n'))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('')
  for (const line of LOGO) {
    console.info(`  ${CYAN}${line}${RESET}`)
  }
  console.info('')

  // ── App Server resolution ──
  // Explicit VITE_APP_SERVER_URL (shell or .env.local) wins; otherwise a
  // locally-running App Server on :4046; otherwise Pairlens Cloud so dev
  // matches the shipped app. PAIRLENS_STANDALONE=1 skips everything
  // (auth off, local persistence).
  const appServerUrl = await resolveAppServerUrl(
    env.VITE_APP_SERVER_URL || undefined,
  )

  const procs: Array<{ proc: ReturnType<typeof Bun.spawn>; label: string }> = []

  const childEnv: Record<string, string | undefined> = {
    ...env,
    ...process.env,
    VITE_APP_SERVER_URL: appServerUrl ?? '',
  }

  if (withDesktop) {
    console.info(`  ${DIM}▸${RESET} Starting Tauri Desktop...`)
    // Tauri's `devUrl` is statically `http://localhost:3000` in tauri.conf.json,
    // but in a git worktree Vite runs on a derived port. Merge the correct
    // devUrl via `--config` so Tauri points at the running dev server.
    const tauriConfigOverride = JSON.stringify({
      build: { devUrl: `http://localhost:${terminalPort}` },
    })
    procs.push({
      label: 'tauri',
      proc: Bun.spawn(
        ['bunx', 'tauri', 'dev', '--config', tauriConfigOverride],
        {
          cwd: DESKTOP_DIR,
          env: { ...childEnv, TERMINAL_PORT: String(terminalPort) },
          stdio: ['inherit', 'inherit', 'inherit'],
        },
      ),
    })
  } else {
    console.info(
      `  ${DIM}▸${RESET} Starting Terminal on :${terminalPort} ${DIM}(Vite)${RESET}...`,
    )
    procs.push({
      label: 'terminal',
      proc: Bun.spawn(
        ['bunx', 'turbo', 'run', 'dev', '--filter=@pairlens/terminal'],
        {
          cwd: REPO_ROOT,
          env: childEnv,
          stdio: ['inherit', 'inherit', 'inherit'],
        },
      ),
    })
  }

  // Print the info banner
  printBanner(appServerUrl)

  // Forward signals for clean shutdown
  const shutdown = () => {
    for (const { proc } of procs) {
      proc.kill('SIGTERM')
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Wait for any process to exit
  await Promise.race(procs.map(({ proc }) => proc.exited))
  shutdown()
}

main().catch((e) => {
  console.error('[dev]', e)
  process.exit(1)
})
