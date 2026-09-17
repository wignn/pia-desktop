import React, { useState, useEffect } from 'react'
import type { YieldPoint } from '@shared/types'

export const YieldCurveWidget: React.FC = () => {
  const [points, setPoints] = useState<YieldPoint[]>([])
  const [spread2s10s, setSpread2s10s] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    Promise.all([
      window.api.fixedIncome.getYieldCurve(),
      window.api.fixedIncome.getSpreads()
    ])
      .then(([curveRes, spreadsRes]) => {
        if (cancelled) return
        const pts = Array.isArray(curveRes) ? curveRes : (curveRes as any)?.points || []
        setPoints(pts)

        if (Array.isArray(spreadsRes)) {
          const s = spreadsRes.find((item) => item.name === '2Y-10Y' || item.name === '2s10s')
          if (s) setSpread2s10s(s.value)
        } else if (spreadsRes && typeof (spreadsRes as any)['2s10s'] === 'number') {
          setSpread2s10s((spreadsRes as any)['2s10s'])
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const tenorOrder = ['1M', '2M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']
  const sortedPoints = [...points].sort((a, b) => {
    const idxA = tenorOrder.indexOf(a.tenor)
    const idxB = tenorOrder.indexOf(b.tenor)
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#131722', padding: '10px 14px', overflowY: 'auto' }}>
      {/* Header Stat: 2s10s Spread */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #2a2e39', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: '#787b86', textTransform: 'uppercase', fontWeight: 600 }}>2Y-10Y Benchmark Spread</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: spread2s10s !== null && spread2s10s >= 0 ? '#089981' : '#f23645' }}>
            {spread2s10s !== null ? `${spread2s10s >= 0 ? '+' : ''}${spread2s10s.toFixed(2)} bps` : '-- bps'}
          </div>
        </div>
        <div style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, backgroundColor: spread2s10s !== null && spread2s10s < 0 ? 'rgba(242, 54, 69, 0.2)' : 'rgba(8, 153, 129, 0.2)', color: spread2s10s !== null && spread2s10s < 0 ? '#f23645' : '#089981', fontWeight: 700 }}>
          {spread2s10s !== null && spread2s10s < 0 ? 'INVERTED CURVE' : 'NORMAL SLOPE'}
        </div>
      </div>

      {isLoading && <div style={{ fontSize: 11, color: '#787b86', textAlign: 'center', padding: 20 }}>Loading treasury yields...</div>}

      {/* Tenor Rates Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
        {sortedPoints.map((pt) => {
          const chg = pt.previousYield !== undefined ? (pt.yield - pt.previousYield) * 100 : 0
          const isPos = chg >= 0
          return (
            <div
              key={pt.tenor}
              style={{
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: 4,
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <span style={{ fontSize: 10, color: '#787b86', fontWeight: 600 }}>{pt.tenor}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{pt.yield.toFixed(2)}%</span>
              <span style={{ fontSize: 9, color: isPos ? '#089981' : '#f23645' }}>
                {isPos ? '+' : ''}{chg.toFixed(1)} bp
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
