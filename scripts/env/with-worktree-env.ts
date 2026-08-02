#!/usr/bin/env bun
// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

function runGit(args: Array<string>): string {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    const message = result.stderr?.trim() || `git ${args.join(' ')} failed`
    throw new Error(message)
  }

  return result.stdout.trim()
}

function toAbsolutePath(candidate: string, base: string): string {
  if (!candidate) {
    return base
  }

  if (path.isAbsolute(candidate)) {
    return path.normalize(candidate)
  }

  return path.normalize(path.resolve(base, candidate))
}

function isNotGitRepositoryError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('not a git repository') ||
    normalized.includes('not a git directory')
  )
}

function normalizeGitRoots() {
  try {
    const currentRoot = path.normalize(runGit(['rev-parse', '--show-toplevel']))
    const commonDirRaw = runGit(['rev-parse', '--git-common-dir'])
    const commonDir = toAbsolutePath(commonDirRaw, currentRoot)
    const commonRoot = path.normalize(path.dirname(commonDir))

    return { currentRoot, commonRoot }
  } catch (error) {
    if (error instanceof Error && isNotGitRepositoryError(error.message)) {
      const fallbackRoot = path.normalize(process.cwd())
      return { currentRoot: fallbackRoot, commonRoot: fallbackRoot }
    }
    throw error
  }
}

function parseDotenvValue(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  const startsWithQuote = trimmed.startsWith('"') || trimmed.startsWith("'")
  if (!startsWithQuote) {
    const commentIndex = trimmed.indexOf(' #')
    return commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex).trim()
  }

  const quote = trimmed[0]
  if (trimmed.length >= 2 && trimmed.endsWith(quote)) {
    const unwrapped = trimmed.slice(1, -1)
    if (quote === '"') {
      return unwrapped
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
    }
    return unwrapped
  }

  return trimmed
}

function parseDotenvFile(filePath: string): Record<string, string> {
  const contents = readFileSync(filePath, 'utf8')
  const parsed: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const withoutExport = line.startsWith('export ')
      ? line.slice(7).trim()
      : line
    const separator = withoutExport.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const key = withoutExport.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }

    const rawValue = withoutExport.slice(separator + 1)
    parsed[key] = parseDotenvValue(rawValue)
  }

  return parsed
}

function loadEnvFiles(fileCandidates: Array<string>): Record<string, string> {
  const loaded: Record<string, string> = {}

  for (const filePath of fileCandidates) {
    if (!existsSync(filePath)) {
      continue
    }

    const parsed = parseDotenvFile(filePath)
    for (const [key, value] of Object.entries(parsed)) {
      loaded[key] = value
    }
  }

  return loaded
}

function truthyDisabled(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'off' ||
    normalized === 'no'
  )
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function hashString(input: string): number {
  let hash = 2166136261

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function applyDerivedEnv(
  env: Record<string, string>,
  shellOverrides: NodeJS.ProcessEnv,
  currentRoot: string,
  commonRoot: string,
): void {
  const getEffective = (key: string): string | undefined =>
    shellOverrides[key] ?? env[key]

  const isWorktree = path.normalize(currentRoot) !== path.normalize(commonRoot)
  const worktreePortsDisabled = truthyDisabled(
    getEffective('PAIRLENS_WORKTREE_PORTS'),
  )
  const portBase = parsePositiveInt(getEffective('PAIRLENS_PORT_BASE'), 3000)
  const portSpan = parsePositiveInt(getEffective('PAIRLENS_PORT_SPAN'), 500)

  // Port allocation per worktree slot (6 ports each):
  //   slot * 6 + 0 = Terminal
  //   slot * 6 + 1 = TanStack devtools event bus (terminal)
  //   slot * 6 + 2 = (unused — was App Server, now external to this repo)
  //   slot * 6 + 3 = Marketing
  //   slot * 6 + 4 = (unused)
  //   slot * 6 + 5 = Registry
  let defaultTerminalPort = 3000
  let defaultMarketingPort = 3003
  let defaultRegistryPort = 3005

  if (isWorktree && !worktreePortsDisabled) {
    const slot = hashString(currentRoot) % portSpan
    defaultTerminalPort = portBase + slot * 6
    defaultMarketingPort = defaultTerminalPort + 3
    defaultRegistryPort = defaultTerminalPort + 5
  }

  if (!getEffective('TERMINAL_PORT')) {
    env.TERMINAL_PORT = String(defaultTerminalPort)
  }

  const terminalPort = Number.parseInt(
    getEffective('TERMINAL_PORT') ?? String(defaultTerminalPort),
    10,
  )

  if (!getEffective('MARKETING_PORT')) {
    env.MARKETING_PORT = String(
      Number.isFinite(terminalPort) ? terminalPort + 3 : defaultMarketingPort,
    )
  }

  if (!getEffective('REGISTRY_PORT')) {
    env.REGISTRY_PORT = String(
      Number.isFinite(terminalPort) ? terminalPort + 5 : defaultRegistryPort,
    )
  }

  // TanStack devtools event-bus port. The terminal's vite config hardcodes
  // 42070 by default, which collides when two worktrees run the dev server at
  // once (the bus throws EADDRINUSE and kills vite). Give each worktree the
  // reserved `slot * 6 + 1` port; the main checkout keeps 42070.
  if (!getEffective('TSS_DEVTOOLS_PORT')) {
    if (isWorktree && !worktreePortsDisabled && Number.isFinite(terminalPort)) {
      env.TSS_DEVTOOLS_PORT = String(terminalPort + 1)
    }
  }

  // NOTE: VITE_APP_SERVER_URL is not derived here (this function is sync).
  // The dev-command wrapper below resolves it asynchronously via
  // scripts/env/resolve-app-server.ts: explicit value → local :4046 →
  // Pairlens Cloud. An explicitly EMPTY value means standalone and is
  // respected.
}

/** The current worktree's root directory (the per-checkout root, not the shared
 * common git dir). */
export function resolveWorktreeRoot(): string {
  return normalizeGitRoots().currentRoot
}

/** Resolve the full derived environment for the current worktree — the env from
 * `.env` files merged with the worktree-derived ports/URLs and shell overrides —
 * without spawning a child process. This is the exact env the dev servers run
 * with; tooling (e.g. the Claude Code preview launch-config generator) uses it
 * to read the derived `TERMINAL_PORT`. */
export function resolveDerivedEnv(): NodeJS.ProcessEnv {
  const shellOverrides = { ...process.env }
  const { currentRoot, commonRoot } = normalizeGitRoots()
  const orderedCandidates = [
    path.join(commonRoot, '.env.shared'),
    path.join(commonRoot, '.env.local'),
    path.join(currentRoot, '.env.shared'),
    path.join(currentRoot, '.env.local'),
  ]
  const fileCandidates = [...new Set(orderedCandidates)]
  const envFromFiles = loadEnvFiles(fileCandidates)
  applyDerivedEnv(envFromFiles, shellOverrides, currentRoot, commonRoot)
  return { ...envFromFiles, ...shellOverrides }
}

function parseCommandArgv(argv: Array<string>): Array<string> {
  if (!argv.length) {
    return []
  }

  if (argv[0] === '--') {
    return argv.slice(1)
  }

  const separator = argv.indexOf('--')
  if (separator === -1) {
    return argv
  }

  return argv.slice(separator + 1)
}

async function main() {
  const commandParts = parseCommandArgv(process.argv.slice(2))

  if (commandParts.length === 0) {
    console.error(
      'Usage: bun scripts/env/with-worktree-env.ts -- <command> [args...]',
    )
    process.exit(1)
  }

  const [command, ...commandArgs] = commandParts
  const finalEnv = resolveDerivedEnv()

  // App Server resolution — only when nothing (not even an explicit empty
  // string, which means "standalone") set it. Keeps `bun run dev:terminal`
  // and the Claude preview servers on the same cloud-fallback behavior as
  // `bun run dev`.
  if (finalEnv.VITE_APP_SERVER_URL === undefined) {
    const { resolveAppServerUrl } = await import('./resolve-app-server')
    finalEnv.VITE_APP_SERVER_URL = (await resolveAppServerUrl(undefined)) ?? ''
  }

  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    env: finalEnv,
  })

  child.on('error', (error) => {
    console.error(`Failed to run command: ${command}`)
    console.error(error.message)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

// Only run the CLI wrapper when executed directly — importing this module (e.g.
// for resolveDerivedEnv) must not spawn a child process.
if (import.meta.main) {
  void main()
}
