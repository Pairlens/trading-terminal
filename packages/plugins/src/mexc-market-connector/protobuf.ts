// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Minimal hand-written Protobuf decoder for MEXC WebSocket binary frames.
 *
 * Only decodes — no encoding needed (WS subscriptions are sent as JSON).
 * Handles wire types 0 (varint) and 2 (length-delimited) which cover all
 * MEXC message types (string, int32, int64, bool, embedded messages).
 *
 * Proto definitions: https://github.com/mexcdevelop/websocket-proto
 */

const textDecoder = new TextDecoder()

// ── Low-level reader ─────────────────────────────────────────────────

class ProtobufReader {
  private buf: Uint8Array
  pos: number
  private end: number

  constructor(data: Uint8Array, offset = 0, length?: number) {
    this.buf = data
    this.pos = offset
    this.end = length !== undefined ? offset + length : data.length
  }

  hasMore(): boolean {
    return this.pos < this.end
  }

  /** Read unsigned varint (up to 53-bit safe integer). */
  readVarint(): number {
    let result = 0
    let shift = 0
    while (this.pos < this.end) {
      const byte = this.buf[this.pos++]
      result |= (byte & 0x7f) * (1 << shift) // use multiply for shift > 31
      if ((byte & 0x80) === 0) return result >>> 0 // unsigned
      shift += 7
      if (shift > 49) {
        // Skip remaining bytes for very large varints (int64 > 2^53)
        while (this.pos < this.end && (this.buf[this.pos++] & 0x80) !== 0) {}
        break
      }
    }
    return result
  }

  /** Read varint as signed 64-bit (JavaScript number, safe for timestamps). */
  readInt64(): number {
    // int64 on the wire is a varint. For timestamps and IDs that fit in
    // Number.MAX_SAFE_INTEGER, reading as unsigned is fine.
    let result = 0
    let shift = 0
    while (this.pos < this.end) {
      const byte = this.buf[this.pos++]
      if (shift < 49) {
        result += (byte & 0x7f) * 2 ** shift
      }
      if ((byte & 0x80) === 0) return result
      shift += 7
    }
    return result
  }

  readInt32(): number {
    return this.readVarint() | 0
  }

  readBool(): boolean {
    return this.readVarint() !== 0
  }

  readString(): string {
    const len = this.readVarint()
    const str = textDecoder.decode(this.buf.subarray(this.pos, this.pos + len))
    this.pos += len
    return str
  }

  readBytes(): Uint8Array {
    const len = this.readVarint()
    const bytes = this.buf.subarray(this.pos, this.pos + len)
    this.pos += len
    return bytes
  }

  /** Create a sub-reader for an embedded message. */
  subReader(): ProtobufReader {
    const len = this.readVarint()
    const reader = new ProtobufReader(this.buf, this.pos, len)
    this.pos += len
    return reader
  }

  /** Read tag: returns [fieldNumber, wireType]. */
  readTag(): [number, number] {
    const tag = this.readVarint()
    return [tag >>> 3, tag & 0x07]
  }

  /** Skip a field by wire type. */
  skip(wireType: number): void {
    switch (wireType) {
      case 0: // varint
        while (this.pos < this.end && (this.buf[this.pos++] & 0x80) !== 0) {}
        break
      case 1: // fixed 64-bit
        this.pos += 8
        break
      case 2: {
        // length-delimited
        const len = this.readVarint()
        this.pos += len
        break
      }
      case 5: // fixed 32-bit
        this.pos += 4
        break
    }
  }
}

// ── Message types ────────────────────────────────────────────────────

export type MexcKline = {
  interval: string
  windowStart: number // seconds
  openingPrice: string
  closingPrice: string
  highestPrice: string
  lowestPrice: string
  volume: string
  amount: string
  windowEnd: number // seconds
}

export type MexcMiniTicker = {
  symbol: string
  price: string
  rate: string
  high: string
  low: string
  volume: string
  quantity: string
}

export type MexcDepthItem = {
  price: string
  quantity: string
}

export type MexcLimitDepths = {
  asks: Array<MexcDepthItem>
  bids: Array<MexcDepthItem>
}

export type MexcPrivateOrder = {
  id: string
  clientId: string
  price: string
  quantity: string
  amount: string
  avgPrice: string
  orderType: number // 1=LIMIT, 2=MARKET, etc.
  tradeType: number // 1=BUY, 2=SELL
  remainQuantity: string
  cumulativeQuantity: string
  cumulativeAmount: string
  status: number // 1=NEW, 2=FILLED, 3=PARTIALLY_FILLED, 4=CANCELED, 5=PARTIALLY_CANCELED
  createTime: number // ms
}

export type MexcPrivateAccount = {
  vcoinName: string
  balanceAmount: string
  frozenAmount: string
}

export type MexcPrivateDeal = {
  orderId: string
  feeAmount: string
  feeCurrency: string
  tradeType: number
}

export type MexcPushMessage =
  | { type: 'kline'; channel: string; symbol: string; data: MexcKline }
  | {
      type: 'miniTicker'
      channel: string
      symbol: string
      data: MexcMiniTicker
    }
  | {
      type: 'limitDepths'
      channel: string
      symbol: string
      data: MexcLimitDepths
    }
  | { type: 'privateOrder'; channel: string; data: MexcPrivateOrder }
  | { type: 'privateAccount'; channel: string; data: MexcPrivateAccount }
  | { type: 'privateDeal'; channel: string; data: MexcPrivateDeal }
  | { type: 'unknown'; channel: string }

// ── Message decoders ─────────────────────────────────────────────────

function decodeKline(reader: ProtobufReader): MexcKline {
  const msg: MexcKline = {
    interval: '',
    windowStart: 0,
    openingPrice: '',
    closingPrice: '',
    highestPrice: '',
    lowestPrice: '',
    volume: '',
    amount: '',
    windowEnd: 0,
  }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        msg.interval = reader.readString()
        break
      case 2:
        msg.windowStart = reader.readInt64()
        break
      case 3:
        msg.openingPrice = reader.readString()
        break
      case 4:
        msg.closingPrice = reader.readString()
        break
      case 5:
        msg.highestPrice = reader.readString()
        break
      case 6:
        msg.lowestPrice = reader.readString()
        break
      case 7:
        msg.volume = reader.readString()
        break
      case 8:
        msg.amount = reader.readString()
        break
      case 9:
        msg.windowEnd = reader.readInt64()
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

function decodeMiniTicker(reader: ProtobufReader): MexcMiniTicker {
  const msg: MexcMiniTicker = {
    symbol: '',
    price: '',
    rate: '',
    high: '',
    low: '',
    volume: '',
    quantity: '',
  }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        msg.symbol = reader.readString()
        break
      case 2:
        msg.price = reader.readString()
        break
      case 3:
        msg.rate = reader.readString()
        break
      case 5:
        msg.high = reader.readString()
        break
      case 6:
        msg.low = reader.readString()
        break
      case 7:
        msg.volume = reader.readString()
        break
      case 8:
        msg.quantity = reader.readString()
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

function decodeDepthItem(reader: ProtobufReader): MexcDepthItem {
  let price = ''
  let quantity = ''
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        price = reader.readString()
        break
      case 2:
        quantity = reader.readString()
        break
      default:
        reader.skip(wire)
    }
  }
  return { price, quantity }
}

function decodeLimitDepths(reader: ProtobufReader): MexcLimitDepths {
  const msg: MexcLimitDepths = { asks: [], bids: [] }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        msg.asks.push(decodeDepthItem(reader.subReader()))
        break
      case 2:
        msg.bids.push(decodeDepthItem(reader.subReader()))
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

function decodePrivateOrder(reader: ProtobufReader): MexcPrivateOrder {
  const msg: MexcPrivateOrder = {
    id: '',
    clientId: '',
    price: '',
    quantity: '',
    amount: '',
    avgPrice: '',
    orderType: 0,
    tradeType: 0,
    remainQuantity: '',
    cumulativeQuantity: '',
    cumulativeAmount: '',
    status: 0,
    createTime: 0,
  }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        msg.id = reader.readString()
        break
      case 2:
        msg.clientId = reader.readString()
        break
      case 3:
        msg.price = reader.readString()
        break
      case 4:
        msg.quantity = reader.readString()
        break
      case 5:
        msg.amount = reader.readString()
        break
      case 6:
        msg.avgPrice = reader.readString()
        break
      case 7:
        msg.orderType = reader.readInt32()
        break
      case 8:
        msg.tradeType = reader.readInt32()
        break
      case 11:
        msg.remainQuantity = reader.readString()
        break
      case 13:
        msg.cumulativeQuantity = reader.readString()
        break
      case 14:
        msg.cumulativeAmount = reader.readString()
        break
      case 15:
        msg.status = reader.readInt32()
        break
      case 16:
        msg.createTime = reader.readInt64()
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

function decodePrivateAccount(reader: ProtobufReader): MexcPrivateAccount {
  const msg: MexcPrivateAccount = {
    vcoinName: '',
    balanceAmount: '',
    frozenAmount: '',
  }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1:
        msg.vcoinName = reader.readString()
        break
      case 3:
        msg.balanceAmount = reader.readString()
        break
      case 5:
        msg.frozenAmount = reader.readString()
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

function decodePrivateDeal(reader: ProtobufReader): MexcPrivateDeal {
  const msg: MexcPrivateDeal = {
    orderId: '',
    feeAmount: '',
    feeCurrency: '',
    tradeType: 0,
  }
  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 4:
        msg.tradeType = reader.readInt32()
        break
      case 9:
        msg.orderId = reader.readString()
        break
      case 10:
        msg.feeAmount = reader.readString()
        break
      case 11:
        msg.feeCurrency = reader.readString()
        break
      default:
        reader.skip(wire)
    }
  }
  return msg
}

// ── Top-level wrapper decoder ────────────────────────────────────────

/**
 * Decode a MEXC WebSocket binary frame (PushDataV3ApiWrapper).
 * Returns null for non-binary or unparseable data.
 */
export function decodeMexcPush(
  data: ArrayBuffer | Uint8Array,
): MexcPushMessage | null {
  const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  if (buf.length === 0) return null

  const reader = new ProtobufReader(buf)
  let channel = ''
  let symbol = ''
  let result: MexcPushMessage | null = null

  while (reader.hasMore()) {
    const [field, wire] = reader.readTag()
    switch (field) {
      case 1: // channel
        channel = reader.readString()
        break
      case 3: // symbol
        symbol = reader.readString()
        break
      case 4: // symbolId — skip
        reader.skip(wire)
        break
      case 5: // createTime — skip
      case 6: // sendTime — skip
        reader.skip(wire)
        break

      // oneof body — field numbers 301-315
      case 308: // publicSpotKline
        result = {
          type: 'kline',
          channel,
          symbol,
          data: decodeKline(reader.subReader()),
        }
        break
      case 309: // publicMiniTicker
        result = {
          type: 'miniTicker',
          channel,
          symbol,
          data: decodeMiniTicker(reader.subReader()),
        }
        break
      case 303: // publicLimitDepths
        result = {
          type: 'limitDepths',
          channel,
          symbol,
          data: decodeLimitDepths(reader.subReader()),
        }
        break
      case 304: // privateOrders
        result = {
          type: 'privateOrder',
          channel,
          data: decodePrivateOrder(reader.subReader()),
        }
        break
      case 307: // privateAccount
        result = {
          type: 'privateAccount',
          channel,
          data: decodePrivateAccount(reader.subReader()),
        }
        break
      case 306: // privateDeals
        result = {
          type: 'privateDeal',
          channel,
          data: decodePrivateDeal(reader.subReader()),
        }
        break

      default:
        reader.skip(wire)
    }
  }

  // Fill in symbol from channel if not set in wrapper
  if (result && 'symbol' in result && !result.symbol && channel) {
    // Extract symbol from channel string.
    // Format: spot@public.kline.v3.api.pb@BTCUSDT@Min1
    // Symbol is always an uppercase alphanumeric token (pair like BTCUSDT).
    const parts = channel.split('@')
    for (const part of parts) {
      if (/^[A-Z0-9]{4,}$/.test(part)) {
        result.symbol = part
        break
      }
    }
  }

  return result ?? { type: 'unknown', channel }
}
