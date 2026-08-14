// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import {
  DEFAULT_SIMPLE_ALERT_CHANNELS,
  buildSimpleAlertGraph,
  readSimpleAlert,
  simpleAlertCooldownSeconds,
  simpleAlertName,
} from '@pairlens/notification-engine/simple-alerts'

import type { SimpleAlertSpec } from '@pairlens/notification-engine/simple-alerts'
import type {
  NotificationBinding,
  NotificationEdgeDSL,
  NotificationRuleDSL,
  NotificationStepDSL,
} from '@pairlens/notification-engine/types'
import { track } from '@/lib/analytics-events'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Storage Keys ─────────────────────────────────────────────────────

const RULES_KEY = 'pairlens:notification-rules'
const BINDINGS_KEY = 'pairlens:notification-bindings'
const DRAFT_KEY = 'pairlens:notification-draft'

// ── Change Tracking ──────────────────────────────────────────────────

type ChangeType =
  | 'step-added'
  | 'step-removed'
  | 'step-moved'
  | 'step-data-changed'
  | 'edge-added'
  | 'edge-removed'

type ChangeRecord = {
  id: string
  type: ChangeType
  timestamp: number
  payload: Record<string, unknown>
}

// ── Draft State ──────────────────────────────────────────────────────

type NotificationDraft = {
  ruleId: string
  baseSnapshot: NotificationRuleDSL
  currentSteps: Array<NotificationStepDSL>
  currentEdges: Array<NotificationEdgeDSL>
  pendingChanges: Array<ChangeRecord>
}

// ── Diff Types ───────────────────────────────────────────────────────

export type NotificationDiff = {
  addedSteps: Array<NotificationStepDSL>
  removedSteps: Array<NotificationStepDSL>
  modifiedSteps: Array<{
    before: NotificationStepDSL
    after: NotificationStepDSL
  }>
  addedEdges: Array<NotificationEdgeDSL>
  removedEdges: Array<NotificationEdgeDSL>
}

// ── Storage Helpers ──────────────────────────────────────────────────

function loadRules(): Array<NotificationRuleDSL> {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<NotificationRuleDSL>
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveRules(rules: Array<NotificationRuleDSL>) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules))
    emitWrite('notification-rules', rules)
  } catch {
    // Ignore quota errors — don't emit write if persist failed
  }
}

function loadBindings(): Array<NotificationBinding> {
  try {
    const raw = localStorage.getItem(BINDINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<NotificationBinding>
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveBindings(bindings: Array<NotificationBinding>) {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings))
    emitWrite('notification-bindings', bindings)
  } catch {
    // Ignore quota errors — don't emit write if persist failed
  }
}

function loadDraft(): NotificationDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      return JSON.parse(raw) as NotificationDraft
    }
  } catch {
    // Ignore corrupted data
  }
  return null
}

function saveDraft(draft: NotificationDraft | null) {
  try {
    if (draft) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } else {
      localStorage.removeItem(DRAFT_KEY)
    }
  } catch {
    // Ignore quota errors
  }
}

function recordChange(
  type: ChangeType,
  payload: Record<string, unknown>,
): ChangeRecord {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  }
}

// ── Store ────────────────────────────────────────────────────────────

type NotificationStore = {
  rules: Array<NotificationRuleDSL>
  bindings: Array<NotificationBinding>
  loaded: boolean
  activeRuleId: string | null
  draft: NotificationDraft | null
  /**
   * Simple alerts the user has chosen to open on the canvas this session.
   *
   * Deliberately not persisted: it is a view preference, not a property of
   * the rule. A rule stops being simple the moment its graph stops matching
   * the canonical shape, and until then the form is the better editor —
   * remembering "show me the graph for this one" forever would quietly
   * hand a novice back the canvas they escaped.
   */
  advancedRuleIds: Array<string>
  openInBuilder: (ruleId: string) => void

  // Lifecycle
  load: () => void

  // Rule CRUD
  createRule: (name: string) => string
  /**
   * Create an armed simple alert bound to one pair — the whole of what the
   * New alert dialog, the chart's "alert here" and the copilot need.
   */
  createSimpleAlert: (input: {
    pair: string
    market: string
    spec: SimpleAlertSpec
  }) => string
  /** Rewrite a simple alert's graph in place from an edited spec. */
  updateSimpleAlert: (ruleId: string, spec: SimpleAlertSpec) => void
  createPriceAlertRule: (input: {
    pair: string
    market: string
    price: number
    direction: 'above' | 'below'
  }) => string
  deleteRule: (id: string) => void
  renameRule: (id: string, name: string) => void
  toggleRule: (id: string) => void
  selectRule: (id: string | null) => void
  duplicateRule: (id: string) => void

  // Binding CRUD
  addBinding: (
    ruleId: string,
    pair: string,
    market: string,
    wallet?: string,
  ) => string
  removeBinding: (id: string) => void
  toggleBinding: (id: string) => void
  getBindingsForPair: (
    pair: string,
    market: string,
  ) => Array<NotificationBinding>
  getBindingsForRule: (ruleId: string) => Array<NotificationBinding>

  // Draft management
  startEditing: (ruleId: string) => void
  hasPendingDraft: () => boolean
  resumeDraft: () => void
  addStep: (step: NotificationStepDSL) => void
  removeStep: (stepId: string) => void
  updateStepPosition: (
    stepId: string,
    position: { x: number; y: number },
  ) => void
  updateStepData: (stepId: string, data: Record<string, unknown>) => void
  addEdge: (edge: NotificationEdgeDSL) => void
  removeEdge: (edgeId: string) => void
  setSteps: (steps: Array<NotificationStepDSL>) => void
  setEdges: (edges: Array<NotificationEdgeDSL>) => void

  // Railway-style commit/discard
  commitDraft: () => void
  discardDraft: () => void
  hasPendingChanges: () => boolean
  getPendingDiff: () => NotificationDiff
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  rules: [],
  bindings: [],
  loaded: false,
  activeRuleId: null,
  draft: null,
  advancedRuleIds: [],

  openInBuilder(ruleId: string) {
    const { advancedRuleIds } = get()
    if (advancedRuleIds.includes(ruleId)) return
    set({ advancedRuleIds: [...advancedRuleIds, ruleId] })
  },

  load() {
    if (get().loaded) return
    const rules = loadRules()
    const bindings = loadBindings()
    const draft = loadDraft()
    set({
      rules,
      bindings,
      loaded: true,
      draft,
      activeRuleId: draft?.ruleId ?? null,
    })
  },

  createRule(name: string) {
    const id = crypto.randomUUID()
    const now = Date.now()
    const rule: NotificationRuleDSL = {
      version: 1,
      id,
      name,
      steps: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }
    const next = [...get().rules, rule]
    set({ rules: next })
    saveRules(next)
    track('alert_created', { kind: 'custom' })
    return id
  },

  createSimpleAlert({ pair, market, spec }) {
    const now = Date.now()
    const ruleId = crypto.randomUUID()
    const { steps, edges } = buildSimpleAlertGraph(spec)
    const rule: NotificationRuleDSL = {
      version: 1,
      id: ruleId,
      name: simpleAlertName(spec, pair),
      steps,
      edges,
      cooldown: simpleAlertCooldownSeconds(spec),
      createdAt: now,
      updatedAt: now,
    }
    // Armed on creation. A simple alert that needed a second "bind it to a
    // pair" step would be exactly the chore this path exists to remove.
    const binding: NotificationBinding = {
      id: crypto.randomUUID(),
      ruleId,
      pair,
      market,
      enabled: true,
      createdAt: now,
    }
    const nextRules = [...get().rules, rule]
    const nextBindings = [...get().bindings, binding]
    set({ rules: nextRules, bindings: nextBindings })
    saveRules(nextRules)
    saveBindings(nextBindings)
    track('alert_created', { kind: spec.kind })
    return ruleId
  },

  updateSimpleAlert(ruleId, spec) {
    const { rules, bindings, draft } = get()
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule) return

    // Follow the name only while it is still the generated one. Someone who
    // renamed "BTC-USDT ≥ 100,000" to "take profit" means it.
    const previous = readSimpleAlert(rule)
    const pair = bindings.find((b) => b.ruleId === ruleId)?.pair ?? ''
    const isGeneratedName =
      previous !== null && rule.name === simpleAlertName(previous, pair)

    const { steps, edges } = buildSimpleAlertGraph(spec)
    const updated: NotificationRuleDSL = {
      ...rule,
      name: isGeneratedName ? simpleAlertName(spec, pair) : rule.name,
      steps,
      edges,
      cooldown: simpleAlertCooldownSeconds(spec),
      updatedAt: Date.now(),
    }
    const next = rules.map((r) => (r.id === ruleId ? updated : r))
    set({ rules: next })
    saveRules(next)

    // A draft opened on this rule holds the pre-edit graph; leaving it would
    // let a later Commit in the builder restore the steps we just replaced.
    if (draft?.ruleId === ruleId) {
      const freshDraft: NotificationDraft = {
        ruleId,
        baseSnapshot: structuredClone(updated),
        currentSteps: structuredClone(updated.steps),
        currentEdges: structuredClone(updated.edges),
        pendingChanges: [],
      }
      set({ draft: freshDraft })
      saveDraft(freshDraft)
    }
  },

  createPriceAlertRule({ pair, market, price, direction }) {
    return get().createSimpleAlert({
      pair,
      market,
      spec: {
        kind: 'price-level',
        direction,
        price: Number(price.toPrecision(8)),
        channels: DEFAULT_SIMPLE_ALERT_CHANNELS,
      },
    })
  },

  deleteRule(id: string) {
    const state = get()
    const next = state.rules.filter((r) => r.id !== id)
    const nextBindings = state.bindings.filter((b) => b.ruleId !== id)
    const updates: Partial<NotificationStore> = {
      rules: next,
      bindings: nextBindings,
    }

    // Clear draft if it belongs to the deleted rule
    if (state.draft?.ruleId === id) {
      updates.draft = null
      saveDraft(null)
    }
    if (state.activeRuleId === id) {
      updates.activeRuleId = null
    }

    set(updates)
    saveRules(next)
    saveBindings(nextBindings)
  },

  renameRule(id: string, name: string) {
    const { rules, draft } = get()
    const next = rules.map((r) =>
      r.id === id ? { ...r, name, updatedAt: Date.now() } : r,
    )
    set({ rules: next })
    saveRules(next)
    // Also update the draft's base snapshot if editing this rule
    if (draft?.ruleId === id) {
      const updated = {
        ...draft,
        baseSnapshot: { ...draft.baseSnapshot, name },
      }
      set({ draft: updated })
      saveDraft(updated)
    }
  },

  toggleRule(id: string) {
    const next = get().rules.map((r) =>
      r.id === id
        ? { ...r, enabled: r.enabled === false, updatedAt: Date.now() }
        : r,
    )
    set({ rules: next })
    saveRules(next)
  },

  selectRule(id: string | null) {
    set({ activeRuleId: id })
  },

  duplicateRule(id: string) {
    const { rules } = get()
    const source = rules.find((r) => r.id === id)
    if (!source) return

    const now = Date.now()
    const newId = crypto.randomUUID()
    // Re-map step IDs so the clone is fully independent
    const stepIdMap = new Map<string, string>()
    const clonedSteps = source.steps.map((s) => {
      const sid = crypto.randomUUID()
      stepIdMap.set(s.id, sid)
      return { ...structuredClone(s), id: sid }
    })
    const clonedEdges = source.edges.map((e) => ({
      ...structuredClone(e),
      id: crypto.randomUUID(),
      source: stepIdMap.get(e.source) ?? e.source,
      target: stepIdMap.get(e.target) ?? e.target,
    }))
    const clone: NotificationRuleDSL = {
      version: 1,
      id: newId,
      name: `${source.name} (copy)`,
      steps: clonedSteps,
      edges: clonedEdges,
      createdAt: now,
      updatedAt: now,
    }
    const next = [...rules, clone]
    set({ rules: next })
    saveRules(next)
  },

  // ── Binding CRUD ────────────────────────────────────────────────────

  addBinding(ruleId: string, pair: string, market: string, wallet?: string) {
    const id = crypto.randomUUID()
    const binding: NotificationBinding = {
      id,
      ruleId,
      pair,
      market,
      wallet,
      enabled: true,
      createdAt: Date.now(),
    }
    const next = [...get().bindings, binding]
    set({ bindings: next })
    saveBindings(next)
    return id
  },

  removeBinding(id: string) {
    const next = get().bindings.filter((b) => b.id !== id)
    set({ bindings: next })
    saveBindings(next)
  },

  toggleBinding(id: string) {
    const next = get().bindings.map((b) =>
      b.id === id ? { ...b, enabled: !b.enabled } : b,
    )
    set({ bindings: next })
    saveBindings(next)
  },

  getBindingsForPair(pair: string, market: string) {
    return get().bindings.filter((b) => b.pair === pair && b.market === market)
  },

  getBindingsForRule(ruleId: string) {
    return get().bindings.filter((b) => b.ruleId === ruleId)
  },

  startEditing(ruleId: string) {
    const rule = get().rules.find((r) => r.id === ruleId)
    if (!rule) return

    const draft: NotificationDraft = {
      ruleId,
      baseSnapshot: structuredClone(rule),
      currentSteps: structuredClone(rule.steps),
      currentEdges: structuredClone(rule.edges),
      pendingChanges: [],
    }
    set({ draft, activeRuleId: ruleId })
    saveDraft(draft)
  },

  hasPendingDraft() {
    return loadDraft() !== null
  },

  resumeDraft() {
    const draft = loadDraft()
    if (draft) {
      set({ draft, activeRuleId: draft.ruleId })
    }
  },

  addStep(step: NotificationStepDSL) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentSteps: [...draft.currentSteps, step],
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-added', { stepId: step.id, type: step.type }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  removeStep(stepId: string) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentSteps: draft.currentSteps.filter((n) => n.id !== stepId),
      // Also remove connected edges
      currentEdges: draft.currentEdges.filter(
        (e) => e.source !== stepId && e.target !== stepId,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-removed', { stepId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  updateStepPosition(stepId: string, position: { x: number; y: number }) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentSteps: draft.currentSteps.map((n) =>
        n.id === stepId ? { ...n, position } : n,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-moved', { stepId, position }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  updateStepData(stepId: string, data: Record<string, unknown>) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentSteps: draft.currentSteps.map((n) =>
        n.id === stepId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-data-changed', { stepId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  addEdge(edge: NotificationEdgeDSL) {
    const { draft } = get()
    if (!draft) return

    // Prevent duplicate edges (by ID or by same source+target pair)
    if (draft.currentEdges.some((e) => e.id === edge.id)) return
    if (
      draft.currentEdges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          (e.sourceHandle ?? null) === (edge.sourceHandle ?? null),
      )
    )
      return

    const updated: NotificationDraft = {
      ...draft,
      currentEdges: [...draft.currentEdges, edge],
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('edge-added', { edgeId: edge.id }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  removeEdge(edgeId: string) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentEdges: draft.currentEdges.filter((e) => e.id !== edgeId),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('edge-removed', { edgeId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  setSteps(steps: Array<NotificationStepDSL>) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentSteps: steps,
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-removed', { bulk: true }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  setEdges(edges: Array<NotificationEdgeDSL>) {
    const { draft } = get()
    if (!draft) return

    const updated: NotificationDraft = {
      ...draft,
      currentEdges: edges,
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('edge-removed', { bulk: true }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  commitDraft() {
    const { draft, rules } = get()
    if (!draft) return

    const now = Date.now()
    // Use the live rule (not stale snapshot) so that rename
    // changes made during editing are preserved
    const liveRule = rules.find((r) => r.id === draft.ruleId)
    const committed: NotificationRuleDSL = {
      ...(liveRule ?? draft.baseSnapshot),
      steps: draft.currentSteps,
      edges: draft.currentEdges,
      updatedAt: now,
    }

    const next = rules.map((r) => (r.id === committed.id ? committed : r))

    // Re-enter editing with the committed state as the new base snapshot
    // so the user stays on the same rule instead of being kicked out
    const freshDraft: NotificationDraft = {
      ruleId: committed.id,
      baseSnapshot: structuredClone(committed),
      currentSteps: structuredClone(committed.steps),
      currentEdges: structuredClone(committed.edges),
      pendingChanges: [],
    }

    set({ rules: next, draft: freshDraft })
    saveRules(next)
    saveDraft(freshDraft)
  },

  discardDraft() {
    set({ draft: null, activeRuleId: null })
    saveDraft(null)
  },

  hasPendingChanges() {
    const { draft } = get()
    if (!draft) return false
    return draft.pendingChanges.length > 0
  },

  getPendingDiff(): NotificationDiff {
    const { draft } = get()
    if (!draft) {
      return {
        addedSteps: [],
        removedSteps: [],
        modifiedSteps: [],
        addedEdges: [],
        removedEdges: [],
      }
    }

    const baseStepMap = new Map(draft.baseSnapshot.steps.map((n) => [n.id, n]))
    const currentStepMap = new Map(draft.currentSteps.map((n) => [n.id, n]))
    const baseEdgeMap = new Map(draft.baseSnapshot.edges.map((e) => [e.id, e]))
    const currentEdgeMap = new Map(draft.currentEdges.map((e) => [e.id, e]))

    const addedSteps = draft.currentSteps.filter((n) => !baseStepMap.has(n.id))
    const removedSteps = draft.baseSnapshot.steps.filter(
      (n) => !currentStepMap.has(n.id),
    )
    const modifiedSteps: NotificationDiff['modifiedSteps'] = []
    for (const [id, before] of baseStepMap) {
      const after = currentStepMap.get(id)
      if (after && JSON.stringify(before.data) !== JSON.stringify(after.data)) {
        modifiedSteps.push({ before, after })
      }
    }

    const addedEdges = draft.currentEdges.filter((e) => !baseEdgeMap.has(e.id))
    const removedEdges = draft.baseSnapshot.edges.filter(
      (e) => !currentEdgeMap.has(e.id),
    )

    return { addedSteps, removedSteps, modifiedSteps, addedEdges, removedEdges }
  },
}))

// Cross-window hydration: rules/bindings edited in a sibling window must
// reach this window's store — the leader window evaluates notifications for
// the whole app, so it has to see rules created anywhere. Drafts stay
// window-local (they're in-progress editor state).
onHydrate((key, value) => {
  if (!Array.isArray(value)) return
  if (key === 'notification-rules') {
    useNotificationStore.setState({
      rules: value as Array<NotificationRuleDSL>,
    })
  } else if (key === 'notification-bindings') {
    useNotificationStore.setState({
      bindings: value as Array<NotificationBinding>,
    })
  }
})
