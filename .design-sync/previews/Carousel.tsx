// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from '@pairlens/ui'

// Frozen capture clock: embla applies a transform to the track on init that may
// be captured mid-animation. Force the track to its resting position so the
// first slides render in place.
const freeze = `[data-slot="carousel-content"] > div{transform:none !important;}`

const pairs = [
  ['BTC / USDT', '$68,830.50', '+2.4%', 'OKX', true],
  ['ETH / USDT', '$3,540.12', '+1.1%', 'Binance', true],
  ['SOL / USDT', '$168.44', '-3.7%', 'Jupiter', false],
  ['XRP / USDT', '$0.6123', '+0.3%', 'Kraken', true],
  ['DOGE / USDT', '$0.1642', '+5.2%', 'Bybit', true],
]

export const FeaturedPairs = () => (
  <div style={{ padding: 16 }}>
    <style>{freeze}</style>
    <div style={{ margin: '0 52px' }}>
      <Carousel opts={{ align: 'start' }}>
        <CarouselContent>
          {pairs.map(([pair, price, chg, venue, up]) => (
            <CarouselItem key={pair as string} className="basis-1/2">
              <Card>
                <CardHeader>
                  <CardTitle style={{ fontSize: 15 }}>{pair}</CardTitle>
                  <CardDescription>Featured on {venue}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 20, fontWeight: 600 }}>
                      {price}
                    </span>
                    <Badge
                      variant={up ? 'secondary' : 'destructive'}
                      style={up ? { color: 'var(--chart-2)' } : undefined}
                    >
                      {chg}
                    </Badge>
                  </div>
                  <svg
                    width="100%"
                    height="48"
                    viewBox="0 0 200 48"
                    preserveAspectRatio="none"
                    style={{ marginTop: 12 }}
                  >
                    <polyline
                      points="0,40 25,36 50,38 75,24 100,28 125,16 150,20 175,8 200,12"
                      fill="none"
                      stroke={up ? 'var(--chart-2)' : 'var(--destructive)'}
                      strokeWidth={2}
                    />
                  </svg>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  </div>
)
