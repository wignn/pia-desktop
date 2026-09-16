import React, { useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '../../stores/useMarketStore'
import { THEME_TOKENS } from '../../theme/tokens'
import type { SecFilingItemData } from '@shared/types'

export const SecFilingsPanel: React.FC = () => {
  const { symbol, setSymbol } = useMarketStore()
  const [filings, setFilings] = useState<SecFilingItemData[]>([])
  const [selectedForm, setSelectedForm] = useState<string>('ALL')
  const [filterBySymbol, setFilterBySymbol] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadFilings = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoading(true)
        const data = await window.api.sec.getFilings({
          symbol: filterBySymbol ? (symbol ?? undefined) : undefined,
          formType: selectedForm !== 'ALL' ? selectedForm : undefined
        })
        setFilings(data)
      } catch (err) {
        console.error('[SecFilingsPanel] Failed to fetch SEC filings:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [symbol, filterBySymbol, selectedForm]
  )

  useEffect(() => {
    let cancelled = false
    window.api.sec
      .getFilings({
        symbol: filterBySymbol ? (symbol ?? undefined) : undefined,
        formType: selectedForm !== 'ALL' ? selectedForm : undefined
      })
      .then((data) => {
        if (!cancelled) {
          setFilings(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[SecFilingsPanel] Failed to fetch SEC filings:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [symbol, filterBySymbol, selectedForm])

  const handleOpenReport = (url?: string): void => {
    if (!url) return
    window.api.system.openExternal(url).catch((err) => {
      console.error('Failed to open SEC report URL:', err)
    })
  }

  const getFormColor = (form: string): string => {
    switch (form) {
      case '10-K':
        return THEME_TOKENS.colors.accent
      case '10-Q':
        return '#38bdf8'
      case '8-K':
        return '#f97316'
      case '4':
        return '#ec4899' // Insider trade
      default:
        return THEME_TOKENS.colors.textSecondary
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME_TOKENS.colors.textBright }}>
          SEC EDGAR Filings
        </span>

        <button
          type="button"
          onClick={() => loadFilings(true)}
          className="tv-btn"
          title="Refresh SEC Filings"
          disabled={isLoading}
          style={{ padding: 4 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              animation: isLoading ? 'spin 1s linear infinite' : 'none'
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgApp,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Symbol toggle */}
          <button
            type="button"
            onClick={() => setFilterBySymbol(!filterBySymbol)}
            className={`tv-btn ${filterBySymbol ? 'active' : ''}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >
            {filterBySymbol ? `Symbol: ${symbol}` : 'All Symbols'}
          </button>

          <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
            {filings.length} Filings
          </span>
        </div>

        {/* Form Type Pills */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {['ALL', '10-K', '10-Q', '8-K', '4'].map((form) => (
            <button
              key={form}
              type="button"
              onClick={() => setSelectedForm(form)}
              className={`tv-btn ${selectedForm === form ? 'active' : ''}`}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                whiteSpace: 'nowrap'
              }}
            >
              {form === '4' ? 'Form 4 (Insider)' : form}
            </button>
          ))}
        </div>
      </div>

      {/* Filings List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {filings.length === 0 && !isLoading && (
          <div
            style={{ textAlign: 'center', color: THEME_TOKENS.colors.textSecondary, padding: 24 }}
          >
            No SEC filings found for criteria.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filings.map((f) => (
            <div
              key={f.id}
              style={{
                backgroundColor: THEME_TOKENS.colors.bgApp,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setSymbol(f.symbol)}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: THEME_TOKENS.colors.bgActive,
                      color: THEME_TOKENS.colors.accent,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {f.symbol}
                  </button>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: `${getFormColor(f.formType)}22`,
                      color: getFormColor(f.formType)
                    }}
                  >
                    {f.formType}
                  </span>
                  {f.isInsiderTrade && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: 2,
                        backgroundColor: '#ec489922',
                        color: '#ec4899',
                        textTransform: 'uppercase'
                      }}
                    >
                      Insider
                    </span>
                  )}
                </div>

                <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  {f.filedDate}
                </span>
              </div>

              <div
                style={{
                  fontWeight: 600,
                  color: THEME_TOKENS.colors.textBright,
                  fontSize: 12,
                  marginBottom: 4
                }}
              >
                {f.title}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: THEME_TOKENS.colors.textSecondary,
                  lineHeight: 1.4,
                  marginBottom: 6
                }}
              >
                {f.description}
              </div>

              {f.reportUrl && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenReport(f.reportUrl)}
                    className="tv-btn"
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      color: THEME_TOKENS.colors.accent
                    }}
                  >
                    View Official EDGAR Report ↗
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
