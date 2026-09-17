import React, { useState, useEffect } from 'react'
import type { OrderBookData } from '@shared/types'

export const OrderBookWidget: React.FC<{ symbol?: string }> = ({ symbol = 'XAUUSD' }) => {
  const [book, setBook] = useState<OrderBookData | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api.orderbook
      .get(symbol)
      .then((res) => {
        if (cancelled) return
        setBook(res)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [symbol])

  const asks = (book?.asks || []).slice(0, 7).reverse()
  const bids = (book?.bids || []).slice(0, 7)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#131722', padding: '8px 12px', fontSize: 11, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#787b86', fontSize: 10, fontWeight: 600, paddingBottom: 4, borderBottom: '1px solid #1e222d' }}>
        <span>PRICE</span>
        <span>SIZE</span>
        <span>TOTAL</span>
      </div>

      {/* Asks (Red) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '4px 0' }}>
        {asks.map((a, i) => (
          <div key={`a-${i}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#f23645', fontFamily: 'monospace' }}>
            <span>{a.price.toFixed(2)}</span>
            <span style={{ color: '#d1d4dc' }}>{a.size.toFixed(2)}</span>
            <span style={{ color: '#787b86' }}>{a.total !== undefined ? a.total.toFixed(2) : a.size.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Spread Bar */}
      <div style={{ padding: '4px 0', textAlign: 'center', backgroundColor: '#1e222d', color: '#ffffff', fontWeight: 700, borderRadius: 2, margin: '2px 0' }}>
        Spread: {book?.spread !== undefined ? book.spread.toFixed(2) : '0.15'}
      </div>

      {/* Bids (Green) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '4px 0' }}>
        {bids.map((b, i) => (
          <div key={`b-${i}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#089981', fontFamily: 'monospace' }}>
            <span>{b.price.toFixed(2)}</span>
            <span style={{ color: '#d1d4dc' }}>{b.size.toFixed(2)}</span>
            <span style={{ color: '#787b86' }}>{b.total !== undefined ? b.total.toFixed(2) : b.size.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
