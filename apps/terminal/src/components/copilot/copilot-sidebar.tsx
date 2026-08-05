// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SidebarContent,
  SidebarHeader,
} from '@pairlens/ui/components/ui/sidebar'

import { CopilotChat } from './copilot-chat'
import { CopilotHeader } from './copilot-header'
import { CopilotInput } from './copilot-input'
import { CopilotSignalCard } from './copilot-signal-card'
import type { UIMessage } from 'ai'

const INITIAL_MESSAGES: Array<UIMessage> = [
  {
    id: '1',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: "Monitoring BTC-USDT. The market is showing signs of a developing trend after a period of consolidation. I'll keep you updated on key levels.",
      },
    ],
  },
]

export function CopilotSidebar() {
  const { t } = useTranslation()
  const [persona, setPersona] = useState<'mentor' | 'balanced' | 'technical'>(
    'balanced',
  )
  const [messages, setMessages] = useState<Array<UIMessage>>(INITIAL_MESSAGES)

  const handleSend = (content: string) => {
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: content }],
    }
    setMessages((prev) => [...prev, userMsg])

    // Mock AI response after a short delay
    setTimeout(() => {
      const aiMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: "I'm analyzing the current market conditions. This is a mock response -- the AI engine will provide real analysis once connected.",
          },
        ],
      }
      setMessages((prev) => [...prev, aiMsg])
    }, 1200)
  }

  return (
    <>
      <SidebarHeader className="gap-3 p-3">
        <CopilotHeader persona={persona} onPersonaChange={setPersona} />
        <CopilotSignalCard
          regime="trend"
          signal={{
            decision: 'WATCH',
            confidence: 0.72,
            summary: t('copilot.sidebarPreviewSummary', {
              defaultValue:
                'EMA crossover detected but volume is below average. Waiting for confirmation.',
            }),
          }}
        />
      </SidebarHeader>

      <SidebarContent className="flex flex-col overflow-hidden p-0">
        <CopilotChat messages={messages} status="ready" />
        <CopilotInput
          onSend={handleSend}
          status="ready"
          onStop={() => {}}
          quickActions={[
            'Validate setup',
            'Risk check',
            'What invalidates this?',
          ]}
        />
      </SidebarContent>
    </>
  )
}
