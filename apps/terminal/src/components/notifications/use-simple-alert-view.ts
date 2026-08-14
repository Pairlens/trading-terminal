// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isSimpleAlert } from '@pairlens/notification-engine/simple-alerts'

import { useNotificationStore } from '@/stores/notification-store'

/**
 * Does this rule open as the simple form rather than the canvas?
 *
 * Its own module because both the builder (which editor to render) and the
 * sidebar (whether to show the pairs panel, which the form owns) need the
 * answer, and importing it from the builder would close a cycle between the
 * two components.
 */
export function useSimpleAlertView(ruleId: string | null): boolean {
  return useNotificationStore((s) => {
    if (!ruleId) return false
    if (s.advancedRuleIds.includes(ruleId)) return false
    const rule = s.rules.find((r) => r.id === ruleId)
    return rule ? isSimpleAlert(rule) : false
  })
}
