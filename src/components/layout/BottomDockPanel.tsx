import React, { useState, useRef } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { usePiaScriptStore } from '../../stores/usePiaScriptStore'
import { PiaScriptEditor } from './PiaScriptEditor'
import { SymbolLogo } from '../common/SymbolLogo'
import { getSymbolPrecision } from '@shared/market-utils'
import { THEME_TOKENS } from '../../theme/tokens'

type BottomTabId = 'screener' | 'pine' | 'strategy' | 'trading'

interface BottomTab {
  id: BottomTabId
  label: string
}

export interface BottomDockPanelProps {
  initialOpen?: boolean
  initialTab?: BottomTabId
  initialTradingSubTab?: 'positions' | 'orders'
}

const TABS: BottomTab[] = [
  { id: 'screener', label: 'Stock Screener' },
  { id: 'pine', label: 'PiaScript' },
  { id: 'strategy', label: 'Strategy Tester' },
  { id: 'trading', label: 'Trading Panel' }
]

export const BottomDockPanel: React.FC<BottomDockPanelProps> = ({
  initialOpen = false,
  initialTab = 'screener',
  initialTradingSubTab = 'positions'
}) => {
  const [activeTab, setActiveTab] = useState<BottomTabId>(initialTab)
  const [tradingSubTab, setTradingSubTab] = useState<'positions' | 'orders'>(initialTradingSubTab)
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [drawerHeight, setDrawerHeight] = useState(260)
  const [screenerFilter, setScreenerFilter] = useState<'all' | 'gainers' | 'losers' | 'volume'>('all')

  const hookSymbols = useMarketStore((state) => state.symbols)
  const symbols = useMarketStore.getState().symbols || hookSymbols
  const hookPrices = useMarketStore((state) => state.prices)
  const prices = useMarketStore.getState().prices || hookPrices
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const hookSymbol = useMarketStore((state) => state.symbol)
  const currentSymbol = useMarketStore.getState().symbol || hookSymbol

  // Paper Trading Store
  const hookAccount = usePaperTradingStore((state) => state.account)
  const account = usePaperTradingStore.getState().account || hookAccount
  const hookAccountType = usePaperTradingStore((state) => state.accountType)
  const accountType = usePaperTradingStore.getState().accountType || hookAccountType
  const setAccountType = usePaperTradingStore((state) => state.setAccountType)
  const closePosition = usePaperTradingStore((state) => state.closePosition)
  const closeAllPositions = usePaperTradingStore((state) => state.closeAllPositions)
  const cancelOrder = usePaperTradingStore((state) => state.cancelOrder)
  const setBalance = usePaperTradingStore((state) => state.setBalance)
  const [isEditingBalance, setIsEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')

  // Workspace Store
  const setImportPositionsModalOpen = useWorkspaceStore((state) => state.setImportPositionsModalOpen)

  // PiaScript Store
  const script = usePiaScriptStore((state) => state.script)
  const setScript = usePiaScriptStore((state) => state.setScript)
  const isRunningScript = usePiaScriptStore((state) => state.isRunning)
  const scriptError = usePiaScriptStore((state) => state.error)
  const scriptResult = usePiaScriptStore((state) => state.result)
  const isAppliedToChart = usePiaScriptStore((state) => state.isAppliedToChart)
  const toggleApplyToChart = usePiaScriptStore((state) => state.toggleApplyToChart)
  const runScript = usePiaScriptStore((state) => state.runScript)
  const initialCapital = usePiaScriptStore((state) => state.initialCapital)
  const setInitialCapital = usePiaScriptStore((state) => state.setInitialCapital)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // ponytail: Native mouse drag resizer; upgrade to react-resizable-panels when multi-split persistent layout state is requested.
  const handleResizeStart = (e: React.MouseEvent): void => {
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = drawerHeight

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingRef.current) return
      const delta = startYRef.current - moveEvent.clientY
      const nextHeight = Math.min(520, Math.max(120, startHeightRef.current + delta))
      setDrawerHeight(nextHeight)
    }

    const onMouseUp = (): void => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Filter screener items based on live prices
  const screenerItems = React.useMemo(() => {
    let list = symbols.map((s) => {
      const q = prices[s.symbol]
      return {
        ...s,
        price: q?.price,
        change24h: q?.change24hPercent ?? 0,
        volume: q?.volume24h
      }
    })

    if (screenerFilter === 'gainers') {
      list = list.filter((i) => i.change24h > 0).sort((a, b) => b.change24h - a.change24h)
    } else if (screenerFilter === 'losers') {
      list = list.filter((i) => i.change24h < 0).sort((a, b) => a.change24h - b.change24h)
    } else if (screenerFilter === 'volume') {
      list = list.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    }

    return list
  }, [symbols, prices, screenerFilter])

  // Institutional Trading Panel Metrics
  const isCentAccount = accountType === 'cent' || account.accountType === 'cent'
  const balance = account.balance ?? 0

  const positionsWithMetrics = React.useMemo(() => {
    return (account.positions || []).map((pos) => {
      const quote = prices[pos.symbol]
      const markPrice = quote?.price ?? pos.entryPrice
      const isPosCent = pos.accountType === 'cent' || pos.lotType === 'cent' || isCentAccount
      const diff = pos.side === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice
      // In a USD Cent (USC) account, 1 USD = 100 US Cents (¢)
      const multiplier = isPosCent ? 100 : 1
      const pnl = diff * pos.size * multiplier
      const margin = pos.size * pos.entryPrice * multiplier
      const { pricePrecision } = getSymbolPrecision(pos.symbol, undefined, pos.entryPrice)

      return {
        ...pos,
        markPrice,
        pnl,
        margin,
        isPosCent,
        precision: pricePrecision
      }
    })
  }, [account.positions, prices, isCentAccount])

  const activeOrders = React.useMemo(() => {
    return (account.orders || []).filter((o) => !o.status || o.status === 'pending')
  }, [account.orders])

  const totalUnrealizedPnl = React.useMemo(() => {
    return positionsWithMetrics.reduce((sum, p) => sum + p.pnl, 0)
  }, [positionsWithMetrics])

  const marginUsed = React.useMemo(() => {
    return positionsWithMetrics.reduce((sum, p) => sum + p.margin, 0)
  }, [positionsWithMetrics])

  const equity = balance + totalUnrealizedPnl
  const freeMargin = equity - marginUsed
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : null
  const unrealizedPnlPercent = balance > 0 ? (totalUnrealizedPnl / balance) * 100 : 0

  const formatCurrencyValue = (val: number, isCent: boolean): string => {
    if (isCent) {
      return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ¢`
    }
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const pnlSign = totalUnrealizedPnl >= 0 ? '+' : '-'
  const pnlColor = totalUnrealizedPnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
  const pnlGlowBg = totalUnrealizedPnl >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'
  const pnlBorder = totalUnrealizedPnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'
  const pnlBoxShadow = totalUnrealizedPnl >= 0 ? '0 0 10px rgba(16, 185, 129, 0.2)' : '0 0 10px rgba(244, 63, 94, 0.2)'

  const pnlText = isCentAccount
    ? `${pnlSign}${Math.abs(totalUnrealizedPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ¢ (${totalUnrealizedPnl >= 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2)}%)`
    : `${pnlSign}$${Math.abs(totalUnrealizedPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalUnrealizedPnl >= 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2)}%)`

  const toggleOpen = (): void => {
    setIsOpen(!isOpen)
  }

  const handleTabClick = (tabId: BottomTabId): void => {
    if (activeTab === tabId && isOpen) {
      setIsOpen(false)
    } else {
      setActiveTab(tabId)
      setIsOpen(true)
    }
  }

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 15,
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* Resizable Top Edge Handle (when open) */}
      {isOpen && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            right: 0,
            height: 6,
            cursor: 'row-resize',
            zIndex: 30
          }}
          title="Drag to resize panel"
        />
      )}

      {/* Tab Strip Bar (TradingView bottom tab bar) */}
      <div
        style={{
          height: 28,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          borderBottom: isOpen ? `1px solid ${THEME_TOKENS.colors.borderSubtle}` : 'none'
        }}
      >
        {/* Left Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id && isOpen
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`tv-btn ${isActive ? 'active' : ''}`}
                style={{
                  height: 24,
                  padding: '0 8px',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
                  borderRadius: 3,
                  borderBottom: isActive ? `2px solid ${THEME_TOKENS.colors.accent}` : 'none'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Right Action Icons (Chevron expand/collapse) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={toggleOpen}
            className="tv-btn"
            style={{ width: 24, height: 24, padding: 0 }}
            title={isOpen ? 'Collapse Panel' : 'Maximize Panel'}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Drawer Content with dynamic resizable height */}
      {isOpen && (
        <div
          style={{
            height: drawerHeight,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: THEME_TOKENS.colors.bgApp
          }}
        >
          {/* TAB 1: STOCK SCREENER */}
          {activeTab === 'screener' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
              {/* Filter pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  backgroundColor: THEME_TOKENS.colors.bgSurface
                }}
              >
                <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 11 }}>Filter:</span>
                {(['all', 'gainers', 'losers', 'volume'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setScreenerFilter(f)}
                    className={`tv-btn ${screenerFilter === f ? 'active' : ''}`}
                    style={{
                      height: 20,
                      padding: '0 6px',
                      fontSize: 10,
                      textTransform: 'capitalize'
                    }}
                  >
                    {f}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
                  Showing {screenerItems.length} assets
                </span>
              </div>

              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr',
                  padding: '6px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  color: THEME_TOKENS.colors.textSecondary,
                  fontWeight: 600,
                  fontSize: 10
                }}
              >
                <div>Ticker</div>
                <div style={{ textAlign: 'right' }}>Last</div>
                <div style={{ textAlign: 'right' }}>Chg %</div>
                <div style={{ textAlign: 'right' }}>Volume</div>
                <div style={{ textAlign: 'right' }}>Technical Rating</div>
              </div>

              {/* Table Rows with virtualized rendering */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {screenerItems.map((item) => {
                  const isSelected = item.symbol === currentSymbol
                  const isUp = item.change24h >= 0
                  const rating =
                    item.change24h > 1.5
                      ? 'Strong Buy'
                      : item.change24h > 0
                        ? 'Buy'
                        : item.change24h > -1.5
                          ? 'Neutral'
                          : 'Sell'
                  const ratingColor =
                    item.change24h > 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish

                  return (
                    <div
                      key={item.symbol}
                      onClick={() => setSymbol(item.symbol)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr',
                        padding: '5px 12px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? THEME_TOKENS.colors.bgActive : 'transparent',
                        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        fontFamily: THEME_TOKENS.typography?.fontMono,
                        contentVisibility: 'auto',
                        containIntrinsicSize: '28px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>{item.symbol}</span>
                        <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted, fontFamily: THEME_TOKENS.typography?.fontSans }}>
                          {item.name || item.category}
                        </span>
                      </div>

                      <div style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                        {item.price !== undefined ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                      </div>

                      <div style={{ textAlign: 'right', fontWeight: 600, color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                        {isUp ? '+' : ''}{item.change24h.toFixed(2)}%
                      </div>

                      <div style={{ textAlign: 'right', color: THEME_TOKENS.colors.textSecondary }}>
                        {item.volume ? (item.volume > 1e6 ? `${(item.volume / 1e6).toFixed(1)}M` : `${(item.volume / 1e3).toFixed(1)}K`) : '--'}
                      </div>

                      <div style={{ textAlign: 'right', color: ratingColor, fontWeight: 600, fontSize: 10, fontFamily: THEME_TOKENS.typography?.fontSans }}>
                        {rating}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PIASCRIPT / PINE EDITOR */}
          {activeTab === 'pine' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: THEME_TOKENS.colors.textPrimary, fontWeight: 600 }}>
                    Script: strategy.py (PiaScript Rust Engine)
                  </span>
                  {saveStatus && (
                    <span style={{ color: THEME_TOKENS.colors.bullish, fontSize: 10, fontWeight: 600 }}>{saveStatus}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="tv-btn"
                    style={{ height: 22, fontSize: 11, padding: '0 8px' }}
                    onClick={() => {
                      try {
                        localStorage.setItem('piascript_saved', script)
                        setSaveStatus('Saved')
                        setTimeout(() => setSaveStatus(null), 2000)
                      } catch {}
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={`tv-btn ${isAppliedToChart ? 'active' : ''}`}
                    style={{ height: 22, fontSize: 11, padding: '0 8px' }}
                    onClick={() => toggleApplyToChart()}
                  >
                    {isAppliedToChart ? 'Hide on chart' : 'Show on chart'}
                  </button>
                  <button
                    type="button"
                    className="tv-btn active"
                    style={{
                      height: 22,
                      fontSize: 11,
                      padding: '0 10px',
                      backgroundColor: THEME_TOKENS.colors.accent,
                      color: '#fff',
                      fontWeight: 600
                    }}
                    disabled={isRunningScript}
                    onClick={async () => {
                      const res = await runScript()
                      if (res && res.success) {
                        setSaveStatus('Compiled & Run OK')
                        setTimeout(() => setSaveStatus(null), 2500)
                      }
                    }}
                  >
                    {isRunningScript ? 'Running...' : 'Run / Backtest'}
                  </button>
                </div>
              </div>

              {scriptError && (
                <div
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'rgba(239, 83, 80, 0.15)',
                    color: THEME_TOKENS.colors.bearish,
                    borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    fontFamily: 'Consolas, monospace',
                    fontSize: 11
                  }}
                >
                  Compile / Runtime Error: {scriptError}
                </div>
              )}

              <PiaScriptEditor value={script} onChange={setScript} />
            </div>
          )}

          {/* TAB 3: STRATEGY TESTER */}
          {activeTab === 'strategy' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 16px', gap: 12, fontSize: 12, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                  PiaScript Performance Summary {currentSymbol ? `(${currentSymbol})` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textMuted }}>Initial Capital:</span>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value) || 10000)}
                    style={{
                      width: 80,
                      height: 20,
                      fontSize: 11,
                      backgroundColor: THEME_TOKENS.colors.bgSurface,
                      color: THEME_TOKENS.colors.textPrimary,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      borderRadius: 3,
                      padding: '0 4px'
                    }}
                  />
                  <button
                    type="button"
                    className="tv-btn active"
                    style={{ height: 22, fontSize: 11, padding: '0 8px' }}
                    onClick={() => runScript()}
                  >
                    {isRunningScript ? 'Testing...' : 'Re-test'}
                  </button>
                </div>
              </div>

              {scriptResult?.backtest ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                    <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Net Profit</div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: scriptResult.backtest.net_profit >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                          marginTop: 4
                        }}
                      >
                        {scriptResult.backtest.net_profit >= 0 ? '+' : ''}${scriptResult.backtest.net_profit.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, color: scriptResult.backtest.net_profit >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                        {scriptResult.backtest.net_profit_percent >= 0 ? '+' : ''}{scriptResult.backtest.net_profit_percent.toFixed(2)}%
                      </div>
                    </div>

                    <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Total Closed Trades</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright, marginTop: 4 }}>
                        {scriptResult.backtest.total_trades}
                      </div>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                        {scriptResult.backtest.win_rate.toFixed(1)}% Win Rate
                      </div>
                    </div>

                    <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Profit Factor</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright, marginTop: 4 }}>
                        {scriptResult.backtest.profit_factor.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                        Win: {scriptResult.backtest.win_trades} | Loss: {scriptResult.backtest.loss_trades}
                      </div>
                    </div>

                    <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Max Drawdown</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.bearish, marginTop: 4 }}>
                        -${scriptResult.backtest.max_drawdown.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.bearish }}>
                        -{scriptResult.backtest.max_drawdown_percent.toFixed(2)}%
                      </div>
                    </div>

                    <div style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, padding: 10, borderRadius: 4, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>Final Equity</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: THEME_TOKENS.colors.textBright, marginTop: 4 }}>
                        ${scriptResult.backtest.final_equity.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                        from ${scriptResult.backtest.initial_capital.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Closed Trades List */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, marginBottom: 6 }}>
                      Executed Trade Log ({scriptResult.backtest.trades.length})
                    </div>
                    {scriptResult.backtest.trades.length === 0 ? (
                      <div style={{ color: THEME_TOKENS.colors.textMuted, fontStyle: 'italic', fontSize: 11 }}>
                        No closed trades generated by strategy signals on current candle dataset.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, borderRadius: 4 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ backgroundColor: THEME_TOKENS.colors.bgSurface, borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left', color: THEME_TOKENS.colors.textMuted }}>Action</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', color: THEME_TOKENS.colors.textMuted }}>Reason</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', color: THEME_TOKENS.colors.textMuted }}>Entry Time</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', color: THEME_TOKENS.colors.textMuted }}>Exit Time</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textMuted }}>Entry Price</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textMuted }}>Exit Price</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textMuted }}>PnL ($)</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textMuted }}>PnL (%)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scriptResult.backtest.trades.map((t, idx) => (
                              <tr key={idx} style={{ borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600, color: t.action === 'BUY' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                                  {t.action}
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      padding: '2px 5px',
                                      borderRadius: 3,
                                      backgroundColor:
                                        t.exit_reason === 'Stop Loss Hit'
                                          ? 'rgba(239, 83, 80, 0.15)'
                                          : t.exit_reason === 'Take Profit Hit'
                                            ? 'rgba(38, 166, 154, 0.15)'
                                            : 'rgba(255, 255, 255, 0.05)',
                                      color:
                                        t.exit_reason === 'Stop Loss Hit'
                                          ? THEME_TOKENS.colors.bearish
                                          : t.exit_reason === 'Take Profit Hit'
                                            ? THEME_TOKENS.colors.bullish
                                            : THEME_TOKENS.colors.textSecondary,
                                      fontWeight: 600
                                    }}
                                  >
                                    {t.exit_reason || 'Signal'}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', color: THEME_TOKENS.colors.textSecondary }}>
                                  {new Date(t.entry_time).toLocaleString()}
                                </td>
                                <td style={{ padding: '6px 8px', color: THEME_TOKENS.colors.textSecondary }}>
                                  {new Date(t.exit_time).toLocaleString()}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                                  {t.entry_price.toFixed(2)}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                                  {t.exit_price.toFixed(2)}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: t.pnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                                  {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: t.pnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish }}>
                                  {t.pnl_percent >= 0 ? '+' : ''}{t.pnl_percent.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, color: THEME_TOKENS.colors.textMuted, minHeight: 140 }}>
                  <div>No backtest has been executed yet.</div>
                  <button
                    type="button"
                    className="tv-btn active"
                    style={{ height: 26, fontSize: 11, padding: '0 12px' }}
                    onClick={() => {
                      setActiveTab('pine')
                    }}
                  >
                    Open PiaScript Editor & Run
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TRADING PANEL - INSTITUTIONAL ACCOUNT MANAGER & POSITIONS TABLE */}
          {activeTab === 'trading' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Account Metrics Header Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  gap: 10,
                  flexWrap: 'wrap'
                }}
              >
                {/* Left Metrics Cluster */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Mode Toggle Pill */}
                  <div
                    style={{
                      display: 'flex',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      borderRadius: 4,
                      padding: 2,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setAccountType('standard')}
                      className="tv-btn"
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: !isCentAccount ? 700 : 500,
                        backgroundColor: !isCentAccount ? THEME_TOKENS.colors.accent : 'transparent',
                        color: !isCentAccount ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                        borderRadius: 3
                      }}
                    >
                      Standard Account (USD $)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType('cent')}
                      className="tv-btn"
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: isCentAccount ? 700 : 500,
                        backgroundColor: isCentAccount ? THEME_TOKENS.colors.accent : 'transparent',
                        color: isCentAccount ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                        borderRadius: 3
                      }}
                    >
                      Cent Account (USC ¢)
                    </button>
                  </div>

                  {/* Balance Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                        Balance
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setBalanceInput(balance.toString())
                          setIsEditingBalance(true)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: THEME_TOKENS.colors.accent,
                          fontSize: 9,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                        title="Set custom account balance/equity"
                      >
                        Edit
                      </button>
                    </div>
                    {isEditingBalance ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          type="number"
                          step="any"
                          value={balanceInput}
                          onChange={(e) => setBalanceInput(e.target.value)}
                          className="tv-input"
                          style={{ fontSize: 10, padding: '1px 4px', width: 80, height: 18 }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const val = parseFloat(balanceInput)
                            if (!isNaN(val) && val >= 0) {
                              await setBalance(val)
                            }
                            setIsEditingBalance(false)
                          }}
                          className="tv-btn"
                          style={{ fontSize: 9, padding: '1px 4px', height: 18 }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingBalance(false)}
                          className="tv-btn"
                          style={{ fontSize: 9, padding: '1px 4px', height: 18 }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                        {formatCurrencyValue(balance, isCentAccount)}
                      </span>
                    )}
                  </div>

                  <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

                  {/* Equity Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      Equity
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                      {formatCurrencyValue(equity, isCentAccount)}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

                  {/* Unrealized PnL Badge with Jewel Glow */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      Unrealized PnL
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: THEME_TOKENS.typography?.fontMono,
                        color: pnlColor,
                        backgroundColor: pnlGlowBg,
                        border: `1px solid ${pnlBorder}`,
                        boxShadow: pnlBoxShadow,
                        padding: '1px 6px',
                        borderRadius: 4
                      }}
                    >
                      {pnlText}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

                  {/* Margin Used */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      Margin Used
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                      {formatCurrencyValue(marginUsed, isCentAccount)}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

                  {/* Free Margin */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      Free Margin
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                      {formatCurrencyValue(freeMargin, isCentAccount)}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderSubtle }} />

                  {/* Margin Level */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      Margin Level
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright, fontFamily: THEME_TOKENS.typography?.fontMono }}>
                      {marginLevel !== null ? `${marginLevel.toFixed(1)}%` : '--'}
                    </span>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setImportPositionsModalOpen(true, 'quick')}
                    className="tv-btn"
                    style={{
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: THEME_TOKENS.colors.accent,
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    + Quick Position
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportPositionsModalOpen(true, 'import')}
                    className="tv-btn"
                    style={{
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
                      color: THEME_TOKENS.colors.textBright,
                      border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    ↓ Import Positions
                  </button>
                  <button
                    type="button"
                    onClick={() => closeAllPositions()}
                    disabled={positionsWithMetrics.length === 0}
                    className="tv-btn"
                    style={{
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      backgroundColor: 'rgba(244, 63, 94, 0.12)',
                      color: THEME_TOKENS.colors.bearish,
                      border: '1px solid rgba(244, 63, 94, 0.25)',
                      borderRadius: 4,
                      cursor: positionsWithMetrics.length > 0 ? 'pointer' : 'not-allowed',
                      opacity: positionsWithMetrics.length > 0 ? 1 : 0.4
                    }}
                    title="Close all open positions"
                  >
                    ✕ Close All
                  </button>
                </div>
              </div>

              {/* Sub-tab Navigation: Positions (N) vs Orders (N) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px',
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                }}
              >
                <button
                  type="button"
                  onClick={() => setTradingSubTab('positions')}
                  className={`tv-btn ${tradingSubTab === 'positions' ? 'active' : ''}`}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: tradingSubTab === 'positions' ? 700 : 500,
                    backgroundColor:
                      tradingSubTab === 'positions' ? THEME_TOKENS.colors.bgActive : 'transparent',
                    color:
                      tradingSubTab === 'positions'
                        ? THEME_TOKENS.colors.textBright
                        : THEME_TOKENS.colors.textSecondary,
                    border: `1px solid ${tradingSubTab === 'positions' ? THEME_TOKENS.colors.borderMedium : 'transparent'}`,
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {`Positions (${positionsWithMetrics.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setTradingSubTab('orders')}
                  className={`tv-btn ${tradingSubTab === 'orders' ? 'active' : ''}`}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: tradingSubTab === 'orders' ? 700 : 500,
                    backgroundColor:
                      tradingSubTab === 'orders' ? THEME_TOKENS.colors.bgActive : 'transparent',
                    color:
                      tradingSubTab === 'orders'
                        ? THEME_TOKENS.colors.textBright
                        : THEME_TOKENS.colors.textSecondary,
                    border: `1px solid ${tradingSubTab === 'orders' ? THEME_TOKENS.colors.borderMedium : 'transparent'}`,
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {`Orders (${activeOrders.length})`}
                </button>
              </div>

              {/* Table or Empty State Container */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {tradingSubTab === 'positions' ? (
                  positionsWithMetrics.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '32px 16px',
                      gap: 8,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                      No open positions
                    </div>
                    <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, maxWidth: 400 }}>
                      No open positions. Click + Quick Position or ↓ Import Positions to get started.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => setImportPositionsModalOpen(true, 'quick')}
                        className="tv-btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: THEME_TOKENS.colors.accent,
                          color: '#ffffff',
                          borderRadius: 4
                        }}
                      >
                        + Quick Position
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportPositionsModalOpen(true, 'import')}
                        className="tv-btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
                          color: THEME_TOKENS.colors.textBright,
                          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                          borderRadius: 4
                        }}
                      >
                        ↓ Import Positions
                      </button>
                    </div>
                  </div>
                ) : (
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 11,
                      textAlign: 'left',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <thead
                      style={{
                        position: 'sticky',
                        top: 0,
                        backgroundColor: THEME_TOKENS.colors.bgSurface,
                        borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        zIndex: 5
                      }}
                    >
                      <tr
                        style={{
                          color: THEME_TOKENS.colors.textSecondary,
                          fontSize: 10,
                          fontWeight: 600
                        }}
                      >
                        <th style={{ padding: '6px 10px' }}>Ticket</th>
                        <th style={{ padding: '6px 8px' }}>Symbol</th>
                        <th style={{ padding: '6px 8px' }}>Side</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Lots</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Mode</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Entry Price</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Mark Price</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Stop Loss</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Take Profit</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>PnL</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positionsWithMetrics.map((pos) => {
                        const isSelected = pos.symbol === currentSymbol
                        const markPriceQuote = prices[pos.symbol]
                        const markPriceFormatted =
                          markPriceQuote?.price !== undefined
                            ? markPriceQuote.price.toFixed(pos.precision)
                            : pos.entryPrice.toFixed(pos.precision)

                        const rowPnlSign = pos.pnl >= 0 ? '+' : '-'
                        const pnlValFormatted = pos.isPosCent
                          ? `${rowPnlSign}${Math.abs(pos.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ¢`
                          : `${rowPnlSign}$${Math.abs(pos.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

                        return (
                          <tr
                            key={pos.id}
                            onClick={() => setSymbol(pos.symbol)}
                            style={{
                              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                              cursor: 'pointer',
                              backgroundColor: isSelected ? THEME_TOKENS.colors.bgActive : 'transparent',
                              fontFamily: THEME_TOKENS.typography?.fontMono
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSurfaceHover
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            {/* Ticket */}
                            <td style={{ padding: '5px 10px', color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
                              {pos.ticket || `#${pos.id.slice(-6)}`}
                            </td>

                            {/* Symbol with SymbolLogo */}
                            <td style={{ padding: '5px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <SymbolLogo symbol={pos.symbol} size={14} />
                                <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                                  {pos.symbol}
                                </span>
                              </div>
                            </td>

                            {/* Side Pill */}
                            <td style={{ padding: '5px 8px' }}>
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  backgroundColor:
                                    pos.side === 'buy' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: pos.side === 'buy' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                                  border: `1px solid ${pos.side === 'buy' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                                }}
                              >
                                {pos.side.toUpperCase()}
                              </span>
                            </td>

                            {/* Lots */}
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                              {`${pos.size.toFixed(2)} L`}
                            </td>

                            {/* Mode */}
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  fontSize: 9,
                                  fontWeight: 600,
                                  backgroundColor: pos.isPosCent ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                                  color: pos.isPosCent ? THEME_TOKENS.colors.gold : THEME_TOKENS.colors.textSecondary
                                }}
                              >
                                {pos.isPosCent ? 'Cent' : 'Std'}
                              </span>
                            </td>

                            {/* Entry Price */}
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                              {pos.entryPrice.toFixed(pos.precision)}
                            </td>

                            {/* Mark Price */}
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textBright }}>
                              {markPriceFormatted}
                            </td>

                            {/* Stop Loss */}
                            <td
                              style={{
                                padding: '5px 8px',
                                textAlign: 'right',
                                color: pos.stopLoss ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.textMuted
                              }}
                            >
                              {pos.stopLoss ? pos.stopLoss.toFixed(pos.precision) : '--'}
                            </td>

                            {/* Take Profit */}
                            <td
                              style={{
                                padding: '5px 8px',
                                textAlign: 'right',
                                color: pos.takeProfit ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textMuted
                              }}
                            >
                              {pos.takeProfit ? pos.takeProfit.toFixed(pos.precision) : '--'}
                            </td>

                            {/* PnL Jewel Badge */}
                            <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  backgroundColor:
                                    pos.pnl >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                                  color: pos.pnl >= 0 ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                                  border: `1px solid ${pos.pnl >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`
                                }}
                              >
                                {pnlValFormatted}
                              </span>
                            </td>

                            {/* Action: Close button */}
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  closePosition(pos.id, pos.markPrice)
                                }}
                                className="tv-btn"
                                style={{
                                  width: 20,
                                  height: 20,
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: THEME_TOKENS.colors.textSecondary,
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                  fontSize: 11
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = THEME_TOKENS.colors.bearish
                                  e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.15)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }}
                                title="Close Position"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : (
                activeOrders.length === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '32px 16px',
                        gap: 8,
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                        No pending orders
                      </div>
                      <div style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, maxWidth: 400 }}>
                        Place Limit or Stop orders on the chart or in Order Entry to queue pending trades.
                      </div>
                    </div>
                  ) : (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 11,
                        textAlign: 'left',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <thead
                        style={{
                          position: 'sticky',
                          top: 0,
                          backgroundColor: THEME_TOKENS.colors.bgSurface,
                          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                          zIndex: 5
                        }}
                      >
                        <tr style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10, fontWeight: 600 }}>
                          <th style={{ padding: '6px 10px' }}>Ticket</th>
                          <th style={{ padding: '6px 8px' }}>Time</th>
                          <th style={{ padding: '6px 8px' }}>Symbol</th>
                          <th style={{ padding: '6px 8px' }}>Type</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Lots</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Order Price</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Market Price</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Stop Loss</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Take Profit</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrders.map((ord) => {
                          const q = prices[ord.symbol]
                          const markPrice = q?.price ?? ord.price
                          const isBuy = ord.side === 'buy' || ord.type.startsWith('buy')
                          const { pricePrecision: pPrecision } = getSymbolPrecision(
                            ord.symbol,
                            undefined,
                            ord.price
                          )
                          return (
                            <tr
                              key={ord.id}
                              onClick={() => setSymbol(ord.symbol)}
                              style={{
                                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                                cursor: 'pointer',
                                backgroundColor:
                                  currentSymbol === ord.symbol ? THEME_TOKENS.colors.bgActive : 'transparent',
                                fontFamily: THEME_TOKENS.typography?.fontMono
                              }}
                            >
                              <td style={{ padding: '5px 10px', color: THEME_TOKENS.colors.textMuted, fontSize: 10 }}>
                                {ord.ticket ? ord.ticket : `#${ord.id.slice(-6)}`}
                              </td>
                              <td style={{ padding: '5px 8px', color: THEME_TOKENS.colors.textSecondary }}>
                                {new Date(ord.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td style={{ padding: '5px 8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <SymbolLogo symbol={ord.symbol} size={14} />
                                  <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                                    {ord.symbol}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '5px 8px' }}>
                                <span
                                  style={{
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    backgroundColor: isBuy
                                      ? 'rgba(6, 182, 212, 0.15)'
                                      : 'rgba(245, 158, 11, 0.15)',
                                    color: isBuy ? '#06b6d4' : '#f59e0b',
                                    border: `1px solid ${isBuy ? 'rgba(6, 182, 212, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                  }}
                                >
                                  {ord.type.replace('_', ' ').toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                                {`${ord.size.toFixed(2)} L`}
                              </td>
                              <td
                                style={{
                                  padding: '5px 8px',
                                  textAlign: 'right',
                                  color: THEME_TOKENS.colors.textBright,
                                  fontWeight: 600
                                }}
                              >
                                {ord.price.toFixed(pPrecision)}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: THEME_TOKENS.colors.textSecondary }}>
                                {markPrice.toFixed(pPrecision)}
                              </td>
                              <td
                                style={{
                                  padding: '5px 8px',
                                  textAlign: 'right',
                                  color: ord.stopLoss ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.textMuted
                                }}
                              >
                                {ord.stopLoss ? ord.stopLoss.toFixed(pPrecision) : '--'}
                              </td>
                              <td
                                style={{
                                  padding: '5px 8px',
                                  textAlign: 'right',
                                  color: ord.takeProfit ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textMuted
                                }}
                              >
                                {ord.takeProfit ? ord.takeProfit.toFixed(pPrecision) : '--'}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cancelOrder(ord.id)
                                  }}
                                  className="tv-btn"
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: THEME_TOKENS.colors.bearish,
                                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                                    border: '1px solid rgba(244, 63, 94, 0.25)',
                                    borderRadius: 3,
                                    cursor: 'pointer'
                                  }}
                                  title="Cancel pending order"
                                >
                                  ✕ Cancel
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
