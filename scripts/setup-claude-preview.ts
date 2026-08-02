// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Generate (or heal) `.claude/launch.json` for the current git worktree.
 *
 * The Claude Code preview harness needs a launch config with a *static* port,
 * but every worktree derives a *different* terminal port (see
 * `scripts/env/with-worktree-env.ts`). So the config can't be committed/shared —
 * it must be generated per worktree. This script writes it with the correct
 * derived port, and is wired to `postinstall` so a fresh `bun install` in any
 * new worktree sets it up automatically. It is also runnable on demand:
 *
 *   bun run setup:preview
 *
 * Safe to run repeatedly: it creates the file when missing, adds any missing
 * managed server configs (see MANAGED_SERVERS), and fixes their ports when
 * they have drifted, preserving any other configs the user added. It never
 * throws out to the caller (a failing postinstall must not break `bun
 * install`) and no-ops in CI / cloud builds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { resolveDerivedEnv, resolveWorktreeRoot } from './env/with-worktree-env'

type LaunchConfig = {
  name?: string
  runtimeExecutable?: string
  runtimeArgs?: Array<string>
  port?: number
  [key: string]: unknown
}

type LaunchFile = {
  version?: string
  configurations?: Array<LaunchConfig>
  [key: string]: unknown
}

function isCi(): boolean {
  const env = process.env
  return Boolean(
    env.CI ||
    env.VERCEL ||
    env.GITHUB_ACTIONS ||
    env.RAILWAY_ENVIRONMENT ||
    env.RAILWAY_PROJECT_ID ||
    env.NODE_ENV === 'production',
  )
}

/** Dev servers whose launch configs are generated/healed per worktree. */
const MANAGED_SERVERS = [
  { name: 'terminal', script: 'dev:terminal', envKey: 'TERMINAL_PORT' },
  { name: 'marketing', script: 'dev:marketing', envKey: 'MARKETING_PORT' },
] as const

function serverConfig(
  name: string,
  script: string,
  port: number,
): LaunchConfig {
  return {
    name,
    runtimeExecutable: 'bun',
    runtimeArgs: ['run', script],
    port,
  }
}

function main() {
  // Local dev only — never write files during CI/cloud installs.
  if (isCi()) return

  const env = resolveDerivedEnv()
  const servers = MANAGED_SERVERS.map((server) => ({
    ...server,
    port: Number.parseInt(env[server.envKey] ?? '', 10),
  })).filter((server) => Number.isFinite(server.port))
  if (servers.length === 0) return

  const root = resolveWorktreeRoot()
  const claudeDir = path.join(root, '.claude')
  const launchPath = path.join(claudeDir, 'launch.json')

  const freshConfigs = () =>
    servers.map((s) => serverConfig(s.name, s.script, s.port))
  const summary = servers.map((s) => `${s.name} → port ${s.port}`).join(', ')

  // Create fresh when missing.
  if (!existsSync(launchPath)) {
    mkdirSync(claudeDir, { recursive: true })
    const file: LaunchFile = {
      version: '0.0.1',
      configurations: freshConfigs(),
    }
    writeFileSync(launchPath, JSON.stringify(file, null, 2) + '\n')
    console.log(`[setup:preview] created .claude/launch.json (${summary})`)
    return
  }

  // Heal an existing file: add missing managed configs and fix ports that
  // have drifted, otherwise leave everything untouched. Preserve any other
  // configurations the user added.
  let file: LaunchFile
  try {
    file = JSON.parse(readFileSync(launchPath, 'utf8')) as LaunchFile
  } catch {
    // Malformed — rewrite from scratch.
    const fresh: LaunchFile = {
      version: '0.0.1',
      configurations: freshConfigs(),
    }
    writeFileSync(launchPath, JSON.stringify(fresh, null, 2) + '\n')
    console.log(
      `[setup:preview] rewrote malformed .claude/launch.json (${summary})`,
    )
    return
  }

  const configs = Array.isArray(file.configurations) ? file.configurations : []
  const changes: Array<string> = []

  for (const server of servers) {
    const existing = configs.find((c) => c.name === server.name)
    if (!existing) {
      configs.push(serverConfig(server.name, server.script, server.port))
      changes.push(`added ${server.name} (port ${server.port})`)
    } else if (existing.port !== server.port) {
      const previous = existing.port
      existing.port = server.port
      changes.push(
        `updated ${server.name} port ${previous ?? '(unset)'} → ${server.port}`,
      )
    }
  }

  if (changes.length > 0) {
    file.version ??= '0.0.1'
    file.configurations = configs
    writeFileSync(launchPath, JSON.stringify(file, null, 2) + '\n')
    console.log(`[setup:preview] ${changes.join('; ')} in .claude/launch.json`)
  }
}

try {
  main()
} catch (error) {
  // Never fail the install over preview tooling.
  console.warn(
    `[setup:preview] skipped (${error instanceof Error ? error.message : String(error)})`,
  )
}
