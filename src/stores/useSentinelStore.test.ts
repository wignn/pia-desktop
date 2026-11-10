import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { evaluateSentinelConfluence, useSentinelStore } from './useSentinelStore'
import { AiMcpEngine } from '../services/ai-mcp-engine'
import { useMarketStore } from './useMarketStore'
import { useAiAgentStore } from './useAiAgentStore'
import { IntelligencePanel } from '../components/panels/IntelligencePanel'

describe('Autonomous Sentinel (useSentinelStore & evaluateSentinelConfluence)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSentinelStore.setState({
      enabled: false,
      cooldownMs: 15 * 60 * 1000,
      minScore: 70,
      alerts: [],
      lastAlertBySymbol: {}
    })
  })

  it('scores a high-confluence LONG setup >= 70 across the 4 pillars', () => {
    const res = evaluateSentinelConfluence({
      symbol: 'XAUUSD',
      timeframe: '15m',
      price: 2765,
      rsi14: 60,
      atr14: 14,
      ema20: 2755,
      ema50: 2740,
      trendDirection: 'BULLISH',
      riskRewardRatio: 2.1,
      orderbookImbalance: 1.35,
      kronosBias: 'BULLISH',
      historicalWinRate: 68,
      historicalSampleCount: 5
    })

    expect(res.triggered).toBe(true)
    expect(res.bias).toBe('LONG')
    expect(res.score).toBeGreaterThanOrEqual(90)
    expect(res.reasons.some((r) => r.includes('EMA20 > EMA50'))).toBe(true)
    expect(res.reasons.some((r) => r.includes('RSI'))).toBe(true)
  })

  it('penalizes overbought exhaustion (RSI >= 75) on LONG and prevents false trigger', () => {
    const res = evaluateSentinelConfluence({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      price: 68000,
      rsi14: 79,
      atr14: 450,
      ema20: 67500,
      ema50: 67000,
      trendDirection: 'BULLISH',
      riskRewardRatio: 1.4,
      orderbookImbalance: 1.0,
      kronosBias: 'NEUTRAL'
    })

    expect(res.triggered).toBe(false)
    expect(res.score).toBeLessThan(70)
  })

  it('returns NEUTRAL with score 0 when trend is NEUTRAL and RSI is mid-range', () => {
    const res = evaluateSentinelConfluence({
      symbol: 'EURUSD',
      timeframe: '15m',
      price: 1.085,
      rsi14: 50,
      atr14: 0.002,
      ema20: 1.085,
      ema50: 1.085,
      trendDirection: 'NEUTRAL'
    })

    expect(res.triggered).toBe(false)
    expect(res.bias).toBe('NEUTRAL')
    expect(res.score).toBe(0)
  })

  it('scans a symbol, records an alert on high confluence, and enforces per-symbol cooldown', async () => {
    vi.spyOn(AiMcpEngine, 'computeTechnicalAnalysis').mockResolvedValue({
      symbol: 'XAUUSD',
      timeframe: '15m',
      currentPrice: 2765,
      trend: 'bullish',
      indicators: {
        rsi14: 58,
        atr14: 15,
        ema20: 2755,
        ema50: 2740
      },
      tradePlan: { bias: 'LONG', riskRewardRatio: '1:2.20' }
    } as any)
    vi.spyOn(AiMcpEngine, 'getKronosForecast').mockResolvedValue({
      bias: 'BULLISH'
    } as any)
    vi.spyOn(AiMcpEngine, 'getMarketSnapshot').mockResolvedValue({
      orderbook: { imbalanceRatio: 1.3 }
    } as any)
    vi.spyOn(AiMcpEngine, 'searchSimilarMarketRegimes').mockResolvedValue({
      analogueStats: { closedTradeCount: 4, historicalWinRate: 75 }
    } as any)

    const firstAlert = await useSentinelStore.getState().scanSymbol('xauusd')
    expect(firstAlert).not.toBeNull()
    expect(firstAlert?.symbol).toBe('XAUUSD')
    expect(firstAlert?.bias).toBe('LONG')
    expect(useSentinelStore.getState().alerts).toHaveLength(1)

    // Immediate second scan for the same symbol should be blocked by cooldown
    const secondAlert = await useSentinelStore.getState().scanSymbol('XAUUSD')
    expect(secondAlert).toBeNull()
    expect(useSentinelStore.getState().alerts).toHaveLength(1)
  })

  it('triggers 1-click Committee handoff by switching symbol, enabling committeeMode, dismissing alert, and calling sendMessage', async () => {
    const setSymbolSpy = vi.fn()
    useMarketStore.setState({ symbol: 'EURUSD', setSymbol: setSymbolSpy } as any)

    const setCommitteeModeSpy = vi.fn()
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined)
    useAiAgentStore.setState({
      isBusy: false,
      committeeMode: false,
      setCommitteeMode: setCommitteeModeSpy,
      sendMessage: sendMessageSpy
    } as any)

    useSentinelStore.setState({
      alerts: [
        {
          id: 'sentinel-1',
          symbol: 'XAUUSD',
          timeframe: '15m',
          bias: 'LONG',
          score: 85,
          price: 2765,
          reasons: ['EMA20 > EMA50 bullish structure', 'RSI bullish momentum sweet-spot'],
          createdAt: Date.now(),
          dismissed: false
        }
      ]
    })

    await useSentinelStore.getState().triggerCommitteeHandoff('sentinel-1')

    expect(setSymbolSpy).toHaveBeenCalledWith('XAUUSD')
    expect(setCommitteeModeSpy).toHaveBeenCalledWith(true)
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sentinel High-Confluence Alert'),
      'XAUUSD'
    )
    expect(useSentinelStore.getState().alerts[0].dismissed).toBe(true)
  })

  it('does not dismiss alert or dispatch sendMessage when AI agent is already busy', async () => {
    const sendMessageSpy = vi.fn()
    useAiAgentStore.setState({
      isBusy: true,
      sendMessage: sendMessageSpy
    } as any)

    useSentinelStore.setState({
      alerts: [
        {
          id: 'sentinel-busy-1',
          symbol: 'XAUUSD',
          timeframe: '15m',
          bias: 'SHORT',
          score: 80,
          price: 2710,
          reasons: ['EMA20 < EMA50 bearish structure'],
          createdAt: Date.now(),
          dismissed: false
        }
      ]
    })

    await useSentinelStore.getState().triggerCommitteeHandoff('sentinel-busy-1')
    expect(sendMessageSpy).not.toHaveBeenCalled()
    expect(useSentinelStore.getState().alerts[0].dismissed).toBe(false)
  })

  it('renders Sentinel header toggle and active Sentinel confluence alert banner with Run Committee button in IntelligencePanel', () => {
    useMarketStore.setState({ symbol: 'XAUUSD' } as any)
    useSentinelStore.setState({
      enabled: true,
      alerts: [
        {
          id: 'sentinel-ui-1',
          symbol: 'XAUUSD',
          timeframe: '15m',
          bias: 'LONG',
          score: 88,
          price: 2765.5,
          reasons: ['EMA20 > EMA50 bullish structure', 'Kronos forecast aligned (BULLISH)'],
          createdAt: Date.now(),
          dismissed: false
        }
      ]
    })

    const html = renderToStaticMarkup(React.createElement(IntelligencePanel))
    expect(html).toContain('Sentinel')
    expect(html).toContain('Sentinel confluence alerts')
    expect(html).toContain('88/100')
    expect(html).toContain('EMA20 &gt; EMA50 bullish structure')
    expect(html).toContain('Run Committee')
    expect(html).toContain('Dismiss')
  })
})
