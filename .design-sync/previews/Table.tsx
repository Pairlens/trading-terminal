// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Badge,
} from '@pairlens/ui'

const rows = [
  ['BTC / USDT', '$68,830.50', '+2.4%', 'up'],
  ['ETH / USDT', '$3,540.12', '+1.1%', 'up'],
  ['SOL / USDT', '$168.44', '-3.7%', 'down'],
  ['XRP / USDT', '$0.6123', '+0.3%', 'up'],
]

export const Markets = () => (
  <div style={{ padding: 16 }}>
    <Table>
      <TableCaption>Top pairs by 24h volume</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Pair</TableHead>
          <TableHead>Last price</TableHead>
          <TableHead>24h</TableHead>
          <TableHead>Trend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([pair, price, chg, dir]) => (
          <TableRow key={pair}>
            <TableCell style={{ fontWeight: 500 }}>{pair}</TableCell>
            <TableCell>{price}</TableCell>
            <TableCell
              style={{
                color: dir === 'up' ? 'var(--chart-2)' : 'var(--destructive)',
              }}
            >
              {chg}
            </TableCell>
            <TableCell>
              <Badge variant={dir === 'up' ? 'secondary' : 'destructive'}>
                {dir === 'up' ? 'Long' : 'Short'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)
