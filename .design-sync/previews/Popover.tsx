// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Button,
  Label,
  Input,
  Separator,
} from '@pairlens/ui'

const freeze = `
[data-slot='popover-content']{animation:none !important;transform:none !important;opacity:1 !important;}
`

export const QuickBuy = () => (
  <div
    style={{
      padding: 16,
      minHeight: 340,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <style>{freeze}</style>
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline">Quick buy</Button>} />
      <PopoverContent side="bottom" align="center">
        <PopoverHeader>
          <PopoverTitle>Quick buy — SOL/USDT</PopoverTitle>
          <PopoverDescription>Coinbase · market order</PopoverDescription>
        </PopoverHeader>
        <div style={{ display: 'grid', gap: 8 }}>
          <Label htmlFor="pop-amt">Amount (USDT)</Label>
          <Input id="pop-amt" defaultValue="500" />
        </div>
        <Separator />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--muted-foreground)' }}>≈ Size</span>
          <span>2.86 SOL</span>
        </div>
        <Button size="sm">Confirm buy</Button>
      </PopoverContent>
    </Popover>
  </div>
)
