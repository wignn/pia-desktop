import React, { useState, useEffect } from 'react'
import { useMarketStore } from '../../../stores/useMarketStore'

const FX_PAIRS = ['DXY', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD']

export const DxyMacroWidget: React.FC = () => {
  const prices = useMarketStore((state) => state.prices)
  const [dxyQuote, setDxyQuote] = useState<{ price: number; change: number }>({
    price: 104.25,
    change: 0.15
  })

  useEffect(() => {
    // If DXY exists in prices store, update it
    if (prices['DXY']?.price) {
      setDxyQuote({
        price: prices['DXY'].price,
        change: prices['DXY'].change24hPercent || 0
      })
    }
  }, [prices])

  const isDxyPositive = dxyQuote.change >= 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#131722',
        padding: '10px 14px',
        overflowY: 'auto'
      }}
    >
      {/* DXY Big Stat Card */}
      <div
        style={{
          padding: '10px 12px',
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: 6,
          marginBottom: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#787b86' }}>
            US DOLLAR INDEX (DXY)
          </span>
          <span
            style={{ fontSize: 10, fontWeight: 700, color: isDxyPositive ? '#089981' : '#f23645' }}
          >
            {isDxyPositive ? '▲' : '▼'} {Math.abs(dxyQuote.change).toFixed(2)}%
          </span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
          {dxyQuote.price.toFixed(2)}
        </div>
      </div>

      {/* FX Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 6
        }}
      >
        {FX_PAIRS.filter((p) => p !== 'DXY').map((sym) => {
          const q = prices[sym]
          const price = q?.price !== undefined ? q.price : 1.085
          const chg = q?.change24hPercent !== undefined ? q.change24hPercent : 0.05
          const isPos = chg >= 0
          return (
            <div
              key={sym}
              style={{
                backgroundColor: '#181d28',
                border: '1px solid #2a2e39',
                borderRadius: 4,
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <span style={{ fontSize: 10, color: '#787b86', fontWeight: 600 }}>{sym}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                {price >= 100 ? price.toFixed(2) : price.toFixed(4)}
              </span>
              <span style={{ fontSize: 9, color: isPos ? '#089981' : '#f23645', fontWeight: 600 }}>
                {isPos ? '+' : ''}
                {chg.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
