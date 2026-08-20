// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge as rfAddEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from 'next-themes'
import { Redo2, Trash2, Undo2 } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'

import { getStepType } from '@pairlens/workflow-engine/step-registry'
import { findCycleEdgeIds } from '@pairlens/workflow-engine/validator'

import { CommitBar } from './commit-bar'
import { StepPalette, clearDragStepType, getDragStepType } from './step-palette'
import { WorkflowsEmptyState } from './workflows-empty-state'
import type { DragEvent } from 'react'
import type { Connection, Edge, Node } from '@xyflow/react'
import { PAGE_COLUMN_FLUSH } from '@/components/chrome/page-chrome'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useWorkflowStepRegistry } from '@/lib/workflows/workflow-step-registry'
import { onExternalGraphWrite } from '@/lib/assistant/graph-apply'

// ── Stable wrapped step types (defined once, never recreated) ─────────
// Disconnected / new-animation state is passed via node data so the
// nodeTypes object reference stays stable and ReactFlow doesn't unmount
// nodes (which would break handle connections).

// Use base step types directly — wrapping with extra divs breaks
// ReactFlow's Handle connection detection.

// ── Helpers to convert between DSL ↔ ReactFlow nodes ─────────────────

function dslToRfNodes(
  dslSteps: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>,
): Array<Node> {
  return dslSteps.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }))
}

function dslToRfEdges(
  dslEdges: Array<{
    id: string
    source: string
    sourceHandle?: string
    target: string
  }>,
): Array<Edge> {
  return dslEdges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    animated: true,
    style: { strokeWidth: 2 },
  }))
}

// ── Undo / Redo stack ────────────────────────────────────────────────

type Snapshot = { nodes: Array<Node>; edges: Array<Edge> }

function useUndoRedo(
  rfNodes: Array<Node>,
  rfEdges: Array<Edge>,
  setRfNodes: (
    nodes: Array<Node> | ((nds: Array<Node>) => Array<Node>),
  ) => void,
  setRfEdges: (
    edges: Array<Edge> | ((eds: Array<Edge>) => Array<Edge>),
  ) => void,
) {
  const undoStack = useRef<Array<Snapshot>>([])
  const redoStack = useRef<Array<Snapshot>>([])
  const [, forceUpdate] = useState(0)

  const pushSnapshot = useCallback(() => {
    undoStack.current.push({
      nodes: rfNodes.map((n) => ({ ...n })),
      edges: rfEdges.map((e) => ({ ...e })),
    })
    redoStack.current = []
    if (undoStack.current.length > 50) undoStack.current.shift()
    forceUpdate((c) => c + 1)
  }, [rfNodes, rfEdges])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    redoStack.current.push({
      nodes: rfNodes.map((n) => ({ ...n })),
      edges: rfEdges.map((e) => ({ ...e })),
    })
    const snap = undoStack.current.pop()!
    setRfNodes(snap.nodes)
    setRfEdges(snap.edges)
    forceUpdate((c) => c + 1)
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    undoStack.current.push({
      nodes: rfNodes.map((n) => ({ ...n })),
      edges: rfEdges.map((e) => ({ ...e })),
    })
    const snap = redoStack.current.pop()!
    setRfNodes(snap.nodes)
    setRfEdges(snap.edges)
    forceUpdate((c) => c + 1)
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges])

  return {
    pushSnapshot,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  }
}

// ── Disconnected node detection ──────────────────────────────────────

function getDisconnectedNodeIds(
  nodes: Array<Node>,
  edges: Array<Edge>,
): Set<string> {
  const trigger = nodes.find((n) => n.type === 'trigger')
  if (!trigger) return new Set(nodes.map((n) => n.id))

  const adj = new Map<string, Array<string>>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }

  const reachable = new Set<string>()
  const queue = [trigger.id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (reachable.has(cur)) continue
    reachable.add(cur)
    for (const nb of adj.get(cur) ?? []) {
      if (!reachable.has(nb)) queue.push(nb)
    }
  }

  const disconnected = new Set<string>()
  for (const n of nodes) {
    if (!reachable.has(n.id)) disconnected.add(n.id)
  }
  return disconnected
}

// ── Canvas ───────────────────────────────────────────────────────────

export function WorkflowCanvas() {
  const { t } = useTranslation()
  const { screenToFlowPosition } = useReactFlow()
  const wsr = useWorkflowStepRegistry()

  const rfStepTypes = useMemo(
    () => wsr.getReactFlowStepTypes() as any,
    // wsr.getSnapshot() is the recompute trigger; the registry object itself is stable
    [wsr.getSnapshot()],
  )
  const draft = useWorkflowStore((s) => s.draft)
  const storeAddStep = useWorkflowStore((s) => s.addStep)
  const storeRemoveStep = useWorkflowStore((s) => s.removeStep)
  const storeAddEdge = useWorkflowStore((s) => s.addEdge)
  const storeSetSteps = useWorkflowStore((s) => s.setSteps)
  const storeSetEdges = useWorkflowStore((s) => s.setEdges)
  const storeUpdateStepPosition = useWorkflowStore((s) => s.updateStepPosition)

  const [contextMenu, setContextMenu] = useState<{
    type: 'node' | 'edge'
    id: string
    x: number
    y: number
  } | null>(null)

  // Local ReactFlow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    draft ? dslToRfNodes(draft.currentSteps) : [],
  )
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(
    draft ? dslToRfEdges(draft.currentEdges) : [],
  )

  const { resolvedTheme } = useTheme()
  const colorMode = resolvedTheme === 'light' ? 'light' : 'dark'

  // Undo/redo
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo(
    rfNodes,
    rfEdges,
    setRfNodes,
    setRfEdges,
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
      if (mod && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // Track draft ID for reinit on workflow switch
  const activeDraftId = useRef<string | null>(null)

  useEffect(() => {
    if (!draft) {
      activeDraftId.current = null
      return
    }
    if (activeDraftId.current !== draft.workflowId) {
      activeDraftId.current = draft.workflowId
      setRfNodes(dslToRfNodes(draft.currentSteps))
      setRfEdges(dslToRfEdges(draft.currentEdges))
    }
  }, [draft, setRfNodes, setRfEdges])

  // A rewrite that did not come from this canvas (the assistant writing a
  // graph) has to be pulled in explicitly: the effect above only fires on a
  // workflow switch, so without this the edit would be invisible here and the
  // next drag would push this stale state back over it.
  useEffect(
    () =>
      onExternalGraphWrite(() => {
        const current = useWorkflowStore.getState().draft
        if (!current) return
        setRfNodes(dslToRfNodes(current.currentSteps))
        setRfEdges(dslToRfEdges(current.currentEdges))
      }),
    [setRfNodes, setRfEdges],
  )

  // Detect disconnected nodes
  const disconnectedIds = useMemo(
    () => getDisconnectedNodeIds(rfNodes, rfEdges),
    [rfNodes, rfEdges],
  )

  // Pass disconnected state to nodes via className + style + data
  const augmentedNodes = useMemo(
    () =>
      rfNodes.map((n) => {
        const isDisconnected = disconnectedIds.has(n.id)
        return {
          ...n,
          className: isDisconnected ? 'opacity-50 [&]:!opacity-50' : undefined,
          style: isDisconnected ? { ...n.style, opacity: 0.5 } : n.style,
          data: {
            ...n.data,
            _isDisconnected: isDisconnected,
          },
        }
      }),
    [rfNodes, disconnectedIds],
  )

  // Detect cycle edges — highlight them red in the canvas
  const cycleEdgeIds = useMemo(() => {
    const dslSteps = rfNodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'default',
      position: n.position,
      data: n.data,
    }))
    const dslEdges = rfEdges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? undefined,
      target: e.target,
    }))
    return findCycleEdgeIds(dslSteps, dslEdges)
  }, [rfNodes, rfEdges])

  const hasCycles = cycleEdgeIds.size > 0

  // Augment edges with cycle styling
  const augmentedEdges = useMemo(
    () =>
      rfEdges.map((e) => {
        if (cycleEdgeIds.has(e.id)) {
          return {
            ...e,
            animated: true,
            style: {
              ...e.style,
              stroke: 'oklch(0.637 0.237 25.331)', // red-500
              strokeWidth: 3,
            },
            label: 'cycle',
            labelStyle: {
              fill: 'oklch(0.637 0.237 25.331)',
              fontSize: 10,
              fontWeight: 600,
            },
          }
        }
        return e
      }),
    [rfEdges, cycleEdgeIds],
  )

  // ── Sync helpers ─────────────────────────────────────────────────

  const syncStepsToStore = useCallback(() => {
    storeSetSteps(
      rfNodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'default',
        position: n.position,
        data: n.data,
      })),
    )
  }, [rfNodes, storeSetSteps])

  const syncEdgesToStore = useCallback(() => {
    storeSetEdges(
      rfEdges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? undefined,
        target: e.target,
      })),
    )
  }, [rfEdges, storeSetEdges])

  const onNodeDragStart = useCallback(() => {
    pushSnapshot()
  }, [pushSnapshot])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      storeUpdateStepPosition(node.id, node.position)
      syncStepsToStore()
    },
    [storeUpdateStepPosition, syncStepsToStore],
  )

  const onNodesDelete = useCallback(() => {
    setTimeout(syncStepsToStore, 0)
  }, [syncStepsToStore])

  const onEdgesDelete = useCallback(() => {
    // Defer slightly so ReactFlow's internal state updates first
    setTimeout(syncEdgesToStore, 0)
  }, [syncEdgesToStore])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      // Prevent duplicate edges between the same source handle and target
      const exists = rfEdges.some(
        (e) =>
          e.source === params.source &&
          e.target === params.target &&
          (e.sourceHandle ?? null) === (params.sourceHandle ?? null),
      )
      if (exists) return
      pushSnapshot()
      const edgeId = `e-${params.source}-${params.target}-${Date.now()}`
      // Update local ReactFlow state
      setRfEdges((eds) =>
        rfAddEdge(
          { ...params, id: edgeId, animated: true, style: { strokeWidth: 2 } },
          eds,
        ),
      )
      // Sync to store immediately — no setTimeout, edges must be in store
      // before commit or execution
      storeAddEdge({
        id: edgeId,
        source: params.source,
        sourceHandle: params.sourceHandle ?? undefined,
        target: params.target,
      })
    },
    [storeAddEdge, setRfEdges, pushSnapshot, rfEdges],
  )

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  // ── Context menu ─────────────────────────────────────────────────

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setContextMenu({
        type: 'node',
        id: node.id,
        x: event.clientX,
        y: event.clientY,
      })
    },
    [],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      setContextMenu({
        type: 'edge',
        id: edge.id,
        x: event.clientX,
        y: event.clientY,
      })
    },
    [],
  )

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      pushSnapshot()
      setRfEdges((eds) => eds.filter((e) => e.id !== edgeId))
      setTimeout(() => syncEdgesToStore(), 0)
      setContextMenu(null)
    },
    [pushSnapshot, setRfEdges, syncEdgesToStore],
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const node = rfNodes.find((n) => n.id === nodeId)
      if (!node || node.type === 'trigger') return

      pushSnapshot()

      setRfNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setRfEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      )
      storeRemoveStep(nodeId)
      setContextMenu(null)
    },
    [rfNodes, pushSnapshot, setRfNodes, setRfEdges, storeRemoveStep],
  )

  // ── Add step helpers ───────────────────────────────────────────────

  const addStepAtPosition = useCallback(
    (stepType: string, position: { x: number; y: number }) => {
      const stepDef = getStepType(stepType)
      if (!stepDef) return

      pushSnapshot()
      const id = `${stepType}-${Date.now()}`
      const newStep = {
        id,
        type: stepType,
        position,
        data: stepDef.defaultData(),
      }
      storeAddStep(newStep)
      setRfNodes((nds) => [...nds, newStep])
    },
    [storeAddStep, setRfNodes, pushSnapshot],
  )

  // Drag-and-drop (browser only)
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const type =
        event.dataTransfer.getData('application/workflow-step-type') ||
        getDragStepType()
      clearDragStepType()
      if (!type) return

      addStepAtPosition(
        type,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      )
    },
    [addStepAtPosition, screenToFlowPosition],
  )

  // Click-to-add (primary, works in Tauri/WebKit)
  const handleAddStepFromPalette = useCallback(
    (stepType: string) => {
      const rfContainer = document.querySelector('.react-flow')
      const rect = rfContainer?.getBoundingClientRect()
      const centerX = rect ? rect.left + rect.width / 2 : 400
      const centerY = rect ? rect.top + rect.height / 2 : 300
      const position = screenToFlowPosition({ x: centerX, y: centerY })
      position.x += (Math.random() - 0.5) * 80
      position.y += (Math.random() - 0.5) * 80
      addStepAtPosition(stepType, position)
    },
    [addStepAtPosition, screenToFlowPosition],
  )

  if (!draft) {
    return (
      <div className={`flex-1 ${PAGE_COLUMN_FLUSH}`}>
        <WorkflowsEmptyState />
      </div>
    )
  }

  return (
    <>
      {/*
        The board column: the canvas, and the commit bar under it across one
        hairline. The palette is the column NEXT to this one rather than a
        region inside it. A full-height rail wants the ground between itself
        and the canvas, and a vertical rule beside the horizontal one under
        the canvas is what makes a board read as a spreadsheet.
      */}
      <div className={`flex-1 ${PAGE_COLUMN_FLUSH}`}>
        {/*
          The canvas is a well inside the column, not the column itself: nodes
          are `--card` objects, so a canvas painted `--card` would dissolve
          them into their own ground.
        */}
        <div
          /*
            Two alphas, because `--muted` sits on opposite sides of `--card` in
            the two modes. Dark stacks it above (19.5% over a 16.8% card), light
            below (94.5% under a 99.3% one), so one number cannot serve both: at
            40% the light well landed under two points of lightness from the card
            it sits in and from the nodes floating on it, which is inside the
            noise floor of a near-white screen. The canvas simply had no edges,
            and the minimap and the zoom controls — `--card` chips that read by
            contrast with the well and nothing else — went with it.
          */
          className="relative min-h-0 flex-1 bg-muted/70 dark:bg-muted/40"
          style={
            {
              // The well above paints the pane; ReactFlow must not paint over it.
              '--xy-background-color': 'transparent',
              '--xy-node-background-color': 'var(--card)',
              '--xy-node-border-color': 'var(--border)',
              '--xy-edge-stroke':
                'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
              '--xy-minimap-background-color': 'var(--card)',
              '--xy-minimap-mask-background-color':
                'color-mix(in oklch, var(--card) 85%, transparent)',
              '--xy-minimap-node-background-color':
                'color-mix(in oklch, var(--muted-foreground) 30%, transparent)',
              '--xy-controls-button-background-color': 'var(--card)',
              '--xy-controls-button-color': 'var(--foreground)',
              '--xy-controls-button-border-color': 'var(--border)',
            } as React.CSSProperties
          }
        >
          <ReactFlow
            nodes={augmentedNodes}
            edges={augmentedEdges}
            nodeTypes={rfStepTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            snapToGrid
            snapGrid={[16, 16]}
            connectionRadius={20}
            deleteKeyCode="Backspace"
            colorMode={colorMode}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              animated: true,
              style: { strokeWidth: 2 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              /*
                Both modes name a token. Light used to fall through to xyflow's
                own default, a cool grey (#91919a) that knows nothing about the
                18 themes it has to sit inside and reads blue against a warm
                paper ground. The alphas differ because the grid has to carry
                the same weight over a near-white well as over a near-black one.
              */
              color={
                colorMode === 'dark'
                  ? 'color-mix(in oklch, var(--muted-foreground) 25%, transparent)'
                  : 'color-mix(in oklch, var(--muted-foreground) 35%, transparent)'
              }
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor="color-mix(in oklch, var(--foreground) 40%, transparent)"
              maskColor="color-mix(in oklch, var(--card) 80%, transparent)"
              // Floats on the canvas well, so it is shaped like the undo
              // cluster above it: a card at 10px with no edge of its own.
              style={{
                backgroundColor: 'var(--card)',
                border: 'none',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            />

            {/* Undo/Redo toolbar */}
            <Panel position="top-left" className="!m-2">
              {/* Floats over the canvas, so it keeps an edge. What it floats
                  on is the column's own surface, not the page ground. */}
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!canUndo}
                  onClick={undo}
                  title={t('workflows.canvas.undoTitle')}
                >
                  <Undo2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!canRedo}
                  onClick={redo}
                  title={t('workflows.canvas.redoTitle')}
                >
                  <Redo2 className="size-3.5" />
                </Button>
              </div>
            </Panel>
          </ReactFlow>

          {/* Context menu */}
          {contextMenu && (
            <div
              className="fixed z-[100] min-w-[140px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.type === 'node' && (
                <button
                  type="button"
                  disabled={
                    rfNodes.find((n) => n.id === contextMenu.id)?.type ===
                    'trigger'
                  }
                  onClick={() => handleDeleteNode(contextMenu.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors',
                    'text-destructive hover:bg-destructive/10',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <Trash2 className="size-3.5" />
                  {t('workflows.canvas.deleteStep')}
                </button>
              )}
              {contextMenu.type === 'edge' && (
                <button
                  type="button"
                  onClick={() => handleDeleteEdge(contextMenu.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors',
                    'text-destructive hover:bg-destructive/10',
                  )}
                >
                  <Trash2 className="size-3.5" />
                  {t('workflows.canvas.deleteConnection')}
                </button>
              )}
            </div>
          )}
        </div>

        <CommitBar hasCycles={hasCycles} onBeforeCommit={syncStepsToStore} />
      </div>

      {/* Step palette: always visible, always its own column. */}
      <StepPalette onAddStep={handleAddStepFromPalette} />
    </>
  )
}
