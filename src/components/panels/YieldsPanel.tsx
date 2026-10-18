import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'
import type { YieldCurveResult, YieldSpreadResult } from '@shared/types'

export const YieldsPanel: React.FC = () => {
  const [curve, setCurve] = useState<YieldCurveResult | null>(null)
  const [spreads, setSpreads] = useState<YieldSpreadResult | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadYields = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true)
      const [cData, sData] = await Promise.all([
        window.api.fixedIncome.getYieldCurve(),
        window.api.fixedIncome.getSpreads()
      ])
      setCurve(cData)
      setSpreads(sData)
    } catch (err) {
      console.error('[YieldsPanel] Failed to fetch yield curve:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.fixedIncome.getYieldCurve(), window.api.fixedIncome.getSpreads()])
      .then(([cData, sData]) => {
        if (!cancelled) {
          setCurve(cData)
          setSpreads(sData)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[YieldsPanel] Failed to fetch yield curve:', err)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Generate SVG path for yield curve visualization
  const svgCurveData = useMemo(() => {
    if (!curve || curve.points.length < 2) return null
    const points = curve.points
    const width = 280
    const height = 110
    const padX = 20
    const padY = 15

    const yields = points.map((p) => p.yield)
    const minY = Math.floor(Math.min(...yields) * 2) / 2 - 0.2
    const maxY = Math.ceil(Math.max(...yields) * 2) / 2 + 0.2

    const getX = (idx: number): number => {
      return padX + (idx / (points.length - 1)) * (width - padX * 2)
    }

    const getY = (val: number): number => {
      return height - padY - ((val - minY) / (maxY - minY)) * (height - padY * 2)
    }

    const currentPath = points
      .map(
        (p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.yield).toFixed(1)}`
      )
      .join(' ')

    const prevPoints = points.filter((p) => p.previousYield !== undefined)
    const prevPath =
      prevPoints.length > 1
        ? prevPoints
            .map(
              (p, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.previousYield as number).toFixed(1)}`
            )
            .join(' ')
        : null

    return {
      width,
      height,
      currentPath,
      prevPath,
      minY,
      maxY,
      coords: points.map((p, idx) => ({
        tenor: p.tenor,
        yield: p.yield,
        x: getX(idx),
        y: getY(p.yield)
      }))
    }
  }, [curve])

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
          US Treasury Yield Curve
        </span>

        <button
          type="button"
          onClick={() => loadYields(true)}
          className="tv-btn"
          title="Refresh Yields"
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

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!isLoading && !curve && !spreads && (
          <div
            style={{ padding: 24, textAlign: 'center', color: THEME_TOKENS.colors.textSecondary }}
          >
            Live fixed-income data unavailable.
          </div>
        )}

        {/* Yield Curve Inversion Warning Banner */}
        {spreads && (
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.bgApp,
              padding: 10,
              borderRadius: 4,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              marginBottom: 12
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8
              }}
            >
              <span style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary }}>
                CURVE INVERSION (2Y-10Y)
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  backgroundColor: spreads.isInverted
                    ? `${THEME_TOKENS.colors.bearish}22`
                    : `${THEME_TOKENS.colors.bullish}22`,
                  color: spreads.isInverted
                    ? THEME_TOKENS.colors.bearish
                    : THEME_TOKENS.colors.bullish
                }}
              >
                {spreads.isInverted === undefined
                  ? 'Unavailable'
                  : spreads.isInverted
                    ? 'INVERTED'
                    : 'NORMAL'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  2Y-10Y Spread
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono,
                    color:
                      spreads.spread2Y10Y !== undefined && spreads.spread2Y10Y < 0
                        ? THEME_TOKENS.colors.bearish
                        : THEME_TOKENS.colors.bullish,
                    marginTop: 2
                  }}
                >
                  {spreads.spread2Y10Y === undefined
                    ? 'Unavailable'
                    : `${spreads.spread2Y10Y > 0 ? '+' : ''}${spreads.spread2Y10Y.toFixed(1)} bps`}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: THEME_TOKENS.colors.textSecondary }}>
                  3M-10Y Spread
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: THEME_TOKENS.typography?.fontMono,
                    color:
                      spreads.spread3M10Y !== undefined && spreads.spread3M10Y < 0
                        ? THEME_TOKENS.colors.bearish
                        : THEME_TOKENS.colors.bullish,
                    marginTop: 2
                  }}
                >
                  {spreads.spread3M10Y === undefined
                    ? 'Unavailable'
                    : `${spreads.spread3M10Y > 0 ? '+' : ''}${spreads.spread3M10Y.toFixed(1)} bps`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SVG Yield Curve Chart */}
        {svgCurveData && (
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.bgApp,
              padding: 8,
              borderRadius: 4,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              marginBottom: 12
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6
              }}
            >
              <span>Yield Curve Plot</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: THEME_TOKENS.colors.accent }}>— Current</span>
                {svgCurveData.prevPath && (
                  <span style={{ color: THEME_TOKENS.colors.textSecondary }}>-- Previous</span>
                )}
              </div>
            </div>

            <svg
              viewBox={`0 0 ${svgCurveData.width} ${svgCurveData.height}`}
              style={{ width: '100%', height: 110 }}
            >
              {/* Previous yield line (dashed) */}
              {svgCurveData.prevPath && (
                <path
                  d={svgCurveData.prevPath}
                  fill="none"
                  stroke={THEME_TOKENS.colors.textSecondary}
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity="0.6"
                />
              )}

              {/* Current yield line */}
              <path
                d={svgCurveData.currentPath}
                fill="none"
                stroke={THEME_TOKENS.colors.accent}
                strokeWidth="2.5"
              />

              {/* Tenor points */}
              {svgCurveData.coords.map((pt) => (
                <circle
                  key={pt.tenor}
                  cx={pt.x}
                  cy={pt.y}
                  r="3"
                  fill={THEME_TOKENS.colors.accent}
                />
              ))}
            </svg>
          </div>
        )}

        {/* Tenor Table */}
        {curve && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              Tenor Structure
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textSecondary,
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`
              }}
            >
              <span>TENOR</span>
              <span style={{ textAlign: 'right' }}>YIELD</span>
              <span style={{ textAlign: 'right' }}>CHANGE</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {curve.points.map((p) => {
                const diffBps =
                  p.previousYield !== undefined ? (p.yield - p.previousYield) * 100 : undefined
                const isUp = diffBps !== undefined && diffBps >= 0

                return (
                  <div
                    key={p.tenor}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      padding: '5px 8px',
                      fontSize: 11,
                      fontFamily: THEME_TOKENS.typography?.fontMono,
                      borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                      {p.tenor}
                    </span>
                    <span style={{ textAlign: 'right', color: THEME_TOKENS.colors.textPrimary }}>
                      {p.yield.toFixed(3)}%
                    </span>
                    <span
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color: isUp ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.bearish
                      }}
                    >
                      {diffBps === undefined
                        ? 'Unavailable'
                        : `${isUp ? '+' : ''}${diffBps.toFixed(1)} bps`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
