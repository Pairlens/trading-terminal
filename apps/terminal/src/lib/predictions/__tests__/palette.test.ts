// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  RUNNER_TOKENS,
  RUNNER_TOKEN_COUNT,
  assignRunnerColors,
  runnerToken,
} from '../palette'

describe('runnerToken', () => {
  it('hands the first lap the raw theme tokens', () => {
    expect(runnerToken(0)).toBe(RUNNER_TOKENS[0])
    expect(runnerToken(4)).toBe(RUNNER_TOKENS[4])
  })

  it('mixes the second lap toward the background, keeping the hue', () => {
    const second = runnerToken(RUNNER_TOKENS.length)
    expect(second).toContain('color-mix')
    expect(second).toContain(RUNNER_TOKENS[0])
    expect(second).not.toBe(RUNNER_TOKENS[0])
  })

  it('answers a muted colour for a runner the field does not hold', () => {
    expect(runnerToken(-1)).toBe('var(--muted-foreground)')
  })
})

describe('assignRunnerColors', () => {
  it('keeps every runner’s venue colour when nothing collides', () => {
    const indices = [0, 1, 2, 3, 4]
    expect(assignRunnerColors(indices)).toEqual(indices.map(runnerToken))
  })

  it('never hands two drawn runners the same colour', () => {
    // Venue positions scattered across a 128-runner field: 3 and 13 land on
    // the same slot of a ten-colour wheel, and two identical lines is the
    // failure this exists to prevent.
    const colors = assignRunnerColors([3, 13, 23, 42, 7, 17, 0, 90])
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('gives the first runner its own venue colour even under collision', () => {
    const colors = assignRunnerColors([3, 13])
    expect(colors[0]).toBe(runnerToken(3))
  })

  it('terminates when the whole wheel is taken', () => {
    const indices = Array.from({ length: RUNNER_TOKEN_COUNT + 3 }, () => 0)
    const colors = assignRunnerColors(indices)
    expect(colors).toHaveLength(indices.length)
    expect(new Set(colors).size).toBe(RUNNER_TOKEN_COUNT)
  })

  it('passes an absent runner straight through as muted', () => {
    expect(assignRunnerColors([-1])).toEqual(['var(--muted-foreground)'])
  })
})
