// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Assistant surface contract ───────────────────────────────────────
//
// Any mounted surface (pane, route, dialog, workbench) can publish two
// things to the assistant:
//
//   • CONTEXT — what the user is looking at right now.
//   • ACTIONS — what can be done here, as callable tools.
//
// Both are read live, at the moment the assistant needs them, so a
// surface never has to push updates. Unmounting withdraws both.

import type { z } from 'zod'

// ── Actions ──────────────────────────────────────────────────────────

/**
 * A single thing a surface can do on the user's behalf.
 *
 * `name` becomes the tool name the model sees, so it must be
 * snake_case and stable — it is part of the model-facing API. Two
 * mounted surfaces may publish the same name (two charts, two
 * workbenches); the registry resolves the collision in favour of the
 * higher-priority surface, so the tool always lands on the one the
 * user is actually looking at.
 */
export type AssistantAction<TSchema extends z.ZodType = z.ZodType> = {
  name: string
  /** Model-facing description. Say what it does and when to use it. */
  description: string
  inputSchema: TSchema
  /**
   * Runs in the terminal process, with the surface's live closures in
   * scope. Return a value the model can read — a confirmation string,
   * or a structured result. Throw to report failure.
   */
  execute: (args: z.infer<TSchema>) => unknown | Promise<unknown>
  /**
   * Renders a card and waits for the user instead of running straight
   * away. The action still executes through `execute` once approved.
   */
  needsApproval?: boolean
}

// ── Context ──────────────────────────────────────────────────────────

/**
 * The companion line beside the orb. Surfaces return a translation key
 * (plus interpolation values) rather than a finished string, so the
 * suggestion stays translated in all seventeen locales.
 */
export type AssistantSuggestion = {
  key: string
  values?: Record<string, string | number>
}

/** What a surface contributes to the assistant's view of the screen. */
export type AssistantSurfaceContext = {
  /** One line of prose: "Chart pane showing BTC-USDT on okx, 1h". */
  summary: string
  /** Structured detail the model can reason over. Keep it small. */
  detail?: Record<string, unknown>
}

// ── Registration ─────────────────────────────────────────────────────

export type AssistantSurfaceRegistration = {
  /** Unique per mounted instance. Two chart panes need two ids. */
  id: string
  /**
   * Ranks this surface against the others currently mounted. The
   * highest-priority surface wins name collisions and owns the orb's
   * companion suggestion. Read live, so a pane can raise it on focus.
   */
  getPriority?: () => number
  /** What the user is looking at here. Return null to contribute nothing. */
  getContext?: () => AssistantSurfaceContext | null
  /** The orb's idle prompt while this surface leads. */
  getSuggestion?: () => AssistantSuggestion | null
  /** Tools this surface can run. Read live so the set can change. */
  getActions?: () => Array<AssistantAction>
  /**
   * Bump this whenever what the surface publishes changes materially
   * while it stays mounted: the action NAMES, or the suggestion. The
   * registry reads everything else through live closures, so this is
   * the only signal it needs, and surfaces with a fixed shape omit it.
   *
   * A chart pane that switches pair without remounting is the case
   * this exists for: the orb's line must follow the pair.
   */
  revision?: string
}

/** Default priority for a surface that does not rank itself. */
export const DEFAULT_SURFACE_PRIORITY = 0
