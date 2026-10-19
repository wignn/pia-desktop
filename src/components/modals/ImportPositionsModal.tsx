import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { parsePositionText, exportPositionsToCsv } from '../../utils/position-parser'
import { THEME_TOKENS } from '../../theme/tokens'

export type ImportModalTab = 'quick' | 'import' | 'export'

interface ImportPositionsModalProps {
  isOpen?: boolean
  onClose?: () => void
  initialTab?: ImportModalTab
  initialText?: string
}

const LOT_PRESETS = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00', '2.00', '5.00']

export const ImportPositionsModal: React.FC<ImportPositionsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'quick',
  initialText = ''
}) => {
  const hookIsOpen = useWorkspaceStore((state) => state.isImportPositionsModalOpen)
  const stateIsOpen = useWorkspaceStore.getState().isImportPositionsModalOpen
  const setStoreOpen = useWorkspaceStore((state) => state.setImportPositionsModalOpen)

  const isModalOpen = isOpen !== undefined ? isOpen : (hookIsOpen || stateIsOpen)
  const handleClose = onClose || (() => setStoreOpen(false))

  if (!isModalOpen) {
    return null
  }

  return (
    <ImportPositionsModalDialog
      initialTab={initialTab}
      initialText={initialText}
      onClose={handleClose}
    />
  )
}

interface DialogProps {
  initialTab: ImportModalTab
  initialText: string
  onClose: () => void
}

const ImportPositionsModalDialog: React.FC<DialogProps> = ({ initialTab, initialText, onClose }) => {
  const hookMarketSymbol = useMarketStore((state) => state.symbol)
  const activeMarketSymbol = useMarketStore.getState().symbol || hookMarketSymbol
  const hookPrices = useMarketStore((state) => state.prices)
  const prices = useMarketStore.getState().prices || hookPrices
  const hookAccountType = usePaperTradingStore((state) => state.accountType)
  const storeAccountType = usePaperTradingStore.getState().accountType || hookAccountType
  const hookAccount = usePaperTradingStore((state) => state.account)
  const account = usePaperTradingStore.getState().account || hookAccount
  const openPosition = usePaperTradingStore((state) => state.openPosition)
  const importPositions = usePaperTradingStore((state) => state.importPositions)

  const [activeTab, setActiveTab] = useState<ImportModalTab>(initialTab)

  // Quick Entry State
  const [quickSymbol, setQuickSymbol] = useState(activeMarketSymbol || 'EURUSD')
  const [quickSide, setQuickSide] = useState<'buy' | 'sell'>('buy')
  const [quickAccountMode, setQuickAccountMode] = useState<'standard' | 'cent'>(storeAccountType || 'standard')
  const [quickLots, setQuickLots] = useState('0.10')
  const [quickPrice, setQuickPrice] = useState('')
  const [quickStopLoss, setQuickStopLoss] = useState('')
  const [quickTakeProfit, setQuickTakeProfit] = useState('')
  const [quickTicket, setQuickTicket] = useState('')
  const [quickComment, setQuickComment] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false)

  // Batch Import State
  const [importText, setImportText] = useState(initialText)
  const [importAccountType, setImportAccountType] = useState<'standard' | 'cent'>(storeAccountType || 'standard')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // Export State
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  // Keyboard shortcut listener (Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
    return undefined
  }, [onClose])

  // Sync active symbol from market store if not yet edited
  useEffect(() => {
    if (activeMarketSymbol && !quickPrice) {
      setQuickSymbol(activeMarketSymbol)
    }
  }, [activeMarketSymbol, quickPrice])

  // Current market quote helper
  const currentQuote = prices[quickSymbol]
  const currentMarketPrice = currentQuote?.price ?? 0

  const handleFillMarketPrice = (): void => {
    if (currentMarketPrice > 0) {
      setQuickPrice(currentMarketPrice.toString())
    }
  }

  // Pip calculation helper
  // ponytail: pip helper uses standard forex/crypto pip heuristic; upgrade to full broker-pip-size metadata dictionary if exotic currency pairs or fractional pipettes require customized calculation.
  const handleApplyPips = (target: 'sl' | 'tp', pips: number): void => {
    const refPrice = parseFloat(quickPrice) || currentMarketPrice
    if (refPrice <= 0) return

    const upper = quickSymbol.toUpperCase()
    const isJpy = upper.includes('JPY')
    const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT'].some((c) => upper.includes(c))
    const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001
    const decimals = isCrypto ? 2 : isJpy ? 3 : 5

    let calculated: number
    if (target === 'sl') {
      calculated = quickSide === 'buy' ? refPrice - pips * pipSize : refPrice + pips * pipSize
      setQuickStopLoss(calculated > 0 ? calculated.toFixed(decimals) : '')
    } else {
      calculated = quickSide === 'buy' ? refPrice + pips * pipSize : refPrice - pips * pipSize
      setQuickTakeProfit(calculated > 0 ? calculated.toFixed(decimals) : '')
    }
  }

  // Quick Entry Submit
  const handleQuickSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setQuickError(null)

    const sym = quickSymbol.trim().toUpperCase()
    if (!sym) {
      setQuickError('Please enter a valid symbol')
      return
    }

    const lots = parseFloat(quickLots)
    if (isNaN(lots) || lots <= 0) {
      setQuickError('Please enter a valid positive lot size')
      return
    }

    const price = parseFloat(quickPrice) || currentMarketPrice
    if (isNaN(price) || price <= 0) {
      setQuickError('Please enter an entry price or click Market Price')
      return
    }

    const sl = parseFloat(quickStopLoss)
    const tp = parseFloat(quickTakeProfit)

    setIsSubmittingQuick(true)
    const res = await openPosition({
      symbol: sym,
      side: quickSide,
      size: lots,
      price,
      stopLoss: !isNaN(sl) && sl > 0 ? sl : undefined,
      takeProfit: !isNaN(tp) && tp > 0 ? tp : undefined,
      ticket: quickTicket.trim() || undefined,
      comment: quickComment.trim() || undefined,
      accountType: quickAccountMode,
      source: 'manual'
    })
    setIsSubmittingQuick(false)

    if (res.success) {
      onClose()
    } else {
      setQuickError(res.error || 'Failed to open position')
    }
  }

  // Live Batch Parsing
  const parsedBatch = useMemo(() => {
    return parsePositionText(importText, importAccountType)
  }, [importText, importAccountType])

  // Batch Import Submit
  const handleBatchImportSubmit = async (): Promise<void> => {
    if (parsedBatch.positions.length === 0) return
    setIsImporting(true)
    setImportError(null)

    const res = await importPositions(parsedBatch.positions)
    setIsImporting(false)

    if (res.success) {
      onClose()
    } else {
      setImportError(res.error || 'Failed to import positions')
    }
  }

  // Export CSV generator
  const generatedCsv = useMemo(() => {
    return exportPositionsToCsv(account.positions, account.accountType)
  }, [account.positions, account.accountType])

  // ponytail: CSV export uses browser blob download and clipboard API; upgrade to native OS file-save dialog via Tauri IPC when running in desktop mode.
  const handleCopyCsv = async (): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(generatedCsv)
        setCopyStatus('Copied to clipboard!')
        setTimeout(() => setCopyStatus(null), 2500)
      }
    } catch {
      setCopyStatus('Failed to copy')
      setTimeout(() => setCopyStatus(null), 2500)
    }
  }

  const handleDownloadCsv = (): void => {
    try {
      const blob = new Blob([generatedCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trade-positions-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download CSV:', err)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: THEME_TOKENS.colors.modalBackdrop,
        backdropFilter: 'blur(10px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '60px',
        paddingBottom: '40px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 660,
          maxWidth: '92vw',
          backgroundColor: THEME_TOKENS.colors.bgSurface,
          border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
          borderRadius: 10,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: '88vh'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: THEME_TOKENS.colors.bgApp
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: THEME_TOKENS.colors.textBright, letterSpacing: 0.3 }}>
              Position Manager &amp; Import
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 4,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: THEME_TOKENS.colors.accent,
                fontWeight: 700
              }}
            >
              EXTERNAL POSITIONS
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="tv-btn"
            style={{
              padding: '4px 8px',
              fontSize: 14,
              color: THEME_TOKENS.colors.textSecondary,
              cursor: 'pointer',
              borderRadius: 4
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Chamfered Segmented Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            backgroundColor: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          {(
            [
              { id: 'quick', label: 'Quick Entry' },
              { id: 'import', label: 'Batch Import' },
              { id: 'export', label: 'Export' }
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '11px 0',
                  background: isActive ? THEME_TOKENS.colors.bgSurface : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${THEME_TOKENS.colors.accent}` : '2px solid transparent',
                  color: isActive ? THEME_TOKENS.colors.textBright : THEME_TOKENS.colors.textSecondary,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  letterSpacing: 0.3
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: QUICK ENTRY */}
          {activeTab === 'quick' && (
            <form onSubmit={handleQuickSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Row 1: Symbol & Side Toggle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={quickSymbol}
                    onChange={(e) => setQuickSymbol(e.target.value.toUpperCase())}
                    className="tv-input"
                    placeholder="e.g. EURUSD, XAUUSD"
                    required
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      padding: '7px 10px',
                      textTransform: 'uppercase',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      color: THEME_TOKENS.colors.textBright,
                      borderRadius: 6
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Side
                  </label>
                  <div style={{ display: 'flex', gap: 8, height: 34 }}>
                    <button
                      type="button"
                      onClick={() => setQuickSide('buy')}
                      style={{
                        flex: 1,
                        borderRadius: 6,
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        backgroundColor:
                          quickSide === 'buy' ? THEME_TOKENS.colors.bullish : 'rgba(255, 255, 255, 0.05)',
                        color: quickSide === 'buy' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      BUY / LONG
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickSide('sell')}
                      style={{
                        flex: 1,
                        borderRadius: 6,
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        backgroundColor:
                          quickSide === 'sell' ? THEME_TOKENS.colors.bearish : 'rgba(255, 255, 255, 0.05)',
                        color: quickSide === 'sell' ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      SELL / SHORT
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Account Mode Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                  Account Mode
                </label>
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    padding: 3,
                    borderRadius: 6,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setQuickAccountMode('standard')}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor:
                        quickAccountMode === 'standard' ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                      color:
                        quickAccountMode === 'standard'
                          ? THEME_TOKENS.colors.textBright
                          : THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    Standard (100k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickAccountMode('cent')}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor:
                        quickAccountMode === 'cent' ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                      color:
                        quickAccountMode === 'cent'
                          ? THEME_TOKENS.colors.textBright
                          : THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    Cent (1k / ¢)
                  </button>
                </div>
              </div>

              {/* Row 3: Lot Size Selector with Pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Position Lots / Volume
                  </label>
                  <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                    {quickAccountMode === 'cent' ? 'Micro / Cent lots' : 'Standard lots'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LOT_PRESETS.map((p) => {
                    const isSelected = quickLots === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setQuickLots(p)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor: isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.bgApp,
                          color: isSelected ? '#ffffff' : THEME_TOKENS.colors.textSecondary,
                          border: `1px solid ${isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.borderSubtle}`
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={quickLots}
                  onChange={(e) => setQuickLots(e.target.value)}
                  placeholder="Custom lots (e.g. 0.15)"
                  className="tv-input"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    color: THEME_TOKENS.colors.textBright,
                    borderRadius: 6,
                    marginTop: 4
                  }}
                  required
                />
              </div>

              {/* Row 4: Entry Price */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Entry Price
                  </label>
                  {currentMarketPrice > 0 && (
                    <button
                      type="button"
                      onClick={handleFillMarketPrice}
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: THEME_TOKENS.colors.accent,
                        border: `1px solid rgba(59, 130, 246, 0.3)`,
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      Market Price ({currentMarketPrice.toFixed(4)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  value={quickPrice}
                  onChange={(e) => setQuickPrice(e.target.value)}
                  placeholder={
                    currentMarketPrice > 0
                      ? `Entry Price (Current: ${currentMarketPrice})`
                      : 'Arbitrary Entry Price (e.g. 1.08500)'
                  }
                  className="tv-input"
                  style={{
                    fontSize: 12,
                    padding: '7px 10px',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    color: THEME_TOKENS.colors.textBright,
                    borderRadius: 6
                  }}
                  required
                />
              </div>

              {/* Row 5: SL & TP with Pip Helpers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Stop Loss */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                      Stop Loss
                    </label>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[10, 25, 50].map((pips) => (
                        <button
                          key={pips}
                          type="button"
                          onClick={() => handleApplyPips('sl', pips)}
                          style={{
                            padding: '1px 5px',
                            fontSize: 9,
                            fontWeight: 700,
                            borderRadius: 3,
                            backgroundColor: 'rgba(244, 63, 94, 0.12)',
                            color: THEME_TOKENS.colors.bearish,
                            border: '1px solid rgba(244, 63, 94, 0.25)',
                            cursor: 'pointer'
                          }}
                          title={`Set SL at +${pips} pips`}
                        >
                          +{pips}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={quickStopLoss}
                    onChange={(e) => setQuickStopLoss(e.target.value)}
                    placeholder="SL Price (Optional)"
                    className="tv-input"
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      color: THEME_TOKENS.colors.textBright,
                      borderRadius: 6
                    }}
                  />
                </div>

                {/* Take Profit */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                      Take Profit
                    </label>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[10, 25, 50].map((pips) => (
                        <button
                          key={pips}
                          type="button"
                          onClick={() => handleApplyPips('tp', pips)}
                          style={{
                            padding: '1px 5px',
                            fontSize: 9,
                            fontWeight: 700,
                            borderRadius: 3,
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            color: THEME_TOKENS.colors.bullish,
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            cursor: 'pointer'
                          }}
                          title={`Set TP at +${pips} pips`}
                        >
                          +{pips}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={quickTakeProfit}
                    onChange={(e) => setQuickTakeProfit(e.target.value)}
                    placeholder="TP Price (Optional)"
                    className="tv-input"
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      color: THEME_TOKENS.colors.textBright,
                      borderRadius: 6
                    }}
                  />
                </div>
              </div>

              {/* Row 6: Ticket & Comment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Ticket # (Optional)
                  </label>
                  <input
                    type="text"
                    value={quickTicket}
                    onChange={(e) => setQuickTicket(e.target.value)}
                    placeholder="e.g. 1048291"
                    className="tv-input"
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      color: THEME_TOKENS.colors.textBright,
                      borderRadius: 6
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                    Comment / Tag
                  </label>
                  <input
                    type="text"
                    value={quickComment}
                    onChange={(e) => setQuickComment(e.target.value)}
                    placeholder="e.g. Swing Breakout, Strategy A"
                    className="tv-input"
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      backgroundColor: THEME_TOKENS.colors.bgApp,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      color: THEME_TOKENS.colors.textBright,
                      borderRadius: 6
                    }}
                  />
                </div>
              </div>

              {quickError && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: `1px solid ${THEME_TOKENS.colors.bearish}`,
                    color: THEME_TOKENS.colors.bearish,
                    fontSize: 12
                  }}
                >
                  {quickError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingQuick}
                style={{
                  marginTop: 6,
                  padding: '10px 0',
                  borderRadius: 6,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  backgroundColor:
                    quickSide === 'buy' ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish,
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  transition: 'opacity 0.15s ease',
                  opacity: isSubmittingQuick ? 0.7 : 1
                }}
              >
                {isSubmittingQuick ? 'Adding Position...' : 'Add Position'}
              </button>
            </form>
          )}

          {/* TAB 2: BATCH IMPORT */}
          {activeTab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Account Type Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                  Default Account Mode for Import:
                </span>
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    padding: 2,
                    borderRadius: 6,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setImportAccountType('standard')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor:
                        importAccountType === 'standard' ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                      color:
                        importAccountType === 'standard'
                          ? THEME_TOKENS.colors.textBright
                          : THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportAccountType('cent')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor:
                        importAccountType === 'cent' ? THEME_TOKENS.colors.bgSurfaceHover : 'transparent',
                      color:
                        importAccountType === 'cent'
                          ? THEME_TOKENS.colors.textBright
                          : THEME_TOKENS.colors.textSecondary
                    }}
                  >
                    Cent
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  'Paste trade position report, statement lines, or CSV rows here...\nExample:\nEURUSD BUY 0.50 1.12250 SL 1.12000 TP 1.12600\nBTCUSDT SELL 0.10 82500'
                }
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 6,
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  color: THEME_TOKENS.colors.textBright,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  resize: 'vertical',
                  lineHeight: '1.4'
                }}
              />

              {/* Parsing Warnings / Info */}
              {parsedBatch.errors.length > 0 && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    border: `1px solid rgba(245, 158, 11, 0.3)`,
                    color: THEME_TOKENS.colors.gold,
                    fontSize: 11
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    ⚠️ {parsedBatch.errors.length} unparsed line(s):
                  </div>
                  <div style={{ maxHeight: 60, overflowY: 'auto', fontFamily: 'monospace' }}>
                    {parsedBatch.errors.slice(0, 3).map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                    {parsedBatch.errors.length > 3 && (
                      <div>...and {parsedBatch.errors.length - 3} more</div>
                    )}
                  </div>
                </div>
              )}

              {/* Live Preview Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textSecondary }}>
                    LIVE PREVIEW ({parsedBatch.positions.length} DETECTED)
                  </span>
                </div>

                <div
                  style={{
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderRadius: 6,
                    backgroundColor: THEME_TOKENS.colors.bgApp,
                    overflow: 'hidden',
                    maxHeight: 180,
                    overflowY: 'auto'
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 11,
                      textAlign: 'left'
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                          color: THEME_TOKENS.colors.textSecondary
                        }}
                      >
                        <th style={{ padding: '6px 10px' }}>Symbol</th>
                        <th style={{ padding: '6px 8px' }}>Side</th>
                        <th style={{ padding: '6px 8px' }}>Lots</th>
                        <th style={{ padding: '6px 8px' }}>Entry Price</th>
                        <th style={{ padding: '6px 8px' }}>SL</th>
                        <th style={{ padding: '6px 8px' }}>TP</th>
                        <th style={{ padding: '6px 10px' }}>Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedBatch.positions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: '24px 10px',
                              textAlign: 'center',
                              color: THEME_TOKENS.colors.textSecondary,
                              fontStyle: 'italic'
                            }}
                          >
                            No positions detected. Paste external trade reports or statements above.
                          </td>
                        </tr>
                      ) : (
                        parsedBatch.positions.map((pos, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                              fontFamily: 'monospace'
                            }}
                          >
                            <td
                              style={{
                                padding: '6px 10px',
                                fontWeight: 700,
                                color: THEME_TOKENS.colors.textBright
                              }}
                            >
                              {pos.symbol}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                  backgroundColor:
                                    pos.side === 'buy'
                                      ? 'rgba(16, 185, 129, 0.15)'
                                      : 'rgba(244, 63, 94, 0.15)',
                                  color:
                                    pos.side === 'buy'
                                      ? THEME_TOKENS.colors.bullish
                                      : THEME_TOKENS.colors.bearish
                                }}
                              >
                                {pos.side.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', color: THEME_TOKENS.colors.textBright }}>
                              {pos.size}
                            </td>
                            <td style={{ padding: '6px 8px', color: THEME_TOKENS.colors.textBright }}>
                              {pos.price}
                            </td>
                            <td
                              style={{
                                padding: '6px 8px',
                                color: pos.stopLoss ? THEME_TOKENS.colors.bearish : THEME_TOKENS.colors.textSecondary
                              }}
                            >
                              {pos.stopLoss ?? '-'}
                            </td>
                            <td
                              style={{
                                padding: '6px 8px',
                                color: pos.takeProfit ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.textSecondary
                              }}
                            >
                              {pos.takeProfit ?? '-'}
                            </td>
                            <td style={{ padding: '6px 10px', color: THEME_TOKENS.colors.textSecondary }}>
                              {pos.ticket || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {importError && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: `1px solid ${THEME_TOKENS.colors.bearish}`,
                    color: THEME_TOKENS.colors.bearish,
                    fontSize: 12
                  }}
                >
                  {importError}
                </div>
              )}

              {/* Import Action Button */}
              <button
                type="button"
                onClick={handleBatchImportSubmit}
                disabled={isImporting || parsedBatch.positions.length === 0}
                style={{
                  marginTop: 4,
                  padding: '10px 0',
                  borderRadius: 6,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: parsedBatch.positions.length > 0 ? 'pointer' : 'not-allowed',
                  backgroundColor: THEME_TOKENS.colors.accent,
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  transition: 'opacity 0.15s ease',
                  opacity: parsedBatch.positions.length === 0 || isImporting ? 0.5 : 1
                }}
              >
                {isImporting
                  ? 'Importing...'
                  : `Import ${parsedBatch.positions.length} Position${parsedBatch.positions.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}

          {/* TAB 3: EXPORT */}
          {activeTab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
                  {`${account.positions.length} Open Position${account.positions.length === 1 ? '' : 's'}`}
                </span>
                <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                  Standard CSV Format
                </span>
              </div>

              {/* CSV Text Block */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  backgroundColor: THEME_TOKENS.colors.bgApp,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  maxHeight: 220,
                  overflowY: 'auto'
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: THEME_TOKENS.colors.textBright,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}
                >
                  {generatedCsv}
                </pre>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleCopyCsv}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 6,
                    border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    backgroundColor: THEME_TOKENS.colors.bgSurfaceHover,
                    color: THEME_TOKENS.colors.textBright,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {copyStatus || 'Copy CSV to Clipboard'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 6,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    backgroundColor: THEME_TOKENS.colors.accent,
                    color: '#ffffff',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Download CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
