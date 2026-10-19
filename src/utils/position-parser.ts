import type { PaperPosition } from '@shared/types'

export interface ParsedPositionCandidate {
  symbol: string
  side: 'buy' | 'sell'
  size: number
  entryPrice: number
  price: number
  stopLoss?: number
  takeProfit?: number
  accountType?: 'standard' | 'cent'
  lotType?: 'standard' | 'cent'
  ticket?: string
  comment?: string
  source?: 'manual' | 'import'
}

export interface ParsePositionsResult {
  positions: ParsedPositionCandidate[]
  errors: string[]
  totalParsed: number
}

// ponytail: basic header keyword heuristic covers tabular CSV and TSV trade reports; upgrade to full fuzzy Levenshtein header matching if non-English headers are needed
const HEADER_KEYWORDS = ['symbol', 'ticket', 'lots', 'volume', 'price', 's/l', 't/p', 'accounttype', 'open price']

function isHeaderRow(line: string): boolean {
  const lower = line.toLowerCase()
  const matched = HEADER_KEYWORDS.filter(k => lower.includes(k))
  const hasDecimalPrice = /\b\d+\.\d+\b/.test(line)
  return matched.length >= 2 && !hasDecimalPrice
}

function parseHeaderRow(line: string): Record<string, number> | null {
  const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : line.includes(';') ? ';' : null
  if (!delimiter) return null

  const cols = line.split(delimiter).map(c => c.trim().toLowerCase().replace(/^["']|["']$/g, ''))
  const map: Record<string, number> = {}

  cols.forEach((col, idx) => {
    if (col === 'ticket' || col === 'position' || col === 'order' || col === 'id') {
      map['ticket'] = idx
    } else if (col === 'symbol' || col === 'item' || col === 'pair' || col === 'asset') {
      map['symbol'] = idx
    } else if (col === 'side' || col === 'type' || col === 'action' || col === 'direction') {
      map['side'] = idx
    } else if (col === 'lots' || col === 'size' || col === 'volume' || col === 'qty' || col === 'quantity') {
      map['size'] = idx
    } else if (col === 'entryprice' || col === 'price' || col === 'openprice' || col === 'open price' || col === 'open') {
      map['entryPrice'] = idx
    } else if (col === 'stoploss' || col === 'sl' || col === 's/l' || col === 'stop loss') {
      map['stopLoss'] = idx
    } else if (col === 'takeprofit' || col === 'tp' || col === 't/p' || col === 'take profit') {
      map['takeProfit'] = idx
    } else if (col === 'accounttype' || col === 'account type' || col === 'account') {
      map['accountType'] = idx
    }
  })

  if (map['symbol'] !== undefined && (map['side'] !== undefined || map['size'] !== undefined || map['entryPrice'] !== undefined)) {
    return map
  }
  return null
}

function parseShorthandLine(
  line: string,
  defaultAccountType: 'standard' | 'cent'
): ParsedPositionCandidate | null {
  const atMatch = line.match(/@\s*([0-9]+(?:\.[0-9]+)?)/i)
  if (!atMatch) return null

  const entryPrice = parseFloat(atMatch[1])
  if (!entryPrice || entryPrice <= 0 || isNaN(entryPrice)) return null

  const slMatch = line.match(/\b(?:SL|S\/L)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i)
  const tpMatch = line.match(/\b(?:TP|T\/P)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i)

  const stopLossVal = slMatch ? parseFloat(slMatch[1]) : undefined
  const takeProfitVal = tpMatch ? parseFloat(tpMatch[1]) : undefined
  const stopLoss = stopLossVal && stopLossVal > 0 ? stopLossVal : undefined
  const takeProfit = takeProfitVal && takeProfitVal > 0 ? takeProfitVal : undefined

  let accType: 'standard' | 'cent' = defaultAccountType
  if (/\bcent\b/i.test(line)) {
    accType = 'cent'
  } else if (/\bstandard\b/i.test(line)) {
    accType = 'standard'
  }

  const ticketMatch = line.match(/#([0-9A-Za-z]+)/)
  const ticket = ticketMatch ? ticketMatch[1] : undefined

  const beforeAt = line.substring(0, line.indexOf('@')).trim()
  const sideMatch = beforeAt.match(/\b(BUY|SELL|LONG|SHORT)\b/i)
  if (!sideMatch) return null

  const rawSide = sideMatch[1].toUpperCase()
  const side: 'buy' | 'sell' = rawSide === 'BUY' || rawSide === 'LONG' ? 'buy' : 'sell'

  const remainingTokens = beforeAt
    .replace(new RegExp(`\\b${sideMatch[1]}\\b`, 'i'), ' ')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)

  let size: number | undefined
  let symbol: string | undefined

  for (const token of remainingTokens) {
    const num = parseFloat(token)
    if (!isNaN(num) && num > 0 && size === undefined) {
      size = num
    } else if (/^[A-Za-z][A-Za-z0-9._/-]*$/.test(token) && !symbol) {
      symbol = token.toUpperCase()
    }
  }

  if (!symbol || size === undefined || size <= 0) return null

  return {
    symbol,
    side,
    size,
    entryPrice,
    price: entryPrice,
    stopLoss,
    takeProfit,
    ticket,
    accountType: accType,
    lotType: accType,
    source: 'import'
  }
}

function parseFreeformTokens(
  rawTokens: string[],
  defaultAccountType: 'standard' | 'cent'
): ParsedPositionCandidate | null {
  const tokens = rawTokens
    .map(t => t.trim().replace(/^["']|["']$/g, ''))
    .filter(t => t.length > 0)

  if (tokens.length < 3) return null

  let side: 'buy' | 'sell' | undefined
  let sideIdx = -1

  for (let i = 0; i < tokens.length; i++) {
    const upper = tokens[i].toUpperCase()
    if (upper === 'BUY' || upper === 'LONG') {
      side = 'buy'
      sideIdx = i
      break
    } else if (upper === 'SELL' || upper === 'SHORT') {
      side = 'sell'
      sideIdx = i
      break
    }
  }

  if (!side || sideIdx === -1) return null

  let accountType: 'standard' | 'cent' = defaultAccountType
  const filteredTokens: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    if (i === sideIdx) continue
    const lower = tokens[i].toLowerCase()
    if (lower === 'cent') {
      accountType = 'cent'
    } else if (lower === 'standard') {
      accountType = 'standard'
    } else {
      filteredTokens.push(tokens[i])
    }
  }

  let ticket: string | undefined
  let symbol: string | undefined
  const numericTokens: number[] = []

  for (let i = 0; i < filteredTokens.length; i++) {
    const t = filteredTokens[i]

    // Skip date or time tokens (must have 2 date separators e.g. YYYY-MM-DD or time with colon)
    if (
      /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(t) ||
      /^\d{1,2}:\d{2}(?::\d{2})?$/.test(t) ||
      /\d{4}-\d{2}-\d{2}T/.test(t)
    ) {
      continue
    }

    if (t.startsWith('#')) {
      ticket = t.replace(/^#/, '')
      continue
    }

    // Treat dash or 0 as null placeholder for SL/TP
    if (t === '-' || t === '--' || t === 'null') {
      numericTokens.push(0)
      continue
    }

    const num = parseFloat(t.replace(/,/g, ''))
    const isPureIntTicket = /^\d{4,}$/.test(t) && i === 0 && !ticket && !symbol

    if (isPureIntTicket) {
      ticket = t
    } else if (!isNaN(num)) {
      numericTokens.push(num)
    } else if (/^[A-Za-z][A-Za-z0-9._/-]*$/.test(t) && !symbol) {
      symbol = t.toUpperCase()
    }
  }

  if (!symbol || numericTokens.length < 2) return null

  const size = numericTokens[0]
  const entryPrice = numericTokens[1]
  const rawSL = numericTokens[2]
  const rawTP = numericTokens[3]

  if (size <= 0 || entryPrice <= 0) return null

  const stopLoss = rawSL && rawSL > 0 ? rawSL : undefined
  const takeProfit = rawTP && rawTP > 0 ? rawTP : undefined

  return {
    symbol,
    side,
    size,
    entryPrice,
    price: entryPrice,
    stopLoss,
    takeProfit,
    ticket,
    accountType,
    lotType: accountType,
    source: 'import'
  }
}

function parseMappedRow(
  cols: string[],
  map: Record<string, number>,
  defaultAccountType: 'standard' | 'cent'
): ParsedPositionCandidate | null {
  const getCol = (key: string): string => {
    const idx = map[key]
    return idx !== undefined && cols[idx] !== undefined ? cols[idx].trim().replace(/^["']|["']$/g, '') : ''
  }

  const rawSymbol = getCol('symbol')
  const rawSide = getCol('side').toUpperCase()
  const rawSize = parseFloat(getCol('size'))
  const rawPrice = parseFloat(getCol('entryPrice'))
  const rawSL = parseFloat(getCol('stopLoss'))
  const rawTP = parseFloat(getCol('takeProfit'))
  const rawTicket = getCol('ticket')
  const rawAcc = getCol('accountType').toLowerCase()

  if (!rawSymbol || !rawSide || isNaN(rawSize) || isNaN(rawPrice) || rawSize <= 0 || rawPrice <= 0) {
    return null
  }

  const side: 'buy' | 'sell' = rawSide === 'BUY' || rawSide === 'LONG' ? 'buy' : rawSide === 'SELL' || rawSide === 'SHORT' ? 'sell' : 'buy'
  const accountType: 'standard' | 'cent' = rawAcc === 'cent' ? 'cent' : rawAcc === 'standard' ? 'standard' : defaultAccountType
  const stopLoss = !isNaN(rawSL) && rawSL > 0 ? rawSL : undefined
  const takeProfit = !isNaN(rawTP) && rawTP > 0 ? rawTP : undefined
  const ticket = rawTicket && rawTicket.length > 0 ? rawTicket : undefined

  return {
    symbol: rawSymbol.toUpperCase(),
    side,
    size: rawSize,
    entryPrice: rawPrice,
    price: rawPrice,
    stopLoss,
    takeProfit,
    ticket,
    accountType,
    lotType: accountType,
    source: 'import'
  }
}

export function parsePositionText(
  text: string,
  defaultAccountType: 'standard' | 'cent' = 'standard'
): ParsePositionsResult {
  const positions: ParsedPositionCandidate[] = []
  const errors: string[] = []

  if (!text || !text.trim()) {
    return { positions, errors, totalParsed: 0 }
  }

  const lines = text.split(/\r?\n/)
  let csvHeaderMap: Record<string, number> | null = null

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    if (!trimmed) continue

    // Skip comment lines
    if (trimmed.startsWith('//') || (trimmed.startsWith('#') && !/^#\d+/.test(trimmed))) {
      continue
    }

    // Skip header rows and capture column mappings if delimited
    if (isHeaderRow(trimmed)) {
      const headerMap = parseHeaderRow(trimmed)
      if (headerMap) {
        csvHeaderMap = headerMap
      }
      continue
    }

    let parsed: ParsedPositionCandidate | null = null

    // 1. Shorthand pattern (@ price)
    if (trimmed.includes('@')) {
      parsed = parseShorthandLine(trimmed, defaultAccountType)
    }

    // 2. Delimited with known header mapping
    if (!parsed && csvHeaderMap) {
      const delimiter = trimmed.includes('\t') ? '\t' : trimmed.includes(',') ? ',' : trimmed.includes(';') ? ';' : null
      if (delimiter) {
        const cols = trimmed.split(delimiter)
        parsed = parseMappedRow(cols, csvHeaderMap, defaultAccountType)
      }
    }

    // 3. Fallback to freeform token analysis (comma, tab, semicolon, or space-separated)
    if (!parsed) {
      let tokens: string[] = []
      if (trimmed.includes('\t')) {
        tokens = trimmed.split('\t')
      } else if (trimmed.includes(',')) {
        tokens = trimmed.split(',')
      } else if (trimmed.includes(';')) {
        tokens = trimmed.split(';')
      } else {
        tokens = trimmed.split(/\s+/)
      }

      parsed = parseFreeformTokens(tokens, defaultAccountType)
    }

    if (parsed) {
      positions.push(parsed)
    } else {
      errors.push(`Line ${lineNum}: Unable to parse trade position from "${trimmed}"`)
    }
  }

  return {
    positions,
    errors,
    totalParsed: positions.length
  }
}

export function exportPositionsToCsv(
  positions: PaperPosition[],
  accountType: 'standard' | 'cent' = 'standard'
): string {
  const header = 'Ticket,Symbol,Side,Lots,AccountType,EntryPrice,StopLoss,TakeProfit,OpenTime'
  const rows = positions.map(pos => {
    const ticket = pos.ticket ?? ''
    const symbol = pos.symbol.toUpperCase()
    const side = pos.side.toUpperCase()
    const lots = pos.size
    const accType = pos.accountType ?? accountType
    const entryPrice = pos.entryPrice
    const stopLoss = pos.stopLoss != null && pos.stopLoss > 0 ? pos.stopLoss : ''
    const takeProfit = pos.takeProfit != null && pos.takeProfit > 0 ? pos.takeProfit : ''
    const openTime = pos.timestamp ? new Date(pos.timestamp).toISOString() : new Date().toISOString()

    return [ticket, symbol, side, lots, accType, entryPrice, stopLoss, takeProfit, openTime].join(',')
  })

  return [header, ...rows].join('\n')
}
