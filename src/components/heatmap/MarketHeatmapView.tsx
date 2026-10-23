/**
 * PIA Terminal - Market Heatmap View
 * Inspired by Marketcalls Highcharts Treemap Heatmap and TradingView institutional terminals.
 * Uses standard Squarified Treemap layout with circular asset icons, centered price/change labels,
 * and high-contrast performance legend scale.
 * ponytail: DOM tile rendering with CSS transforms; upgrade to Canvas/WebGL if node count exceeds 5,000.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Plus,
  Minus,
  Maximize2,
  Search,
  Flame,
  LayoutGrid
} from 'lucide-react'
import { useMarketStore } from '../../stores/useMarketStore'
import { useWatchlistStore } from '../../stores/useWatchlistStore'
import { useTabStore } from '../../stores/useTabStore'
import { THEME_TOKENS } from '../../theme/tokens'
import { SymbolLogo } from '../common/SymbolLogo'
import {
  computeSquarifiedTreemap,
  computeSpiralTreemap,
  getHighchartsHeatmapColor,
  HIGHCHARTS_HEATMAP_COLOR_STOPS,
  type HeatmapItem,
  type TreemapNode
} from '../../utils/spiral-treemap'
import {
  IDX_STOCKS_DATASET,
  CRYPTO_HEATMAP_DATASET,
  FOREX_METALS_DATASET,
  US_STOCKS_DATASET,
  CHINA_ADR_DATASET,
  INDICES_DATASET
} from '../../utils/heatmap-data'

type MarketFilter = 'all' | 'us' | 'china' | 'indices' | 'idx' | 'crypto' | 'forex' | 'watchlist'
type SizingMetric = 'marketCap' | 'volume24h'
type LayoutMode = 'squarified' | 'spiral'

function formatPrice(price?: number, category?: string): string {
  if (price === undefined || price === null || isNaN(price)) return '-'
  if (category === 'stocks_idx') {
    return price.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  }
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (price >= 1) {
    return price.toFixed(2)
  }
  return price.toFixed(4)
}

function formatLargeNumber(val?: number): string {
  if (!val || isNaN(val)) return '-'
  if (val >= 1e12) return `${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`
  return val.toLocaleString()
}

export const MarketHeatmapView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 750 })
  const [activeFilter, setActiveFilter] = useState<MarketFilter>('all')
  const [sizingMetric, setSizingMetric] = useState<SizingMetric>('marketCap')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('squarified')
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
    // Seed with comprehensive catalogued items
    const knownItemMap = new Map<string, HeatmapItem>()
    const allPredefined: HeatmapItem[] = [
      ...US_STOCKS_DATASET,
      ...CHINA_ADR_DATASET,
      ...INDICES_DATASET,
      ...IDX_STOCKS_DATASET,
      ...CRYPTO_HEATMAP_DATASET,
      ...FOREX_METALS_DATASET
    ]
    for (const item of allPredefined) {
      knownItemMap.set(item.symbol, item)
    }

    // Dynamic discovery from liveSymbols & livePrices
    for (const s of liveSymbols) {
      if (!s.symbol || knownItemMap.has(s.symbol)) continue
      const quote = livePrices[s.symbol]
      const price = quote?.price
      if (!price || price <= 0) continue

      let cat: HeatmapItem['category'] = 'stocks_us'
      if (s.category === 'indices') cat = 'indices'
      else if (s.category === 'crypto') cat = 'crypto'
      else if (s.category === 'forex') cat = 'forex'
      else if (s.category === 'metals') cat = 'metals'
      else if (s.category === 'commodities') cat = 'commodities'
      else if (s.exchange === 'IDX') cat = 'stocks_idx'

      knownItemMap.set(s.symbol, {
        symbol: s.symbol,
        name: s.name && s.name !== s.symbol ? s.name : s.symbol,
        category: cat,
        value: Math.max(10, Math.min(price * (quote?.volume24h ? Math.log10(quote.volume24h) : 10), 1000)),
        change24hPercent: quote?.change24hPercent ?? 0,
        price,
        volume24h: quote?.volume24h
      })
    }

    switch (activeFilter) {
      case 'us': {
        const items = US_STOCKS_DATASET.map((i) => knownItemMap.get(i.symbol) || i)
        for (const s of liveSymbols) {
          if (s.category === 'stocks' && s.exchange === 'US' && !items.some((x) => x.symbol === s.symbol)) {
            const item = knownItemMap.get(s.symbol)
            if (item) items.push(item)
          }
        }
        return items
      }
      case 'china':
        return CHINA_ADR_DATASET.map((i) => knownItemMap.get(i.symbol) || i)
      case 'indices': {
        const items = [...INDICES_DATASET]
        for (const s of liveSymbols) {
          if (s.category === 'indices' && !items.some((x) => x.symbol === s.symbol)) {
            const item = knownItemMap.get(s.symbol)
            if (item) items.push(item)
          }
        }
        return items
      }
      case 'idx':
        return IDX_STOCKS_DATASET.map((i) => knownItemMap.get(i.symbol) || i)
      case 'crypto':
        return CRYPTO_HEATMAP_DATASET.map((i) => knownItemMap.get(i.symbol) || i)
      case 'forex':
        return FOREX_METALS_DATASET.map((i) => knownItemMap.get(i.symbol) || i)
      case 'watchlist': {
        const activeList = watchlists.find((w) => w.id === activeListId)
        if (!activeList || activeList.symbols.length === 0) {
          return US_STOCKS_DATASET.slice(0, 20)
        }
        return activeList.symbols.map((sym, idx) => {
          const found = knownItemMap.get(sym)
          if (found) return found
          const info = liveSymbols.find((s) => s.symbol === sym)
          const quote = livePrices[sym]
          return {
            symbol: sym,
            name: info?.name || sym,
            category: (info?.category as any) || 'stocks_us',
            value: 100 / (idx + 1),
            change24hPercent: quote?.change24hPercent ?? 0,
            price: quote?.price
          }
        })
      }
      case 'all':
      default: {
        return [
          ...US_STOCKS_DATASET,
          ...CHINA_ADR_DATASET,
          ...INDICES_DATASET,
          ...IDX_STOCKS_DATASET.filter((i) => livePrices[i.symbol]?.price !== undefined).slice(0, 15),
          ...CRYPTO_HEATMAP_DATASET.slice(0, 15),
          ...FOREX_METALS_DATASET.slice(0, 8)
        ]
      }
    }
  }, [activeFilter, watchlists, activeListId, liveSymbols, livePrices])

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

  // Compute treemap layout (Squarified Highcharts style or Spiral TradingView style)
  const treemapNodes = useMemo((): TreemapNode[] => {
    if (layoutMode === 'squarified') {
      return computeSquarifiedTreemap(filteredItems, dimensions.width, dimensions.height)
    }
    return computeSpiralTreemap(filteredItems, dimensions.width, dimensions.height)
  }, [filteredItems, dimensions.width, dimensions.height, layoutMode])

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
        backgroundColor: '#121212',
        color: '#ffffff',
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
          backgroundColor: '#161922',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 10
        }}
      >
        {/* Left: Title & Market Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <Flame size={16} color={THEME_TOKENS.colors.accent} />
            <span style={{ fontWeight: 700, fontSize: 13, color: '#ffffff', letterSpacing: '0.4px' }}>
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
              { id: 'all', label: 'All Markets' },
              { id: 'us', label: 'US Stocks' },
              { id: 'china', label: 'China & Asia' },
              { id: 'indices', label: 'Indices (JP/CN/US)' },
              { id: 'idx', label: 'IDX Stocks' },
              { id: 'crypto', label: 'Crypto' },
              { id: 'forex', label: 'Forex & Metals' },
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

        {/* Right: Layout Toggle, Sizing Metric & Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#848e9c' }}>Layout:</span>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
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
              <option value="squarified">Squarified (Highcharts)</option>
              <option value="spiral">Spiral (TradingView)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#848e9c' }}>Size:</span>
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
              <option value="volume24h">24h Volume</option>
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
              placeholder="Search symbol..."
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

      {/* 2. Highcharts Style Heatmap Legend Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '6px 16px',
          backgroundColor: '#121212',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontSize: 10, color: '#848e9c', marginRight: 4, fontWeight: 500 }}>
          24h Change:
        </span>
        {HIGHCHARTS_HEATMAP_COLOR_STOPS.map(([val, col], idx) => (
          <span
            key={idx}
            style={{
              backgroundColor: col,
              color: val === 0 ? '#d1d4dc' : '#ffffff',
              fontWeight: 700,
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 38,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
            }}
          >
            {val > 0 ? `+${val}%` : `${val}%`}
          </span>
        ))}
      </div>

      {/* 3. Heatmap Canvas / Tiles Area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#121212'
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
            const { bg, text } = getHighchartsHeatmapColor(node.change24hPercent)
            const isHovered = hoveredNode?.symbol === node.symbol
            const minDimension = Math.min(node.width, node.height)
            const imgSize = Math.min(48, Math.max(16, Math.floor(minDimension * 0.38)))
            const fontSize = Math.max(9, Math.min(14, Math.floor(minDimension / 7)))
            const priceFormatted = formatPrice(node.price, node.category)
            const changeFormatted =
              node.change24hPercent > 0
                ? `+${node.change24hPercent.toFixed(2)}%`
                : `${node.change24hPercent.toFixed(2)}%`

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
                  border: '1px solid #121212',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: minDimension < 40 ? 1 : 4,
                  overflow: 'hidden',
                  zIndex: isHovered ? 5 : 1,
                  boxShadow: isHovered ? '0 0 12px rgba(255, 255, 255, 0.4)' : 'none',
                  filter: isHovered ? 'brightness(1.15)' : 'none',
                  transition: 'filter 0.12s ease'
                }}
              >
                {/* Highcharts style circular icon + symbol + price + change% */}
                {minDimension >= 52 ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                      padding: 2,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div
                      style={{
                        borderRadius: '50%',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        marginBottom: 3
                      }}
                    >
                      <SymbolLogo symbol={node.symbol} size={imgSize} />
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize,
                        color: text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        textAlign: 'center',
                        lineHeight: 1.2
                      }}
                    >
                      {node.symbol}
                    </div>
                    <div
                      style={{
                        fontSize: Math.max(8, Math.floor(fontSize * 0.88)),
                        color: text,
                        opacity: 0.95,
                        textAlign: 'center',
                        lineHeight: 1.2
                      }}
                    >
                      {priceFormatted}
                    </div>
                    <div
                      style={{
                        fontSize: Math.max(8, Math.floor(fontSize * 0.88)),
                        fontWeight: 700,
                        color: text,
                        textAlign: 'center',
                        lineHeight: 1.2
                      }}
                    >
                      {changeFormatted}
                    </div>
                  </div>
                ) : minDimension >= 36 ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                      padding: 1
                    }}
                  >
                    <div
                      style={{
                        borderRadius: '50%',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 1
                      }}
                    >
                      <SymbolLogo symbol={node.symbol} size={Math.min(20, minDimension - 14)} />
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 10,
                        color: text,
                        textAlign: 'center',
                        lineHeight: 1.1
                      }}
                    >
                      {node.symbol}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: text,
                        textAlign: 'center',
                        lineHeight: 1.1
                      }}
                    >
                      {changeFormatted}
                    </div>
                  </div>
                ) : minDimension >= 20 ? (
                  <div
                    style={{
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <SymbolLogo symbol={node.symbol} size={Math.min(16, minDimension - 4)} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* 4. Floating Zoom Controls */}
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
            title="Zoom In"
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
            title="Zoom Out"
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
            title="Reset View"
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

        {/* 5. Bottom-Left Terminal Indicator */}
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
            HC
          </div>
          <span>HIGHCHARTS HEATMAP</span>
        </div>
      </div>

      {/* 6. Rich Highcharts Style Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(mousePos.x + 16, window.innerWidth - 260),
            top: Math.min(mousePos.y + 16, window.innerHeight - 200),
            backgroundColor: 'rgba(20, 24, 35, 0.96)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: 6,
            padding: '10px 14px',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.65)',
            zIndex: 9999,
            pointerEvents: 'none',
            width: 230
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <SymbolLogo symbol={hoveredNode.symbol} size={28} />
            </div>
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
                <span style={{ color: '#848e9c' }}>Price:</span>
                <span style={{ fontWeight: 600, color: '#ffffff' }}>
                  {formatPrice(hoveredNode.price, hoveredNode.category)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#848e9c' }}>Change:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: hoveredNode.change24hPercent >= 0 ? '#47d147' : '#ff1a1a'
                }}
              >
                {hoveredNode.change24hPercent > 0
                  ? `+${hoveredNode.change24hPercent.toFixed(2)}%`
                  : `${hoveredNode.change24hPercent.toFixed(2)}%`}
              </span>
            </div>
            {hoveredNode.marketCap !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#848e9c' }}>Market Cap:</span>
                <span style={{ color: '#d1d4dc' }}>
                  {formatLargeNumber(hoveredNode.marketCap)}
                </span>
              </div>
            )}
            {hoveredNode.volume24h !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#848e9c' }}>Volume 24h:</span>
                <span style={{ color: '#d1d4dc' }}>
                  {formatLargeNumber(hoveredNode.volume24h)}
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
              Click to open live chart
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
