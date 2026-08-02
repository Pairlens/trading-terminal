// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from '@pairlens/ui'

export const PositionCard = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <Card>
      <CardHeader>
        <CardTitle>BTC / USDT</CardTitle>
        <CardDescription>Open long · 0.42 BTC</CardDescription>
        <CardAction>
          <Badge variant="secondary">+12.4%</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
          }}
        >
          <span style={{ color: 'var(--muted-foreground)' }}>Entry</span>
          <span>$61,240.00</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            marginTop: 6,
          }}
        >
          <span style={{ color: 'var(--muted-foreground)' }}>Mark</span>
          <span>$68,830.50</span>
        </div>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button size="sm" variant="outline">
          Adjust
        </Button>
        <Button size="sm" variant="destructive">
          Close
        </Button>
      </CardFooter>
    </Card>
  </div>
)

export const SimpleCard = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <Card>
      <CardHeader>
        <CardTitle>Portfolio value</CardTitle>
        <CardDescription>Across 6 connected venues</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ fontSize: 28, fontWeight: 600 }}>$128,406.22</div>
      </CardContent>
    </Card>
  </div>
)
