/**
 * PIA Terminal - Market Heatmap View (TradingView Replica)
 * Implements a recursive inward spiral treemap for global assets and IDX stocks.
 * ponytail: DOM tile rendering with CSS transitions; upgrade to WebGL if symbol count > 10,000.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Plus,
  Minus,
  Maximize2,
  Search,
  RotateCcw,
  SlidersHorizontal,
  Flame,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWatchlistStore } from '../../stores/useWatchlistStore'
import { useTabStore } from '../../stores/useTabStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { SymbolLogo } from '../common/SymbolLogo'
import {
  computeSpiralTreemap,
  getHeatmapColor,
  type HeatmapItem,
  type TreemapNode
} from '../../utils/spiral-treemap'
import {
  IDX_STOCKS_DATASET,
  CRYPTO_HEATMAP_DATASET,
  FOREX_METALS_DATASET,
  US_STOCKS_DATASET
} from '../../utils/heatmap-data'

type MarketFilter = 'idx' | 'crypto' | 'forex' | 'us' | 'all' | 'watchlist'
type SizingMetric = 'marketCap' | 'volume24h'

export const MarketHeatmapView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 750 })
  const [activeFilter, setActiveFilter] = useState<MarketFilter>('idx')
  const [sizingMetric, setSizingMetric] = useState<SizingMetric>('marketCap')
  const [searchQuery, setSearchQuery] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const livePrices = useMarketStore((state) => state.prices)
  const liveSymbols = useMarketStore((state) => state.symbols)
  const setSymbol = useMarketStore((state) => state.setSymbol)
  const { watchlists, activeListId } = useWatchlistStore()
  const { tabs, setActiveTabId } = useTabStore()

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateSize = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        })
      }
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Resolve active raw dataset based on selected market filter
  const baseItems = useMemo((): HeatmapItem[] => {
    switch (activeFilter) {
      case 'idx':
        return IDX_STOCKS_DATASET
      case 'crypto':
        return CRYPTO_HEATMAP_DATASET
      case 'forex':
        return FOREX_METALS_DATASET
      case 'us':
        return US_STOCKS_DATASET
      case 'watchlist': {
        const activeList = watchlists.find((w) => w.id === activeListId)
        if (!activeList || activeList.symbols.length === 0) {
          return IDX_STOCKS_DATASET.slice(0, 20)
        }
        return activeList.symbols.map((sym, idx) => {
          const found =
            IDX_STOCKS_DATASET.find((i) => i.symbol === sym) ||
            CRYPTO_HEATMAP_DATASET.find((i) => i.symbol === sym) ||
            FOREX_METALS_DATASET.find((i) => i.symbol === sym) ||
            US_STOCKS_DATASET.find((i) => i.symbol === sym)
          if (found) return found
          const info = liveSymbols.find((s) => s.symbol === sym)
          return {
            symbol: sym,
            name: info?.name || sym,
            category: (info?.category as any) || 'crypto',
            value: 100 / (idx + 1),
            change24hPercent: 0
          }
        })
      }
      case 'all':
      default: {
        return [
          ...IDX_STOCKS_DATASET.slice(0, 30),
          ...CRYPTO_HEATMAP_DATASET.slice(0, 20),
          ...US_STOCKS_DATASET.slice(0, 15),
          ...FOREX_METALS_DATASET.slice(0, 8)
        ]
      }
    }
  }, [activeFilter, watchlists, activeListId, liveSymbols])

  // Merge live price ticks into items and apply sizing metric
  const processedItems = useMemo((): HeatmapItem[] => {
    return baseItems.map((item) => {
      const quote = livePrices[item.symbol]
      const change24hPercent = quote?.change24hPercent ?? item.change24hPercent
      const price = quote?.price ?? item.price
      const volume24h = quote?.volume24h ?? item.volume24h
      const value = sizingMetric === 'volume24h' ? (volume24h || item.value) : (item.marketCap || item.value)

      return {
        ...item,
        price,
        volume24h,
        change24hPercent,
        value: Math.max(1, value)
      }
    })
  }, [baseItems, livePrices, sizingMetric])

  // Filter items by search query if any
  const filteredItems = useMemo((): HeatmapItem[] => {
    if (!searchQuery.trim()) return processedItems
    const q = searchQuery.trim().toUpperCase()
    return processedItems.filter(
      (item) => item.symbol.toUpperCase().includes(q) || item.name.toUpperCase().includes(q)
    )
  }, [processedItems, searchQuery])

  // Compute spiral treemap layout
  const treemapNodes = useMemo((): TreemapNode[] => {
    return computeSpiralTreemap(filteredItems, dimensions.width, dimensions.height)
  }, [filteredItems, dimensions.width, dimensions.height])

  // Handle tile click: switch active symbol and return to chart view
  const handleSelectSymbol = (symbol: string): void => {
    setSymbol(symbol)
    const chartTab = tabs.find((t) => t.type === 'chart')
    if (chartTab) {
      setActiveTabId(chartTab.id)
    }
  }

  // Zoom handlers
  const handleZoomIn = (): void => setZoomLevel((z) => Math.min(z + 0.25, 3))
  const handleZoomOut = (): void => setZoomLevel((z) => Math.max(z - 0.25, 0.5))
  const handleResetZoom = (): void => {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0d14',
        color: '#d1d4dc',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none'
      }}
      onMouseMove={(e) => {
        setMousePos({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0e121b',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 10
        }}
      >
        {/* Left: Title & Market Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <Flame size={16} color={THEME_TOKENS.colors.accent} />
            <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff', letterSpacing: '0.3px' }}>
              MARKET HEATMAP
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 6,
              padding: 2,
              gap: 2
            }}
          >
            {[
              { id: 'idx', label: 'Saham IDX' },
              { id: 'crypto', label: 'Crypto' },
              { id: 'forex', label: 'Forex & Emas' },
              { id: 'us', label: 'Saham US' },
              { id: 'all', label: 'Semua Pasar' },
              { id: 'watchlist', label: 'Watchlist' }
            ].map((f) => {
              const active = activeFilter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setActiveFilter(f.id as MarketFilter)
                    setHoveredNode(null)
                  }}
                  style={{
                    backgroundColor: active ? THEME_TOKENS.colors.accent : 'transparent',
                    color: active ? '#ffffff' : '#848e9c',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Sizing Metric & Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#848e9c' }}>Ukuran:</span>
            <select
              value={sizingMetric}
              onChange={(e) => setSizingMetric(e.target.value as SizingMetric)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: '#d1d4dc',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="marketCap">Market Cap</option>
              <option value="volume24h">Volume 24 Jam</option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 4,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '2px 8px',
              gap: 6
            }}
          >
            <Search size={13} color="#848e9c" />
            <input
              type="text"
              placeholder="Cari emiten..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: 11,
                outline: 'none',
                width: 110
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Heatmap Canvas / Tiles Area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#0a0d14'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: 'top left',
            transition: 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)'
          }}
        >
          {treemapNodes.map((node) => {
            const { bg, text } = getHeatmapColor(node.change24hPercent)
            const isHovered = hoveredNode?.symbol === node.symbol
            const isTiny = node.width < 45 || node.height < 36
            const isMedium = !isTiny && (node.width < 85 || node.height < 70)
            const isLarge = !isTiny && !isMedium

            return (
              <div
                key={node.symbol}
                onClick={() => handleSelectSymbol(node.symbol)}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  backgroundColor: bg,
                  border: '1px solid #131722',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: isTiny ? 2 : 6,
                  overflow: 'hidden',
                  zIndex: isHovered ? 5 : 1,
                  boxShadow: isHovered ? '0 0 10px rgba(255, 255, 255, 0.35)' : 'none',
                  filter: isHovered ? 'brightness(1.15)' : 'none',
                  transition: 'filter 0.12s ease'
                }}
              >
                {/* Large tile: Full Logo + Ticker + Percentage */}
                {isLarge && (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      <SymbolLogo symbol={node.symbol} size={32} />
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: Math.min(16, Math.max(12, Math.floor(node.width / 6))),
                        color: text,
                        letterSpacing: '0.4px',
                        lineHeight: 1.2
                      }}
                    >
                      {node.symbol}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: Math.min(14, Math.max(11, Math.floor(node.width / 7))),
                        color: text,
                        marginTop: 2
                      }}
                    >
                      {node.change24hPercent > 0 ? `+${node.change24hPercent.toFixed(2)}%` : `${node.change24hPercent.toFixed(2)}%`}
                    </span>
                  </>
                )}

                {/* Medium tile: Logo + Ticker + Compact % */}
                {isMedium && (
                  <>
                    {node.height > 50 && (
                      <div style={{ marginBottom: 4 }}>
                        <SymbolLogo symbol={node.symbol} size={20} />
                      </div>
                    )}
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 12,
                        color: text,
                        lineHeight: 1.1
                      }}
                    >
                      {node.symbol}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 10,
                        color: text,
                        marginTop: 1
                      }}
                    >
                      {node.change24hPercent > 0 ? `+${node.change24hPercent.toFixed(1)}%` : `${node.change24hPercent.toFixed(1)}%`}
                    </span>
                  </>
                )}

                {/* Small / Micro tile: Just Logo or % */}
                {isTiny && (
                  <>
                    {node.width >= 24 && node.height >= 24 ? (
                      <SymbolLogo symbol={node.symbol} size={Math.min(18, Math.max(12, node.width - 6))} />
                    ) : null}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* 3. Floating Zoom Controls on the Right (TradingView Exact Replica) */}
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 24,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(26, 30, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 6,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
            zIndex: 20
          }}
        >
          <button
            type="button"
            title="Perbesar (Zoom In)"
            onClick={handleZoomIn}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#d1d4dc',
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            title="Perkecil (Zoom Out)"
            onClick={handleZoomOut}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#d1d4dc',
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            title="Reset Tampilan"
            onClick={handleResetZoom}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#d1d4dc',
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Maximize2 size={15} />
          </button>
        </div>

        {/* 4. Bottom-Left TradingView Style Terminal Logo */}
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.8px',
            pointerEvents: 'none',
            zIndex: 20
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 800,
              color: '#ffffff'
            }}
          >
            TV
          </div>
          <span>PIA TERMINAL HEATMAP</span>
        </div>
      </div>

      {/* 5. Rich Hover Tooltip (TradingView Style Card) */}
      {hoveredNode && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(mousePos.x + 16, window.innerWidth - 260),
            top: Math.min(mousePos.y + 16, window.innerHeight - 200),
            backgroundColor: 'rgba(20, 24, 35, 0.96)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: 8,
            padding: '12px 14px',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.65)',
            zIndex: 9999,
            pointerEvents: 'none',
            width: 230
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <SymbolLogo symbol={hoveredNode.symbol} size={28} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#ffffff' }}>
                {hoveredNode.symbol}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#848e9c',
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {hoveredNode.name}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            {hoveredNode.price !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#848e9c' }}>Harga Terakhir:</span>
                <span style={{ fontWeight: 600, color: '#ffffff' }}>
                  {hoveredNode.price >= 100 ? hoveredNode.price.toLocaleString() : hoveredNode.price}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#848e9c' }}>Perubahan 24 Jam:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: hoveredNode.change24hPercent >= 0 ? '#10b981' : '#f43f5e'
                }}
              >
                {hoveredNode.change24hPercent > 0 ? `+${hoveredNode.change24hPercent.toFixed(2)}%` : `${hoveredNode.change24hPercent.toFixed(2)}%`}
              </span>
            </div>
            {hoveredNode.volume24h !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#848e9c' }}>Volume 24 Jam:</span>
                <span style={{ color: '#d1d4dc' }}>
                  {hoveredNode.volume24h > 1000000000
                    ? `${(hoveredNode.volume24h / 1000000000).toFixed(2)}B`
                    : `${(hoveredNode.volume24h / 1000000).toFixed(2)}M`}
                </span>
              </div>
            )}
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                color: THEME_TOKENS.colors.accent,
                fontSize: 10,
                textAlign: 'center',
                fontWeight: 600
              }}
            >
              Klik untuk buka chart ↗
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
