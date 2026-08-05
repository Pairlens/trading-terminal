// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the Workflows canvas shows when there is nothing to draw.
 *
 * Two shades of empty, and they are not the same problem:
 *  - no workflows at all (the state right after the first-open tour closes) —
 *    the user needs to be told what this page is for and handed a template;
 *  - workflows exist but none is open — they only need a nudge to click one.
 */
import { useTranslation } from 'react-i18next'
import { Workflow } from 'lucide-react'

import { StarterEmptyState } from '../starter-empty-state'
import {
  WORKFLOW_TEMPLATES,
  applyWorkflowTemplate,
  workflowTemplateChips,
} from './workflow-templates'
import type { StarterTemplate } from '../starter-empty-state'
import { useWorkflowStore } from '@/stores/workflow-store'

export function WorkflowsEmptyState() {
  const { t } = useTranslation()
  const workflows = useWorkflowStore((s) => s.workflows)
  const loaded = useWorkflowStore((s) => s.loaded)
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow)
  const selectWorkflow = useWorkflowStore((s) => s.selectWorkflow)
  const startEditing = useWorkflowStore((s) => s.startEditing)

  // The builder hydrates from localStorage in an effect; until it has, "no
  // workflows" is a guess, and flashing the pitch at a returning user is worse
  // than a blank frame.
  if (!loaded) return <div className="flex-1" />

  if (workflows.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t('workflows.emptyState.pickWorkflow')}
      </div>
    )
  }

  const handlePick = (template: StarterTemplate) => {
    const full = WORKFLOW_TEMPLATES.find((tpl) => tpl.id === template.id)
    if (full) applyWorkflowTemplate(full)
  }

  const handleBlank = () => {
    const id = createWorkflow(t('workflows.emptyState.untitledWorkflow'))
    selectWorkflow(id)
    startEditing(id)
  }

  // Translated at render time so the catalog module stays hook-free; the
  // raw English record is still what `handlePick` looks up and hands to
  // `applyWorkflowTemplate`, which localizes the name it persists.
  const templates = WORKFLOW_TEMPLATES.map((template) => ({
    ...template,
    title: t(`workflows.templates.${template.id}.title`, {
      defaultValue: template.title,
    }),
    description: t(`workflows.templates.${template.id}.description`, {
      defaultValue: template.description,
    }),
    chips: workflowTemplateChips(t, template),
  }))

  return (
    <StarterEmptyState
      eyebrow={t('workflows.emptyState.eyebrow')}
      title={t('workflows.emptyState.title')}
      description={t('workflows.emptyState.description')}
      icon={Workflow}
      templates={templates}
      onPickTemplate={handlePick}
      blankLabel={t('workflows.emptyState.blankLabel')}
      onCreateBlank={handleBlank}
      footnote={t('workflows.emptyState.footnote')}
    />
  )
}
