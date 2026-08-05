// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  ChevronDown,
  Globe,
  Info,
  Layers,
  Search,
} from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'
import { cn } from '@pairlens/ui/lib/utils'
import { BottomPanelPlaceholder } from './bottom-panel-placeholder'
import { BottomPanelDataLog } from './bottom-panel-data-log'
import type { PluginCandle } from '@/hooks/use-candle-stream'

type BottomPanelProps = {
  candles: Array<PluginCandle>
  latestCandle: PluginCandle | null
  collapsed: boolean
  onToggleCollapse: () => void
}

export function BottomPanel({
  candles,
  latestCandle,
  collapsed,
  onToggleCollapse,
}: BottomPanelProps) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="data-log" className="flex h-full flex-col gap-0">
      <div className="flex items-center justify-between border-b px-2">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="data-log">{t('panes.dataLog')}</TabsTrigger>
          <TabsTrigger value="orderbook">{t('panes.orderBook')}</TabsTrigger>
          <TabsTrigger value="depth">Depth</TabsTrigger>
          <TabsTrigger value="pair-info">{t('panes.pairInfo')}</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
        </TabsList>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6"
          onClick={onToggleCollapse}
          aria-label={
            collapsed
              ? t('terminal.panel.expand')
              : t('terminal.panel.collapse')
          }
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              collapsed && 'rotate-180',
            )}
          />
        </Button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <TabsContent value="data-log" className="h-full p-2">
            <BottomPanelDataLog candles={candles} latestCandle={latestCandle} />
          </TabsContent>
          <TabsContent value="orderbook" className="h-full">
            <BottomPanelPlaceholder
              icon={BookOpen}
              title={t('panes.orderBook')}
              description="Real-time order book depth will be displayed here."
            />
          </TabsContent>
          <TabsContent value="depth" className="h-full">
            <BottomPanelPlaceholder
              icon={Layers}
              title={t('panes.marketDepth')}
              description="Visual depth chart will be displayed here."
            />
          </TabsContent>
          <TabsContent value="pair-info" className="h-full">
            <BottomPanelPlaceholder
              icon={Info}
              title={t('panes.pairInfo')}
              description="Instrument details, contract specs, and funding rates."
            />
          </TabsContent>
          <TabsContent value="research" className="h-full">
            <BottomPanelPlaceholder
              icon={Search}
              title="Research"
              description="AI-curated research and analysis for this pair."
            />
          </TabsContent>
          <TabsContent value="social" className="h-full">
            <BottomPanelPlaceholder
              icon={Globe}
              title={t('panes.social')}
              description="Aggregated social sentiment and trending topics."
            />
          </TabsContent>
        </div>
      )}
    </Tabs>
  )
}
