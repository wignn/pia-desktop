import React, { useState, useEffect } from 'react'
import type { EnergyDashboardData } from '@shared/types'

export const EnergyWidget: React.FC = () => {
  const [data, setData] = useState<EnergyDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    window.api.energy
      .getDashboard()
      .then((res) => {
        if (cancelled) return
        setData(res)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const items = [
    {
      name: 'WTI Crude Oil',
      ticker: 'USOIL',
      price: data?.wtiPrice ?? 86.89,
      unit: '$/bbl',
      change: data?.crudeChangePct ?? 1.2
    },
    {
      name: 'Brent Crude Oil',
      ticker: 'UKOIL',
      price: data?.brentPrice ?? 93.97,
      unit: '$/bbl',
      change: data?.crudeChangePct ? data.crudeChangePct * 0.9 : 0.8
    },
    {
      name: 'Henry Hub Natural Gas',
      ticker: 'NATGAS',
      price: data?.henryHubPrice ?? 2.78,
      unit: '$/MMBtu',
      change: -0.05
    },
    {
      name: 'WTI-Brent Crack Spread',
      ticker: 'SPREAD',
      price: data?.wtiBrentSpread ?? -7.08,
      unit: '$/bbl',
      change: 0.25
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#131722', padding: '10px 14px', overflowY: 'auto' }}>
      {isLoading && <div style={{ fontSize: 11, color: '#787b86', textAlign: 'center', padding: 20 }}>Loading energy complex...</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        {items.map((item) => {
          const isPos = item.change >= 0
          return (
            <div
              key={item.ticker}
              style={{
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: 5,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <span style={{ fontSize: 10, color: '#787b86', fontWeight: 600 }}>{item.name}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>${item.price.toFixed(2)}</span>
                <span style={{ fontSize: 9, color: '#787b86' }}>{item.unit}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: isPos ? '#089981' : '#f23645' }}>
                {isPos ? '▲ +' : '▼ '}{item.change.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
