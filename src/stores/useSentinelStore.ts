/**
 * PIA Terminal - Autonomous Sentinel Store (Zustand)
 * Background multi-factor confluence watcher with anti-spam cooldown,
 * native desktop notification + WebAudio chime, and 1-click Committee handoff.
 */

import { create } from 'zustand'
import { AiMcpEngine } from '../services/ai-mcp-engine'
import { useMarketStore } from './useMarketStore'
import { useAiAgentStore } from './useAiAgentStore'

export interface SentinelMarketInput {
  symbol: string
  timeframe: string
  price: number
  rsi14: number
  atr14: number
  ema20: number
  ema50: number
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  riskRewardRatio?: number
  orderbookImbalance?: number
  kronosBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  historicalWinRate?: number | null
  historicalSampleCount?: number
}

export interface SentinelConfluenceResult {
  triggered: boolean
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
  score: number
  reasons: string[]
}

export interface SentinelAlert {
  id: string
  symbol: string
  timeframe: string
  bias: 'LONG' | 'SHORT'
  score: number
  price: number
  reasons: string[]
  createdAt: number
  dismissed: boolean
}

export interface SentinelState {
  enabled: boolean
  cooldownMs: number
  minScore: number
  alerts: SentinelAlert[]
  lastAlertBySymbol: Record<string, number>

  setEnabled: (enabled: boolean) => void
  scanSymbol: (symbol: string) => Promise<SentinelAlert | null>
  dismissAlert: (alertId: string) => void
  clearAlerts: () => void
  triggerCommitteeHandoff: (alertId: string) => Promise<void>
}

const STORAGE_KEY = 'pia_sentinel_enabled'
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes
const DEFAULT_MIN_SCORE = 70
const MAX_ALERTS = 20

const loadInitialEnabled = (): boolean => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    }
  } catch {
    // ignore
  }
  return false
}

export function parseRiskRewardRatio(raw?: string | number | null): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':')
      const reward = Number(parts[parts.length - 1])
      return Number.isFinite(reward) ? reward : 0
    }
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : 0
  }
  return 0
}

export function evaluateSentinelConfluence(
  input: SentinelMarketInput,
  minScore = DEFAULT_MIN_SCORE
): SentinelConfluenceResult {
  const {
    price,
    rsi14,
    atr14,
    ema20,
    ema50,
    trendDirection,
    riskRewardRatio,
    orderbookImbalance,
    kronosBias,
    historicalWinRate,
    historicalSampleCount
  } = input

  let candidateBias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'
  if (trendDirection === 'BULLISH' || (trendDirection === 'NEUTRAL' && rsi14 <= 35)) {
    candidateBias = 'LONG'
  } else if (trendDirection === 'BEARISH' || (trendDirection === 'NEUTRAL' && rsi14 >= 65)) {
    candidateBias = 'SHORT'
  }

  if (candidateBias === 'NEUTRAL') {
    return {
      triggered: false,
      bias: 'NEUTRAL',
      score: 0,
      reasons: ['Neutral structure with mid-range RSI']
    }
  }

  let rawScore = 0
  const reasons: string[] = []

  // Pillar 1: EMA Structure Alignment (25 pts)
  if (candidateBias === 'LONG') {
    if (price > ema20 && ema20 > ema50) {
      rawScore += 25
      reasons.push('EMA20 > EMA50 bullish structure')
    } else if (price > ema20) {
      rawScore += 15
      reasons.push('Price holding above EMA20')
    }
  } else {
    if (price < ema20 && ema20 < ema50) {
      rawScore += 25
      reasons.push('EMA20 < EMA50 bearish structure')
    } else if (price < ema20) {
      rawScore += 15
      reasons.push('Price trading below EMA20')
    }
  }

  // Pillar 2: RSI Momentum / Mean-Reversion (25 pts)
  if (candidateBias === 'LONG') {
    if (rsi14 >= 52 && rsi14 <= 67) {
      rawScore += 25
      reasons.push(`RSI bullish momentum sweet-spot (${rsi14.toFixed(1)})`)
    } else if (rsi14 <= 32) {
      rawScore += 25
      reasons.push(`RSI oversold reversal zone (${rsi14.toFixed(1)})`)
    } else if (rsi14 >= 75) {
      rawScore -= 20
      reasons.push(`RSI overbought exhaustion penalty (${rsi14.toFixed(1)})`)
    }
  } else {
    if (rsi14 >= 33 && rsi14 <= 48) {
      rawScore += 25
      reasons.push(`RSI bearish momentum sweet-spot (${rsi14.toFixed(1)})`)
    } else if (rsi14 >= 68) {
      rawScore += 25
      reasons.push(`RSI overbought rejection zone (${rsi14.toFixed(1)})`)
    } else if (rsi14 <= 25) {
      rawScore -= 20
      reasons.push(`RSI oversold exhaustion penalty (${rsi14.toFixed(1)})`)
    }
  }

  // Pillar 3: Risk/Reward & Volatility Structure (25 pts)
  const rr = riskRewardRatio ?? 0
  if (rr >= 1.8 && atr14 > 0) {
    rawScore += 25
    reasons.push(`Favorable S/R Risk-Reward (${rr.toFixed(2)}R)`)
  } else if (rr >= 1.3 && atr14 > 0) {
    rawScore += 15
    reasons.push(`Acceptable S/R Risk-Reward (${rr.toFixed(2)}R)`)
  }

  // Pillar 4: Kronos / Orderbook / Memory RAG Confirmation (capped at 25 pts)
  let pillar4Score = 0
  if (
    (candidateBias === 'LONG' && kronosBias === 'BULLISH') ||
    (candidateBias === 'SHORT' && kronosBias === 'BEARISH')
  ) {
    pillar4Score += 10
    reasons.push(`Kronos forecast aligned (${kronosBias})`)
  }
  if (
    orderbookImbalance !== undefined &&
    ((candidateBias === 'LONG' && orderbookImbalance >= 1.15) ||
      (candidateBias === 'SHORT' && orderbookImbalance <= 0.85))
  ) {
    pillar4Score += 10
    reasons.push(`Orderbook L2 imbalance confirmation (${orderbookImbalance.toFixed(2)}x)`)
  }
  if (
    (historicalSampleCount ?? 0) >= 3 &&
    historicalWinRate !== undefined &&
    historicalWinRate !== null &&
    historicalWinRate >= 55
  ) {
    pillar4Score += 10
    reasons.push(`Historical RAG win rate ${historicalWinRate.toFixed(1)}%`)
  }
  rawScore += Math.min(25, pillar4Score)

  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  return {
    triggered: score >= minScore,
    bias: candidateBias,
    score,
    reasons
  }
}

function playSentinelChime(): void {
  try {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(784, ctx.currentTime)
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
    osc.onended = () => {
      void ctx.close().catch(() => {})
    }
  } catch {
    // AudioContext blocked or unavailable in test environment
  }
}

function dispatchDesktopNotification(alert: SentinelAlert): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') {
        new window.Notification(`ORCA Sentinel · ${alert.symbol} ${alert.bias} (${alert.score}/100)`, {
          body: alert.reasons.slice(0, 2).join(' · ')
        })
      }
    }
  } catch {
    // Notification API unavailable
  }
}

export const useSentinelStore = create<SentinelState>((set, get) => ({
  enabled: loadInitialEnabled(),
  cooldownMs: DEFAULT_COOLDOWN_MS,
  minScore: DEFAULT_MIN_SCORE,
  alerts: [],
  lastAlertBySymbol: {},

  setEnabled: (enabled) => {
    set({ enabled })
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(enabled))
      }
    } catch {
      // ignore
    }
  },

  scanSymbol: async (rawSymbol) => {
    const cleanSymbol = rawSymbol?.trim().toUpperCase()
    if (!cleanSymbol) return null

    const { cooldownMs, minScore, lastAlertBySymbol } = get()
    const now = Date.now()
    const lastAlertAt = lastAlertBySymbol[cleanSymbol] ?? 0
    if (now - lastAlertAt < cooldownMs) {
      return null
    }

    const timeframe = useMarketStore.getState().timeframe || '15m'

    try {
      const [ta, kronos, snapshot, memory] = await Promise.all([
        AiMcpEngine.computeTechnicalAnalysis(cleanSymbol, timeframe).catch(() => null),
        AiMcpEngine.getKronosForecast(cleanSymbol, timeframe, 6).catch(() => null),
        AiMcpEngine.getMarketSnapshot(cleanSymbol).catch(() => null),
        AiMcpEngine.searchSimilarMarketRegimes(cleanSymbol, 5, true).catch(() => null)
      ])

      if (!ta || !Number.isFinite(ta.currentPrice) || ta.currentPrice <= 0) {
        return null
      }

      const rawTrend =
        typeof ta.trend === 'string'
          ? ta.trend.toUpperCase()
          : (ta.trend as { direction?: string } | undefined)?.direction?.toUpperCase() ?? 'NEUTRAL'
      const trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
        rawTrend === 'BULLISH' ? 'BULLISH' : rawTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL'

      const indicators = ta.indicators ?? ({} as Partial<NonNullable<typeof ta.indicators>>)
      const parsedRR = parseRiskRewardRatio(ta.tradePlan?.riskRewardRatio)

      const evaluation = evaluateSentinelConfluence(
        {
          symbol: cleanSymbol,
          timeframe,
          price: ta.currentPrice,
          rsi14: indicators.rsi14 ?? 50,
          atr14: indicators.atr14 ?? 0,
          ema20: indicators.ema20 ?? ta.currentPrice,
          ema50: indicators.ema50 ?? ta.currentPrice,
          trendDirection,
          riskRewardRatio: parsedRR,
          orderbookImbalance:
            snapshot?.orderbook?.imbalanceRatio ?? ta.orderbookSummary?.imbalanceRatio,
          kronosBias: kronos?.bias,
          historicalWinRate: memory?.analogueStats?.historicalWinRate ?? null,
          historicalSampleCount: memory?.analogueStats?.closedTradeCount ?? 0
        },
        minScore
      )

      if (!evaluation.triggered || evaluation.bias === 'NEUTRAL') {
        return null
      }

      const newAlert: SentinelAlert = {
        id: `sentinel-${cleanSymbol}-${now}`,
        symbol: cleanSymbol,
        timeframe,
        bias: evaluation.bias,
        score: evaluation.score,
        price: ta.currentPrice,
        reasons: evaluation.reasons,
        createdAt: now,
        dismissed: false
      }

      set((state) => ({
        alerts: [newAlert, ...state.alerts].slice(0, MAX_ALERTS),
        lastAlertBySymbol: {
          ...state.lastAlertBySymbol,
          [cleanSymbol]: now
        }
      }))

      playSentinelChime()
      dispatchDesktopNotification(newAlert)
      return newAlert
    } catch {
      return null
    }
  },

  dismissAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a))
    }))
  },

  clearAlerts: () => {
    set({ alerts: [] })
  },

  triggerCommitteeHandoff: async (alertId) => {
    const alert = get().alerts.find((a) => a.id === alertId)
    if (!alert) return

    const agentState = useAiAgentStore.getState()
    if (agentState.isBusy) return

    const marketState = useMarketStore.getState()
    if (marketState.symbol !== alert.symbol) {
      marketState.setSymbol(alert.symbol)
    }

    agentState.setCommitteeMode(true)
    get().dismissAlert(alertId)

    const prompt = `Sentinel High-Confluence Alert on ${alert.symbol} (${alert.timeframe}): ${alert.bias} setup detected (Score ${alert.score}/100 @ ${alert.price}). Confluence factors: ${alert.reasons.join(', ')}. Run full Trading Committee institutional verification and trade plan.`
    await agentState.sendMessage(prompt, alert.symbol)
  }
}))

