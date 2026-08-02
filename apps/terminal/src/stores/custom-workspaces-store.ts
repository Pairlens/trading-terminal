// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type {
  CustomWorkspaceDefinition,
  TerminalLayout,
  WorkspaceFolder,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import { track } from '@/lib/analytics-events'
import { layoutId } from '@/lib/layout/utils'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

const STORAGE_KEY = 'pairlens:custom-workspaces'

type StorageData = {
  workspaces: Array<CustomWorkspaceDefinition>
  folders: Array<WorkspaceFolder>
}

function loadFromStorage(): StorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate: old format was a plain array of workspaces
      if (Array.isArray(parsed)) {
        return { workspaces: parsed, folders: [] }
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray(parsed.workspaces)
      ) {
        return {
          workspaces: parsed.workspaces,
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        }
      }
    }
  } catch {
    // Ignore corrupted data
  }
  return { workspaces: [], folders: [] }
}

function saveToStorage(data: StorageData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore quota errors
  }
  emitWrite('custom-workspaces', data)
}

type CustomWorkspacesStore = {
  workspaces: Array<CustomWorkspaceDefinition>
  folders: Array<WorkspaceFolder>
  loaded: boolean

  load: () => void
  /** Replace state from a cross-window or cloud hydrate — no re-persist. */
  hydrate: (data: StorageData) => void
  createWorkspace: (params: {
    name: string
    description?: string
    icon?: string
    variables: Array<WorkspaceVariableDefinition>
    defaultLayout: TerminalLayout
    folderId?: string | null
  }) => string // returns id
  updateWorkspace: (
    id: string,
    patch: Partial<Omit<CustomWorkspaceDefinition, 'id' | 'createdAt'>>,
  ) => void
  deleteWorkspace: (id: string) => void
  moveWorkspace: (wsId: string, folderId: string | null) => void

  createFolder: (name: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveFolder: (folderId: string, newParentId: string | null) => void
}

function getStorageData(state: CustomWorkspacesStore): StorageData {
  return { workspaces: state.workspaces, folders: state.folders }
}

export const useCustomWorkspacesStore = create<CustomWorkspacesStore>(
  (set, get) => ({
    workspaces: [],
    folders: [],
    loaded: false,

    load() {
      if (get().loaded) return
      const data = loadFromStorage()
      set({ workspaces: data.workspaces, folders: data.folders, loaded: true })
    },

    createWorkspace({
      name,
      description,
      icon,
      variables,
      defaultLayout,
      folderId,
    }) {
      const id = layoutId()
      const now = Date.now()
      const siblings = get().workspaces.filter(
        (ws) => (ws.folderId ?? null) === (folderId ?? null),
      )
      const maxOrder = siblings.reduce(
        (max, ws) => Math.max(max, ws.order ?? 0),
        0,
      )
      const ws: CustomWorkspaceDefinition = {
        id,
        name,
        description,
        icon,
        variables: structuredClone(variables),
        defaultLayout: structuredClone(defaultLayout),
        folderId: folderId ?? null,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      }
      const next = { ...get(), workspaces: [...get().workspaces, ws] }
      set({ workspaces: next.workspaces })
      saveToStorage(getStorageData({ ...get(), workspaces: next.workspaces }))
      track('workspace_created', { workspace_count: next.workspaces.length })
      return id
    },

    updateWorkspace(id, patch) {
      const next = get().workspaces.map((ws) =>
        ws.id === id ? { ...ws, ...patch, updatedAt: Date.now() } : ws,
      )
      set({ workspaces: next })
      saveToStorage(getStorageData({ ...get(), workspaces: next }))
    },

    deleteWorkspace(id) {
      const next = get().workspaces.filter((ws) => ws.id !== id)
      set({ workspaces: next })
      saveToStorage(getStorageData({ ...get(), workspaces: next }))
      track('workspace_deleted', { workspace_count: next.length })
      // Clean up associated layout and variable stores from localStorage
      try {
        localStorage.removeItem(`pairlens:workspace.${id}.layout`)
        localStorage.removeItem(`pairlens:workspace-vars:${id}`)
      } catch {
        // Ignore
      }
    },

    moveWorkspace(wsId, folderId) {
      const siblings = get().workspaces.filter(
        (ws) => (ws.folderId ?? null) === folderId && ws.id !== wsId,
      )
      const maxOrder = siblings.reduce(
        (max, ws) => Math.max(max, ws.order ?? 0),
        0,
      )
      const next = get().workspaces.map((ws) =>
        ws.id === wsId
          ? { ...ws, folderId, order: maxOrder + 1, updatedAt: Date.now() }
          : ws,
      )
      set({ workspaces: next })
      saveToStorage(getStorageData({ ...get(), workspaces: next }))
    },

    createFolder(name, parentId) {
      const id = layoutId()
      const siblings = get().folders.filter(
        (f) => f.parentId === (parentId ?? null),
      )
      const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0)
      const folder: WorkspaceFolder = {
        id,
        name,
        parentId: parentId ?? null,
        order: maxOrder + 1,
      }
      const next = [...get().folders, folder]
      set({ folders: next })
      saveToStorage(getStorageData({ ...get(), folders: next }))
      return id
    },

    renameFolder(id, name) {
      const next = get().folders.map((f) => (f.id === id ? { ...f, name } : f))
      set({ folders: next })
      saveToStorage(getStorageData({ ...get(), folders: next }))
    },

    deleteFolder(id) {
      // Collect all descendant folder IDs
      const allFolderIds = new Set<string>([id])
      let changed = true
      while (changed) {
        changed = false
        for (const f of get().folders) {
          if (
            f.parentId &&
            allFolderIds.has(f.parentId) &&
            !allFolderIds.has(f.id)
          ) {
            allFolderIds.add(f.id)
            changed = true
          }
        }
      }
      // Remove all descendant folders
      const nextFolders = get().folders.filter((f) => !allFolderIds.has(f.id))
      // Orphan workspaces in deleted folders to root
      const nextWorkspaces = get().workspaces.map((ws) =>
        ws.folderId && allFolderIds.has(ws.folderId)
          ? { ...ws, folderId: null, updatedAt: Date.now() }
          : ws,
      )
      set({ folders: nextFolders, workspaces: nextWorkspaces })
      saveToStorage(
        getStorageData({
          ...get(),
          folders: nextFolders,
          workspaces: nextWorkspaces,
        }),
      )
    },

    hydrate(data) {
      set({ workspaces: data.workspaces, folders: data.folders, loaded: true })
    },

    moveFolder(folderId, newParentId) {
      // Prevent moving a folder into its own descendants
      const descendants = new Set<string>([folderId])
      let changed = true
      while (changed) {
        changed = false
        for (const f of get().folders) {
          if (
            f.parentId &&
            descendants.has(f.parentId) &&
            !descendants.has(f.id)
          ) {
            descendants.add(f.id)
            changed = true
          }
        }
      }
      if (newParentId && descendants.has(newParentId)) return

      const siblings = get().folders.filter(
        (f) => f.parentId === newParentId && f.id !== folderId,
      )
      const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0)
      const next = get().folders.map((f) =>
        f.id === folderId
          ? { ...f, parentId: newParentId, order: maxOrder + 1 }
          : f,
      )
      set({ folders: next })
      saveToStorage(getStorageData({ ...get(), folders: next }))
    },
  }),
)

// Cross-window / cloud hydration: sibling windows broadcast workspace edits
// (create/rename/delete) and the SyncCoordinator pushes cloud-merged values —
// both arrive here so every window's tree stays consistent.
onHydrate((key, value) => {
  if (key !== 'custom-workspaces') return
  if (Array.isArray(value)) {
    // Legacy shape: plain array of workspaces
    useCustomWorkspacesStore
      .getState()
      .hydrate({ workspaces: value, folders: [] })
    return
  }
  if (value && typeof value === 'object') {
    const data = value as Partial<StorageData>
    if (Array.isArray(data.workspaces)) {
      useCustomWorkspacesStore.getState().hydrate({
        workspaces: data.workspaces,
        folders: Array.isArray(data.folders) ? data.folders : [],
      })
    }
  }
})
