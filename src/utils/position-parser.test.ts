import { describe, expect, it } from 'vitest'
import {
  parsePositionText,
  exportPositionsToCsv,
  type ParsePositionsResult
} from './position-parser'
import type { PaperPosition } from '@shared/types'

describe('position-parser', () => {
  describe('parsePositionText', () => {
    it('parses space-delimited table format with ticket and SL/TP', () => {
      const input = '1048291 EURUSD BUY 0.50 1.12250 1.12000 1.12600'
      const result: ParsePositionsResult = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(1)
      expect(result.positions).toHaveLength(1)
      expect(result.positions[0]).toEqual({
        ticket: '1048291',
        symbol: 'EURUSD',
        side: 'buy',
        size: 0.5,
        entryPrice: 1.1225,
        price: 1.1225,
        stopLoss: 1.12,
        takeProfit: 1.126,
        accountType: 'standard',
        lotType: 'standard',
        source: 'import'
      })
    })

    it('parses comma-delimited table format without ticket', () => {
      const input = 'XAUUSD,SELL,0.10,4180.50,4200.00,4150.00'
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(1)
      expect(result.positions[0]).toEqual({
        ticket: undefined,
        symbol: 'XAUUSD',
        side: 'sell',
        size: 0.1,
        entryPrice: 4180.5,
        price: 4180.5,
        stopLoss: 4200,
        takeProfit: 4150,
        accountType: 'standard',
        lotType: 'standard',
        source: 'import'
      })
    })

    it('parses tab-delimited table lines', () => {
      const input = '987654\tGBPUSD\tBUY\t0.20\t1.25000\t1.24500\t1.26000'
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(1)
      expect(result.positions[0]?.symbol).toBe('GBPUSD')
      expect(result.positions[0]?.side).toBe('buy')
      expect(result.positions[0]?.size).toBe(0.2)
      expect(result.positions[0]?.entryPrice).toBe(1.25)
      expect(result.positions[0]?.ticket).toBe('987654')
    })

    it('parses shorthand formats with @ price and SL/TP keywords', () => {
      const input = `
        BUY 0.25 BTCUSDT @ 82500 SL 81000 TP 85000
        EURUSD BUY 0.10 @ 1.12350
        SELL 0.05 ETHUSDT @ 3100.50 SL: 3200 TP: 2900
        LONG 1.0 SOLUSDT @ 150
        SHORT 2.5 DOGEUSDT @ 0.15
      `
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(5)

      // BUY 0.25 BTCUSDT @ 82500 SL 81000 TP 85000
      expect(result.positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        side: 'buy',
        size: 0.25,
        entryPrice: 82500,
        stopLoss: 81000,
        takeProfit: 85000
      })

      // EURUSD BUY 0.10 @ 1.12350
      expect(result.positions[1]).toMatchObject({
        symbol: 'EURUSD',
        side: 'buy',
        size: 0.1,
        entryPrice: 1.1235,
        stopLoss: undefined,
        takeProfit: undefined
      })

      // SELL 0.05 ETHUSDT @ 3100.50 SL: 3200 TP: 2900
      expect(result.positions[2]).toMatchObject({
        symbol: 'ETHUSDT',
        side: 'sell',
        size: 0.05,
        entryPrice: 3100.5,
        stopLoss: 3200,
        takeProfit: 2900
      })

      // LONG 1.0 SOLUSDT @ 150
      expect(result.positions[3]).toMatchObject({
        symbol: 'SOLUSDT',
        side: 'buy',
        size: 1.0,
        entryPrice: 150
      })

      // SHORT 2.5 DOGEUSDT @ 0.15
      expect(result.positions[4]).toMatchObject({
        symbol: 'DOGEUSDT',
        side: 'sell',
        size: 2.5,
        entryPrice: 0.15
      })
    })

    it('ignores header rows, comment lines (# or //), and empty/whitespace lines', () => {
      const input = `
        # Report Export
        // Trade snapshot comment
        Ticket,Symbol,Type,Lots,Open Price,S/L,T/P
        Symbol Type Volume Price

        1048291 EURUSD BUY 0.50 1.12250 1.12000 1.12600

        # Another comment
      `
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(1)
      expect(result.positions[0]?.symbol).toBe('EURUSD')
    })

    it('treats 0, 0.00000, and dash (-) as undefined for SL and TP', () => {
      const input = `
        1001 EURUSD BUY 0.10 1.12000 0.00000 0
        1002 GBPUSD SELL 0.20 1.25000 - -
      `
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(2)
      expect(result.positions[0]?.stopLoss).toBeUndefined()
      expect(result.positions[0]?.takeProfit).toBeUndefined()
      expect(result.positions[1]?.stopLoss).toBeUndefined()
      expect(result.positions[1]?.takeProfit).toBeUndefined()
    })

    it('respects defaultAccountType and infers accountType from token', () => {
      const centResult = parsePositionText('1048291 EURUSD BUY 0.50 1.12250', 'cent')
      expect(centResult.positions[0]?.accountType).toBe('cent')
      expect(centResult.positions[0]?.lotType).toBe('cent')

      const explicitCent = parsePositionText('1048291 EURUSD BUY 0.50 1.12250 cent', 'standard')
      expect(explicitCent.positions[0]?.accountType).toBe('cent')

      const explicitStandard = parsePositionText('1048291 EURUSD BUY 0.50 1.12250 standard', 'cent')
      expect(explicitStandard.positions[0]?.accountType).toBe('standard')
    })

    it('records meaningful errors for invalid lines without crashing or losing valid lines', () => {
      const input = `
        EURUSD BUY 0.10 1.12000
        This is an invalid line that cannot be parsed
        BTCUSDT SELL -0.50 82000
        1048292 GBPUSD SELL 0.20 1.25000
        AUDUSD BUY 0.10 -1.05
      `
      const result = parsePositionText(input)

      expect(result.totalParsed).toBe(2)
      expect(result.positions).toHaveLength(2)
      expect(result.positions[0]?.symbol).toBe('EURUSD')
      expect(result.positions[1]?.symbol).toBe('GBPUSD')
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })

    it('handles empty input and whitespace-only input gracefully', () => {
      expect(parsePositionText('')).toEqual({ positions: [], errors: [], totalParsed: 0 })
      expect(parsePositionText('   \n\r\n\t  ')).toEqual({ positions: [], errors: [], totalParsed: 0 })
    })

    it('handles CRLF line endings and quoted CSV cells', () => {
      const input = 'Ticket,Symbol,Side,Lots,AccountType,EntryPrice,StopLoss,TakeProfit,OpenTime\r\n"1048291","EURUSD.pro","BUY","0.50","standard","1.1225","1.1200","1.1260","2026-10-19T09:00:00.000Z"\r\n'
      const result = parsePositionText(input)

      expect(result.errors).toHaveLength(0)
      expect(result.totalParsed).toBe(1)
      expect(result.positions[0]).toMatchObject({
        ticket: '1048291',
        symbol: 'EURUSD.PRO',
        side: 'buy',
        size: 0.5,
        entryPrice: 1.1225,
        stopLoss: 1.12,
        takeProfit: 1.126,
        accountType: 'standard'
      })
    })
  })

  describe('exportPositionsToCsv', () => {
    it('generates properly formatted CSV with headers and position rows', () => {
      const mockPositions: PaperPosition[] = [
        {
          id: 'pos_1',
          ticket: '1048291',
          symbol: 'EURUSD',
          side: 'buy',
          size: 0.5,
          entryPrice: 1.1225,
          stopLoss: 1.12,
          takeProfit: 1.126,
          accountType: 'standard',
          timestamp: 1776592800000
        },
        {
          id: 'pos_2',
          symbol: 'XAUUSD',
          side: 'sell',
          size: 0.1,
          entryPrice: 4180.5,
          accountType: 'cent',
          timestamp: 1776592900000
        }
      ]

      const csv = exportPositionsToCsv(mockPositions, 'standard')
      const lines = csv.trim().split(/\r?\n/)

      expect(lines[0]).toBe('Ticket,Symbol,Side,Lots,AccountType,EntryPrice,StopLoss,TakeProfit,OpenTime')
      expect(lines[1]).toBe(`1048291,EURUSD,BUY,0.5,standard,1.1225,1.12,1.126,${new Date(1776592800000).toISOString()}`)
      expect(lines[2]).toBe(`,XAUUSD,SELL,0.1,cent,4180.5,,,${new Date(1776592900000).toISOString()}`)
    })

    it('roundtrips exported CSV through parsePositionText', () => {
      const mockPositions: PaperPosition[] = [
        {
          id: 'pos_1',
          ticket: '1048291',
          symbol: 'EURUSD',
          side: 'buy',
          size: 0.5,
          entryPrice: 1.1225,
          stopLoss: 1.12,
          takeProfit: 1.126,
          accountType: 'standard',
          timestamp: 1776592800000
        },
        {
          id: 'pos_2',
          ticket: '1048292',
          symbol: 'BTCUSDT',
          side: 'sell',
          size: 0.25,
          entryPrice: 82500,
          accountType: 'cent',
          timestamp: 1776592900000
        }
      ]

      const csv = exportPositionsToCsv(mockPositions)
      const parsed = parsePositionText(csv)

      expect(parsed.errors).toHaveLength(0)
      expect(parsed.totalParsed).toBe(2)
      expect(parsed.positions[0]?.symbol).toBe('EURUSD')
      expect(parsed.positions[0]?.side).toBe('buy')
      expect(parsed.positions[0]?.size).toBe(0.5)
      expect(parsed.positions[0]?.entryPrice).toBe(1.1225)
      expect(parsed.positions[0]?.stopLoss).toBe(1.12)
      expect(parsed.positions[0]?.takeProfit).toBe(1.126)
      expect(parsed.positions[0]?.ticket).toBe('1048291')
      expect(parsed.positions[0]?.accountType).toBe('standard')

      expect(parsed.positions[1]?.symbol).toBe('BTCUSDT')
      expect(parsed.positions[1]?.side).toBe('sell')
      expect(parsed.positions[1]?.size).toBe(0.25)
      expect(parsed.positions[1]?.entryPrice).toBe(82500)
      expect(parsed.positions[1]?.ticket).toBe('1048292')
      expect(parsed.positions[1]?.accountType).toBe('cent')
    })
  })
})
