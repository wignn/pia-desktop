import React, { useState, useEffect } from 'react'
import { useAlertsStore } from '../../stores/useAlertsStore'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const AlertsPanel: React.FC = () => {
  const { alerts, loadAlerts, createAlert, deleteAlert, isLoading } = useAlertsStore()
  const { symbol, prices } = useMarketStore()

  const [isCreating, setIsCreating] = useState(false)
  const [alertSymbol, setAlertSymbol] = useState(symbol ?? '')
  const [direction, setDirection] = useState<'above' | 'below' | 'cross'>('above')
  const [targetPrice, setTargetPrice] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  // Pre-fill target price when opening creation form or changing symbol
  const handleOpenCreate = (): void => {
    const currentPrice = symbol ? prices[symbol]?.price : undefined
    setAlertSymbol(symbol ?? '')
    setTargetPrice(currentPrice ? currentPrice.toString() : '')
    setFormError(null)
    setIsCreating(true)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setFormError(null)

    const priceNum = parseFloat(targetPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError('Please enter a valid positive target price')
      return
    }

    if (!alertSymbol.trim()) {
      setFormError('Symbol cannot be empty')
      return
    }

    const success = await createAlert({
      symbol: alertSymbol.trim().toUpperCase(),
      targetPrice: priceNum,
      direction,
      note: note.trim() || undefined
    })

    if (success) {
      setIsCreating(false)
      setNote('')
    } else {
      setFormError('Failed to save alert to local database')
    }
  }

  const activeAlerts = alerts.filter((a) => !a.triggered)
  const triggeredAlerts = alerts.filter((a) => a.triggered)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        color: THEME_TOKENS.colors.textPrimary,
        userSelect: 'none'
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Price Alerts</span>
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 10,
              backgroundColor: THEME_TOKENS.colors.bgApp,
              color: THEME_TOKENS.colors.accent,
              fontWeight: 600
            }}
          >
            {activeAlerts.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => (isCreating ? setIsCreating(false) : handleOpenCreate())}
          className="tv-btn active"
          style={{
            padding: '4px 8px',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{isCreating ? 'Cancel' : 'New Alert'}</span>
        </button>
      </div>

      {/* Create Alert Form Modal / Drawer */}
      {isCreating && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: 14,
            backgroundColor: THEME_TOKENS.colors.bgApp,
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}>
            Create New Alert
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                Symbol
              </label>
              <input
                type="text"
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value.toUpperCase())}
                className="tv-input"
                style={{ fontSize: 12, padding: '4px 8px' }}
                placeholder="Live symbol"
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                Condition
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'above' | 'below' | 'cross')}
                className="tv-input"
                style={{ fontSize: 12, padding: '4px 6px' }}
              >
                <option value="above">Crossing Above</option>
                <option value="below">Crossing Below</option>
                <option value="cross">Touching / Crossing</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Target Price (
              {prices[alertSymbol]?.price
                ? `Current: $${prices[alertSymbol].price.toFixed(2)}`
                : 'USD'}
              )
            </label>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="tv-input"
              style={{ fontSize: 12, padding: '4px 8px' }}
              placeholder="e.g. 68000"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
              Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="tv-input"
              style={{ fontSize: 12, padding: '4px 8px' }}
              placeholder="e.g. Support retest / break"
            />
          </div>

          {formError && (
            <div style={{ fontSize: 11, color: THEME_TOKENS.colors.bearish }}>{formError}</div>
          )}

          <button
            type="submit"
            className="tv-btn active"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              justifyContent: 'center',
              backgroundColor: THEME_TOKENS.colors.accent,
              color: '#ffffff'
            }}
          >
            Save Alert
          </button>
        </form>
      )}

      {/* Alerts Scroll List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {isLoading && alerts.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: 12
            }}
          >
            Loading price alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '70%',
              gap: 12,
              color: THEME_TOKENS.colors.textSecondary,
              textAlign: 'center'
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ opacity: 0.4 }}
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <div style={{ fontSize: 12, maxWidth: 180 }}>
              No price alerts set. Click &quot;New Alert&quot; to monitor live levels.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Active Alerts Section */}
            {activeAlerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: THEME_TOKENS.colors.textSecondary,
                    letterSpacing: 0.6
                  }}
                >
                  Active Watch ({activeAlerts.length})
                </div>
                {activeAlerts.map((alert) => {
                  const currentQuote = prices[alert.symbol]
                  return (
                    <div
                      key={alert.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        backgroundColor: THEME_TOKENS.colors.bgApp,
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          flex: 1,
                          minWidth: 0
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: THEME_TOKENS.colors.textBright
                            }}
                          >
                            {alert.symbol}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              backgroundColor:
                                alert.direction === 'above'
                                  ? 'rgba(8, 153, 129, 0.15)'
                                  : alert.direction === 'below'
                                    ? 'rgba(242, 54, 69, 0.15)'
                                    : 'rgba(41, 98, 255, 0.15)',
                              color:
                                alert.direction === 'above'
                                  ? THEME_TOKENS.colors.bullish
                                  : alert.direction === 'below'
                                    ? THEME_TOKENS.colors.bearish
                                    : THEME_TOKENS.colors.accent,
                              fontWeight: 600
                            }}
                          >
                            {alert.direction === 'above'
                              ? '▲ Above'
                              : alert.direction === 'below'
                                ? '▼ Below'
                                : '◆ Cross'}
                          </span>
                        </div>

                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}
                        >
                          <span
                            style={{
                              color: THEME_TOKENS.colors.textBright,
                              fontFamily: 'monospace',
                              fontWeight: 600
                            }}
                          >
                            Target: ${alert.targetPrice.toLocaleString()}
                          </span>
                          {currentQuote && (
                            <span
                              style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 10 }}
                            >
                              (Now: ${currentQuote.price.toFixed(2)})
                            </span>
                          )}
                        </div>

                        {alert.note && (
                          <div
                            style={{
                              fontSize: 10,
                              color: THEME_TOKENS.colors.textSecondary,
                              fontStyle: 'italic',
                              marginTop: 1
                            }}
                          >
                            {alert.note}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteAlert(alert.id)}
                        className="tv-btn"
                        title="Delete Alert"
                        style={{ padding: 5, color: THEME_TOKENS.colors.textSecondary }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Triggered Alerts History Section */}
            {triggeredAlerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: THEME_TOKENS.colors.textSecondary,
                    letterSpacing: 0.6
                  }}
                >
                  Triggered History ({triggeredAlerts.length})
                </div>
                {triggeredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: 0.75
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: THEME_TOKENS.colors.textSecondary
                          }}
                        >
                          {alert.symbol}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 4,
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            color: THEME_TOKENS.colors.textSecondary
                          }}
                        >
                          Triggered
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: THEME_TOKENS.colors.textSecondary,
                          fontFamily: 'monospace'
                        }}
                      >
                        ${alert.targetPrice.toLocaleString()} •{' '}
                        {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleTimeString() : ''}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteAlert(alert.id)}
                      className="tv-btn"
                      title="Clear from history"
                      style={{ padding: 4, color: THEME_TOKENS.colors.textSecondary }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
