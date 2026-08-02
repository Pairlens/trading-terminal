// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { emitWrite } from '@/lib/sync/sync-channel'

const STORAGE_KEY = 'pairlens:indicator-templates'

export type IndicatorTemplateEntry = {
  type: string
  params: Record<string, boolean | number | string>
  pane?: string
}

export type IndicatorTemplate = {
  id: string
  name: string
  indicators: Array<IndicatorTemplateEntry>
  createdAt: number
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadFromStorage(): Array<IndicatorTemplate> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveToStorage(templates: Array<IndicatorTemplate>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {
    // Ignore quota errors
  }
  emitWrite('indicator-templates', templates)
}

type IndicatorTemplatesStore = {
  templates: Array<IndicatorTemplate>
  loaded: boolean

  load: () => void
  saveTemplate: (
    name: string,
    indicators: Array<IndicatorTemplateEntry>,
  ) => string // returns id
  deleteTemplate: (id: string) => void
  renameTemplate: (id: string, name: string) => void
}

export const useIndicatorTemplatesStore = create<IndicatorTemplatesStore>(
  (set, get) => ({
    templates: [],
    loaded: false,

    load() {
      if (get().loaded) return
      set({ templates: loadFromStorage(), loaded: true })
    },

    saveTemplate(name, indicators) {
      const id = generateId()
      const template: IndicatorTemplate = {
        id,
        name,
        indicators: structuredClone(indicators),
        createdAt: Date.now(),
      }
      const next = [...get().templates, template]
      set({ templates: next })
      saveToStorage(next)
      return id
    },

    deleteTemplate(id) {
      const next = get().templates.filter((t) => t.id !== id)
      set({ templates: next })
      saveToStorage(next)
    },

    renameTemplate(id, name) {
      const next = get().templates.map((t) =>
        t.id === id ? { ...t, name } : t,
      )
      set({ templates: next })
      saveToStorage(next)
    },
  }),
)
