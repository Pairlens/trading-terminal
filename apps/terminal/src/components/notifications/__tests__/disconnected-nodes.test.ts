// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The canvas dims nodes it thinks nothing can reach. It used to decide what an
// event step was from a hardcoded list, which omitted `indicator-alert` and
// every plugin-contributed event. The failure mode was nasty: a rule rooted in
// an unrecognised event looked fine (no roots at all, so nothing was dimmed),
// and the moment you added one recognised event step the search started from
// that node alone and greyed out the entire correctly-wired flow around it.
import { beforeAll, describe, expect, it } from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import {
  registerStepType,
  registerStepTypes,
} from '@pairlens/notification-engine/step-registry'
import { getDisconnectedNodeIds } from '../notification-canvas'
import type { Edge, Node } from '@xyflow/react'

const node = (id: string, type: string): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {},
})

const edge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
})

beforeAll(() => {
  registerStepTypes(CORE_NOTIFICATION_STEPS)
  // Stands in for a plugin that contributes its own event step.
  registerStepType({
    type: 'plugin-event',
    label: 'Plugin Event',
    icon: 'Zap',
    category: 'event',
    handles: { inputs: [], outputs: [{ id: 'out' }] },
    configSchema: [],
    validate: () => [],
    defaultData: () => ({}),
  })
})

describe('getDisconnectedNodeIds', () => {
  it('treats a wired flow as fully connected', () => {
    const nodes = [node('e', 'candle-close'), node('t', 'local-toast')]
    expect(getDisconnectedNodeIds(nodes, [edge('e', 't')]).size).toBe(0)
  })

  it('flags a channel nothing points at', () => {
    const nodes = [
      node('e', 'candle-close'),
      node('t', 'local-toast'),
      node('orphan', 'os-notification'),
    ]
    const out = getDisconnectedNodeIds(nodes, [edge('e', 't')])
    expect([...out]).toEqual(['orphan'])
  })

  it('roots the search at indicator-alert', () => {
    // The shape the "Relay my indicator alerts" template produces, plus a
    // genuine orphan. The orphan is what makes this test discriminating: if
    // indicator-alert is not recognised there are no roots at all, the
    // function bails early, and even the orphan comes back clean.
    const nodes = [
      node('e', 'indicator-alert'),
      node('t', 'local-toast'),
      node('orphan', 'os-notification'),
    ]
    const out = getDisconnectedNodeIds(nodes, [edge('e', 't')])
    expect([...out]).toEqual(['orphan'])
  })

  it('does not disconnect a template when a second event step is added', () => {
    // The reported bug: pick the indicator template, drop any other event
    // step on the canvas, and every original node greyed out.
    const nodes = [
      node('e', 'indicator-alert'),
      node('t', 'local-toast'),
      node('o', 'os-notification'),
      node('added', 'candle-close'),
    ]
    const edges = [edge('e', 't'), edge('e', 'o')]

    // The newly added event step is a root of its own, so nothing is orphaned.
    expect(getDisconnectedNodeIds(nodes, edges).size).toBe(0)
  })

  it('roots the search at plugin-contributed event steps too', () => {
    const nodes = [
      node('e', 'plugin-event'),
      node('t', 'local-toast'),
      node('orphan', 'os-notification'),
    ]
    const out = getDisconnectedNodeIds(nodes, [edge('e', 't')])
    expect([...out]).toEqual(['orphan'])
  })

  it('stays quiet when no step is an event at all', () => {
    // Nothing to search from, so claiming everything is broken helps no one.
    const nodes = [node('t', 'local-toast'), node('o', 'os-notification')]
    expect(getDisconnectedNodeIds(nodes, []).size).toBe(0)
  })
})
