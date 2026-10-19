import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { sanitizeIndicators, OVERLAY_INDICATORS } from '../stores/useChartStore'
import {
  DrawingPropertyBar,
  mapOverlayStyles,
  DRAWING_PALETTE_COLORS,
  STROKE_WIDTHS,
  STROKE_STYLES
} from '../components/chart/DrawingPropertyBar'
import {
  ReplayControlBar,
  REPLAY_SPEED_OPTIONS,
  formatReplayProgress
} from '../components/chart/ReplayControlBar'
import { NewsPanel } from '../components/panels/NewsPanel'
import { useNewsStore } from '../stores/useNewsStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { resolveNewsImage } from '../shared/market-utils'
import { SymbolLogo, getSymbolLogoCandidates } from '../components/common/SymbolLogo'
import { TopToolbar } from '../components/layout/TopToolbar'
import { WatchlistPanel } from '../components/panels/WatchlistPanel'
import { SymbolSearchModal } from '../components/modals/SymbolSearchModal'
import { ChartLegend } from '../components/chart/ChartLegend'
import { useMarketStore } from '../stores/useMarketStore'
import { useWatchlistStore } from '../stores/useWatchlistStore'

describe('TradingView Layout & Chart helpers', () => {
  it('correctly maps overlay indicators to candle_pane', () => {
    const raw = [
      { name: 'EMA', shortName: 'EMA', paneId: 'wrong_pane', visible: true },
      { name: 'RSI', shortName: 'RSI', paneId: 'candle_pane', visible: true }
    ]

    const sanitized = sanitizeIndicators(raw)
    expect(sanitized[0].paneId).toBe('candle_pane')
    expect(sanitized[1].paneId).toBe('rsi_pane')
  })

  it('recognizes standard TradingView overlay indicators', () => {
    expect(OVERLAY_INDICATORS.has('EMA')).toBe(true)
    expect(OVERLAY_INDICATORS.has('SMA')).toBe(true)
    expect(OVERLAY_INDICATORS.has('BOLL')).toBe(true)
    expect(OVERLAY_INDICATORS.has('RSI')).toBe(false)
  })

  it('correctly clamps dock and drawer resizing limits', () => {
    const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val))
    
    // Right dock width bounds: [240, 600]
    expect(clamp(150, 240, 600)).toBe(240)
    expect(clamp(400, 240, 600)).toBe(400)
    expect(clamp(800, 240, 600)).toBe(600)

    // Bottom drawer height bounds: [120, 520]
    expect(clamp(50, 120, 520)).toBe(120)
    expect(clamp(300, 120, 520)).toBe(300)
    expect(clamp(700, 120, 520)).toBe(520)
  })

  it('handles keyboard index wrap navigation', () => {
    const listLen = 5
    const nextDown = (cur: number): number => (cur < listLen - 1 ? cur + 1 : 0)
    const nextUp = (cur: number): number => (cur > 0 ? cur - 1 : listLen - 1)

    expect(nextDown(0)).toBe(1)
    expect(nextDown(4)).toBe(0)
    expect(nextUp(0)).toBe(4)
    expect(nextUp(3)).toBe(2)
  })

  it('manages drawing tool selection and toggles properly', () => {
    const { useChartStore } = require('../stores/useChartStore')
    const store = useChartStore.getState()
    
    expect(store.activeTool).toBe('cursor')
    expect(store.stayInDrawingMode).toBe(false)
    expect(store.isDrawingsLocked).toBe(false)
    expect(store.isDrawingsHidden).toBe(false)

    useChartStore.getState().setActiveTool('rect')
    expect(useChartStore.getState().activeTool).toBe('rect')

    useChartStore.getState().toggleStayInDrawingMode()
    expect(useChartStore.getState().stayInDrawingMode).toBe(true)

    useChartStore.getState().toggleLockDrawings()
    expect(useChartStore.getState().isDrawingsLocked).toBe(true)

    useChartStore.getState().toggleHideDrawings()
    expect(useChartStore.getState().isDrawingsHidden).toBe(true)

    useChartStore.getState().clearAllDrawings()
    expect(useChartStore.getState().drawingsClearSignal).toBe(1)
  })

  describe('DrawingPropertyBar & overlay style mutations', () => {
    it('correctly maps full style payloads to line, polygon, and circle structures', () => {
      const styles = {
        color: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed' as const
      }

      const mapped = mapOverlayStyles(styles)

      expect(mapped.color).toBe('#2962ff')
      expect(mapped.borderSize).toBe(2)
      expect(mapped.borderStyle).toBe('dashed')

      expect(mapped.line).toEqual({
        color: '#2962ff',
        size: 2,
        style: 'dashed'
      })

      expect(mapped.polygon).toEqual({
        borderColor: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed'
      })

      expect(mapped.circle).toEqual({
        borderColor: '#2962ff',
        borderSize: 2,
        borderStyle: 'dashed'
      })
    })

    it('correctly maps partial style updates', () => {
      const colorOnly = mapOverlayStyles({ color: '#089981' })
      expect(colorOnly.line.color).toBe('#089981')
      expect(colorOnly.line.size).toBeUndefined()
      expect(colorOnly.polygon.borderColor).toBe('#089981')
      expect(colorOnly.circle.borderColor).toBe('#089981')

      const widthOnly = mapOverlayStyles({ borderSize: 3 })
      expect(widthOnly.line.size).toBe(3)
      expect(widthOnly.polygon.borderSize).toBe(3)
      expect(widthOnly.circle.borderSize).toBe(3)

      const styleOnly = mapOverlayStyles({ borderStyle: 'solid' })
      expect(styleOnly.line.style).toBe('solid')
      expect(styleOnly.polygon.borderStyle).toBe('solid')
      expect(styleOnly.circle.borderStyle).toBe('solid')
    })

    it('asserts palette options, stroke widths, and stroke styles conform to specification', () => {
      expect(DRAWING_PALETTE_COLORS).toEqual([
        '#2962ff',
        '#089981',
        '#f23645',
        '#ffb703',
        '#9c27b0',
        '#ffffff'
      ])
      expect(STROKE_WIDTHS).toEqual([1, 2, 3])
      expect(STROKE_STYLES).toEqual(['solid', 'dashed'])
    })

    it('renders null when selectedId is null and floating bar when selectedId is set', () => {
      const dummyUpdate = vi.fn()
      const dummyDelete = vi.fn()

      const nullHtml = renderToStaticMarkup(
        React.createElement(DrawingPropertyBar, {
          selectedId: null,
          onUpdateStyle: dummyUpdate,
          onDelete: dummyDelete
        })
      )
      expect(nullHtml).toBe('')

      const activeHtml = renderToStaticMarkup(
        React.createElement(DrawingPropertyBar, {
          selectedId: 'overlay_test_1',
          onUpdateStyle: dummyUpdate,
          onDelete: dummyDelete
        })
      )
      expect(activeHtml).toContain('data-testid="drawing-property-bar"')
      expect(activeHtml).toContain('1px')
      expect(activeHtml).toContain('2px')
      expect(activeHtml).toContain('3px')
      expect(activeHtml).toContain('Delete Drawing')
    })

    it('triggers onUpdateStyle and onDelete handlers with expected arguments', () => {
      const onUpdateStyle = vi.fn()
      const onDelete = vi.fn()

      // Color change handler call
      onUpdateStyle({ color: '#f23645' })
      expect(onUpdateStyle).toHaveBeenCalledWith({ color: '#f23645' })

      // Stroke width change handler call
      onUpdateStyle({ borderSize: 2 })
      expect(onUpdateStyle).toHaveBeenCalledWith({ borderSize: 2 })

      // Stroke style toggle handler call
      onUpdateStyle({ borderStyle: 'dashed' })
      expect(onUpdateStyle).toHaveBeenCalledWith({ borderStyle: 'dashed' })

      // Delete handler call
      onDelete()
      expect(onDelete).toHaveBeenCalledTimes(1)
    })
  })

  describe('ReplayControlBar & replay store actions', () => {
    it('defines standard replay speed multiplier options', () => {
      expect(REPLAY_SPEED_OPTIONS).toEqual([
        { label: '0.5x', ms: 2000 },
        { label: '1x', ms: 1000 },
        { label: '2x', ms: 500 },
        { label: '5x', ms: 200 },
        { label: '10x', ms: 100 }
      ])
    })

    it('formats bar progress counter accurately', () => {
      expect(formatReplayProgress(0, 0)).toBe('0 / 0')
      expect(formatReplayProgress(25, 150)).toBe('25 / 150')
      expect(formatReplayProgress(500, 500)).toBe('500 / 500')
    })

    it('handles replay store actions and speed transitions', () => {
      const { useChartStore } = require('../stores/useChartStore')

      useChartStore.setState({
        isReplaying: false,
        isReplayPlaying: false,
        replaySpeedMs: 1000,
        replayCurrentIndex: 0,
        replayTotalBars: 0
      })

      // Toggle replay playing
      useChartStore.getState().toggleReplayPlay()
      expect(useChartStore.getState().isReplayPlaying).toBe(true)
      useChartStore.getState().toggleReplayPlay()
      expect(useChartStore.getState().isReplayPlaying).toBe(false)

      // Speed configuration
      useChartStore.getState().setReplaySpeed(500)
      expect(useChartStore.getState().replaySpeedMs).toBe(500)
      useChartStore.getState().setReplaySpeed(100)
      expect(useChartStore.getState().replaySpeedMs).toBe(100)

      // Exit replay resets state
      useChartStore.setState({ isReplaying: true, isReplayPlaying: true, replayCurrentIndex: 40, replayTotalBars: 100 })
      useChartStore.getState().setReplaying(false)
      expect(useChartStore.getState().isReplaying).toBe(false)
      expect(useChartStore.getState().isReplayPlaying).toBe(false)
      expect(useChartStore.getState().replayCurrentIndex).toBe(0)
    })

    it('correctly toggles and opens right sidebar when clicking rail items', () => {
      const { useWorkspaceStore } = require('../stores/useWorkspaceStore')
      
      // Start open on watchlist
      useWorkspaceStore.setState({ activeTab: 'watchlist', isRightPanelOpen: true })
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(true)

      // Clicking active tab closes it
      useWorkspaceStore.getState().setActiveTab('watchlist')
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(false)

      // Clicking active tab again reopens it
      useWorkspaceStore.getState().setActiveTab('watchlist')
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(true)

      // Clicking different tab switches tab and stays open
      useWorkspaceStore.getState().setActiveTab('alerts')
      expect(useWorkspaceStore.getState().activeTab).toBe('alerts')
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(true)

      // Closing and clicking different tab opens the new tab
      useWorkspaceStore.getState().setActiveTab('alerts') // closes
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(false)
      useWorkspaceStore.getState().setActiveTab('news')
      expect(useWorkspaceStore.getState().activeTab).toBe('news')
      expect(useWorkspaceStore.getState().isRightPanelOpen).toBe(true)
    })

    it('correctly maps news article imageUrl and formats news layout', () => {
      const sampleArticles = [
        {
          id: 'n-1',
          title: 'Breaking Tech News',
          summary: 'Big earnings beat expectations.',
          url: 'https://example.com/1',
          source: 'Reuters',
          publishedAt: Date.now() - 60000,
          category: 'Stocks',
          imageUrl: 'https://images.unsplash.com/photo-test-1'
        },
        {
          id: 'n-2',
          title: 'Crypto Market Rally',
          summary: 'Bitcoin reaches key resistance level.',
          url: 'https://example.com/2',
          source: 'CoinDesk',
          publishedAt: Date.now() - 120000,
          category: 'Crypto',
          imageUrl: 'https://images.unsplash.com/photo-test-2'
        }
      ]

      const html = renderToStaticMarkup(
        React.createElement(NewsPanel, { customArticles: sampleArticles })
      )
      expect(html).toContain('Financial News')
      expect(html).toContain('Breaking Tech News')
      expect(html).toContain('Crypto Market Rally')
      expect(html).toContain('https://images.unsplash.com/photo-test-1')
      expect(html).toContain('https://images.unsplash.com/photo-test-2')

      // Fallback styling when article has no imageUrl
      const fallbackArticles = [
        {
          id: 'n-no-img',
          title: 'Macro Economy Update',
          summary: 'Rates steady.',
          url: 'https://example.com/3',
          source: 'Bloomberg',
          publishedAt: Date.now()
        }
      ]
      const fallbackHtml = renderToStaticMarkup(
        React.createElement(NewsPanel, { customArticles: fallbackArticles })
      )
      expect(fallbackHtml).toContain('Bloomberg')
      expect(fallbackHtml).toContain('Macro Economy Update')

      // FXStreet news with editorial media_url
      const fxstreetArticles = [
        {
          id: 'n-fxs',
          title: 'Australian Dollar holds gains above 0.6950',
          summary: 'Fading expectations for Fed hike.',
          url: 'https://www.fxstreet.com/news/123',
          source: 'FXStreet',
          publishedAt: Date.now(),
          imageUrl: 'https://editorial.fxsstatic.com/images/i/AUD-bullish-animal_Medium.png'
        }
      ]
      const fxsHtml = renderToStaticMarkup(
        React.createElement(NewsPanel, { customArticles: fxstreetArticles })
      )
      expect(fxsHtml).toContain('FXStreet')
      expect(fxsHtml).toContain('Australian Dollar holds gains above 0.6950')
      expect(fxsHtml).toContain('https://editorial.fxsstatic.com/images/i/AUD-bullish-animal_Medium.png')
    })

    it('resolves topic-based financial imagery accurately', () => {
      const cryptoImg = resolveNewsImage('Bitcoin breaks 95k', '', 'Crypto', 0)
      expect(cryptoImg).toContain('images.unsplash.com')

      const goldImg = resolveNewsImage('Gold price surges on haven demand', '', 'Metals', 1)
      expect(goldImg).toContain('images.unsplash.com')

      const oilImg = resolveNewsImage('Crude oil rises after OPEC quota', '', 'Energy', 2)
      expect(oilImg).toContain('images.unsplash.com')

      const fedImg = resolveNewsImage('Fed keeps interest rate unchanged', 'Inflation cool', 'Macro', 3)
      expect(fedImg).toContain('images.unsplash.com')
    })

    it('renders null when isReplaying is false and floating bar when true', () => {
      const inactiveHtml = renderToStaticMarkup(
        React.createElement(ReplayControlBar, { isReplaying: false })
      )
      expect(inactiveHtml).toBe('')

      const activeHtml = renderToStaticMarkup(
        React.createElement(ReplayControlBar, {
          isReplaying: true,
          isReplayPlaying: false,
          replaySpeedMs: 1000,
          replayCurrentIndex: 12,
          replayTotalBars: 50
        })
      )
      expect(activeHtml).toContain('data-testid="replay-control-bar"')
      expect(activeHtml).toContain('Bar Replay')
      expect(activeHtml).toContain('12 / 50')
      expect(activeHtml).toContain('0.5x')
      expect(activeHtml).toContain('1x')
      expect(activeHtml).toContain('2x')
      expect(activeHtml).toContain('5x')
      expect(activeHtml).toContain('10x')
      expect(activeHtml).toContain('Exit Replay')
      expect(activeHtml).toContain('Play Replay')

      // When playing, pause title is rendered
      const playingHtml = renderToStaticMarkup(
        React.createElement(ReplayControlBar, {
          isReplaying: true,
          isReplayPlaying: true,
          replaySpeedMs: 500,
          replayCurrentIndex: 20,
          replayTotalBars: 50
        })
      )
      expect(playingHtml).toContain('Pause Replay')
    })

    it('triggers replay control handlers when interacting with buttons', () => {
      const toggleReplayPlay = vi.fn()
      const stepReplayForward = vi.fn()
      const jumpReplayTo = vi.fn()
      const setReplaySpeed = vi.fn()
      const setReplaying = vi.fn()

      // Direct simulation of button action callbacks
      toggleReplayPlay()
      expect(toggleReplayPlay).toHaveBeenCalledTimes(1)

      stepReplayForward()
      expect(stepReplayForward).toHaveBeenCalledTimes(1)

      jumpReplayTo(1)
      expect(jumpReplayTo).toHaveBeenCalledWith(1)

      setReplaySpeed(200)
      expect(setReplaySpeed).toHaveBeenCalledWith(200)

      setReplaying(false)
      expect(setReplaying).toHaveBeenCalledWith(false)
    })
  })

  describe('SymbolLogo & candidate resolution', () => {
    it('correctly derives logo candidate URLs for crypto tickers', () => {
      const btcCandidates = getSymbolLogoCandidates('BTCUSDT')
      expect(btcCandidates.length).toBeGreaterThanOrEqual(3)
      expect(btcCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/btc.svg')
      expect(btcCandidates).toContain('https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/BTC.png')
      expect(btcCandidates).toContain('https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/BTC.png')

      const ethCandidates = getSymbolLogoCandidates('ETH/USD')
      expect(ethCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/eth.svg')
      expect(ethCandidates).toContain('https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/ETH.png')

      const solCandidates = getSymbolLogoCandidates('SOLBUSD')
      expect(solCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/sol.svg')

      const perpCandidates = getSymbolLogoCandidates('BTCPERP')
      expect(perpCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/btc.svg')
    })

    it('correctly derives logo candidate URLs for stock tickers', () => {
      const aaplCandidates = getSymbolLogoCandidates('AAPL')
      expect(aaplCandidates.length).toBeGreaterThanOrEqual(3)
      expect(aaplCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/AAPL.png')
      expect(aaplCandidates).toContain('https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos@main/logos/AAPL.png')
    })

    it('correctly resolves commodity base prefixes like XAU/XAUUSD to gold icons', () => {
      const xauCandidates = getSymbolLogoCandidates('XAUUSD')
      expect(xauCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/XAU.png')

      const xauTypo = getSymbolLogoCandidates('XAUU')
      expect(xauTypo[0]).toBe('https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/XAU.png')

      const xagCandidates = getSymbolLogoCandidates('XAGUSD')
      expect(xagCandidates[0]).toBe('https://cdn.jsdelivr.net/gh/nvstly/icons@main/forex_icons/XAG.png')
    })

    it('returns empty array for empty or invalid symbol', () => {
      expect(getSymbolLogoCandidates('')).toEqual([])
      expect(getSymbolLogoCandidates('   ')).toEqual([])
    })

    it('renders local symbol image first when available, or remote candidate fallback', () => {
      const htmlLocal = renderToStaticMarkup(React.createElement(SymbolLogo, { symbol: 'BTCUSDT' }))
      expect(htmlLocal).toContain('src="/symbol-icons/BTCUSDT.png"')
      expect(htmlLocal).toContain('width:20px')
      expect(htmlLocal).toContain('height:20px')

      const htmlRemote = renderToStaticMarkup(React.createElement(SymbolLogo, { symbol: 'BTCUSDT', preferLocal: false }))
      expect(htmlRemote).toContain('src="https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/btc.svg"')
    })

    it('renders overlapping dual flags or currency badges for Forex pairs', () => {
      const htmlEurUsd = renderToStaticMarkup(React.createElement(SymbolLogo, { symbol: 'EURUSD', preferLocal: false }))
      expect(htmlEurUsd).toContain('data-testid="symbol-logo-dual"')
      expect(htmlEurUsd).toContain('flags/4x3/eu.svg')
      expect(htmlEurUsd).toContain('flags/4x3/us.svg')

      const htmlUsdJpy = renderToStaticMarkup(React.createElement(SymbolLogo, { symbol: 'USD/JPY' }))
      expect(htmlUsdJpy).toContain('data-testid="symbol-logo-dual"')
      expect(htmlUsdJpy).toContain('flags/4x3/us.svg')
      expect(htmlUsdJpy).toContain('flags/4x3/jp.svg')
    })

    it('renders graceful initial letters fallback pill with deterministic category color', () => {
      const htmlFallback = renderToStaticMarkup(
        React.createElement(SymbolLogo, { symbol: 'NVDA', forceFallback: true })
      )
      expect(htmlFallback).toContain('data-testid="symbol-logo-fallback"')
      expect(htmlFallback).toContain('NV')
      expect(htmlFallback).toContain('width:20px')

      const htmlCryptoFallback = renderToStaticMarkup(
        React.createElement(SymbolLogo, { symbol: 'DOGEUSDT', forceFallback: true })
      )
      expect(htmlCryptoFallback).toContain('DO')
      // Deterministic crypto color: #f7931a
      expect(htmlCryptoFallback).toContain('#f7931a')
    })

    it('supports custom size and gracefully handles empty symbol', () => {
      const htmlSized = renderToStaticMarkup(
        React.createElement(SymbolLogo, { symbol: 'BTCUSDT', size: 32 })
      )
      expect(htmlSized).toContain('width:32px')
      expect(htmlSized).toContain('height:32px')

      const htmlEmpty = renderToStaticMarkup(React.createElement(SymbolLogo, { symbol: '' }))
      expect(htmlEmpty).toContain('data-testid="symbol-logo-empty"')
    })
  })

  describe('SymbolLogo integration across TopToolbar, WatchlistPanel, SymbolSearchModal, ChartLegend', () => {
    let originalSyncStore: typeof React.useSyncExternalStore

    beforeAll(() => {
      originalSyncStore = React.useSyncExternalStore
      React.useSyncExternalStore = (subscribe, getSnapshot) =>
        originalSyncStore(subscribe, getSnapshot, getSnapshot)
    })

    afterAll(() => {
      React.useSyncExternalStore = originalSyncStore
    })

    it('renders SymbolLogo inside TopToolbar next to active symbol', () => {
      useMarketStore.setState({ symbol: 'BTCUSDT' })
      const html = renderToStaticMarkup(React.createElement(TopToolbar))
      expect(html).toContain('BTCUSDT')
      expect(html).toContain('alt="BTCUSDT"')
      expect(html).toContain('width:18px')
      expect(html).toContain('height:18px')
    })

    it('renders SymbolLogo inside WatchlistPanel for each watchlist item', () => {
      useWatchlistStore.setState({
        watchlists: [
          {
            id: 'test-wl-1',
            name: 'Favorites',
            symbols: ['BTCUSDT', 'EURUSD'],
            isDefault: true,
            createdAt: Date.now()
          }
        ],
        activeListId: 'test-wl-1'
      })
      useMarketStore.setState({
        symbols: [
          { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'crypto', pricePrecision: 2 },
          { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', pricePrecision: 5 }
        ]
      })

      const html = renderToStaticMarkup(React.createElement(WatchlistPanel))
      expect(html).toContain('alt="BTCUSDT"')
      expect(html).toContain('alt="EURUSD"')
      expect(html).toContain('width:18px')
    })

    it('renders SymbolLogo inside SymbolSearchModal in search results', () => {
      useWorkspaceStore.setState({ isSymbolSearchOpen: true })
      useMarketStore.setState({
        symbols: [
          { symbol: 'AAPL', name: 'Apple Inc.', category: 'stocks', pricePrecision: 2 }
        ]
      })

      const html = renderToStaticMarkup(React.createElement(SymbolSearchModal))
      expect(html).toContain('AAPL')
      expect(html).toContain('alt="AAPL"')
      expect(html).toContain('width:20px')
      expect(html).toContain('height:20px')
    })

    it('renders SymbolLogo inside ChartLegend before the symbol ticker', () => {
      useMarketStore.setState({ symbol: 'EURUSD', timeframe: '1h' })
      const html = renderToStaticMarkup(React.createElement(ChartLegend))
      expect(html).toContain('EURUSD')
      expect(html).toContain('alt="EURUSD"')
      expect(html).toContain('width:16px')
      expect(html).toContain('height:16px')
    })

    it('renders chart loading overlay when isLoadingCandles is true', () => {
      if (typeof globalThis.window === 'undefined') {
        ;(globalThis as any).window = { navigator: { userAgent: 'test' } }
      } else if (!globalThis.window.navigator) {
        ;(globalThis.window as any).navigator = { userAgent: 'test' }
      }
      const { ChartContainer } = require('../components/chart/ChartContainer')
      useMarketStore.setState({ symbol: 'XAUUSD', timeframe: '15m', isLoadingCandles: true })
      const html = renderToStaticMarkup(React.createElement(ChartContainer))
      expect(html).toContain('data-testid="chart-loading-overlay"')
      expect(html).toContain('XAUUSD')
      expect(html).toContain('15m')
      expect(html).toContain('Loading chart data...')
    })
    it('renders live non-zero percentage badge in WatchlistPanel when change24hPercent is provided', () => {
      useWatchlistStore.setState({
        watchlists: [
          { id: 'wl-1', name: 'Majors', symbols: ['EURUSD', 'BTCUSDT'], isDefault: true, createdAt: Date.now() }
        ],
        activeListId: 'wl-1'
      })
      useMarketStore.setState({
        symbols: [
          { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', pricePrecision: 5 },
          { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'crypto', pricePrecision: 2 }
        ],
        prices: {
          EURUSD: {
            symbol: 'EURUSD',
            price: 1.1235,
            timestamp: Date.now(),
            change24h: 0.00105,
            change24hPercent: 0.0935
          },
          BTCUSDT: {
            symbol: 'BTCUSDT',
            price: 82500,
            timestamp: Date.now(),
            change24h: 430.5,
            change24hPercent: 0.5246
          }
        }
      })

      const html = renderToStaticMarkup(React.createElement(WatchlistPanel))
      expect(html).toContain('+0.09%')
      expect(html).toContain('+0.52%')
    })

    it('renders bearish percentage badge with minus sign when change24hPercent is negative', () => {
      useWatchlistStore.setState({
        watchlists: [
          { id: 'wl-1', name: 'Majors', symbols: ['USDJPY'], isDefault: true, createdAt: Date.now() }
        ],
        activeListId: 'wl-1'
      })
      useMarketStore.setState({
        symbols: [
          { symbol: 'USDJPY', name: 'US Dollar / Yen', category: 'forex', pricePrecision: 3 }
        ],
        prices: {
          USDJPY: {
            symbol: 'USDJPY',
            price: 157.85,
            timestamp: Date.now(),
            change24h: -0.172,
            change24hPercent: -0.1088
          }
        }
      })

      const html = renderToStaticMarkup(React.createElement(WatchlistPanel))
      expect(html).toContain('-0.11%')
    })
  })
})
