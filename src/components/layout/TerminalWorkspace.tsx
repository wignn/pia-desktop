import React, { Suspense, lazy, useEffect, useState, useRef } from 'react'
import { TabBar } from './TabBar'
import { TopToolbar } from './TopToolbar'
import { LeftDrawingToolbar } from './LeftDrawingToolbar'
import { RightIconRail } from './RightIconRail'
import { BottomStatusBar } from './BottomStatusBar'
import { BottomDockPanel } from './BottomDockPanel'
import { ChartContainer } from '../chart/ChartContainer'
import { ChartRangeBar } from '../chart/ChartRangeBar'
import { WatchlistPanel } from '../panels/WatchlistPanel'
import { CalendarPanel } from '../panels/CalendarPanel'
import { NewsPanel } from '../panels/NewsPanel'
import { AlertsPanel } from '../panels/AlertsPanel'
import { PaperTradingPanel } from '../panels/PaperTradingPanel'
import { OrderBookPanel } from '../panels/OrderBookPanel'
import { IntelligencePanel } from '../panels/IntelligencePanel'
import { OptionsPanel } from '../panels/OptionsPanel'
import { MacroPanel } from '../panels/MacroPanel'
import { YieldsPanel } from '../panels/YieldsPanel'
import { GeoSignalsPanel } from '../panels/GeoSignalsPanel'
import { EnergyPanel } from '../panels/EnergyPanel'
import { SecFilingsPanel } from '../panels/SecFilingsPanel'
import { SocialPanel } from '../panels/SocialPanel'
import { LiveStreamPanel } from '../panels/LiveStreamPanel'
import { SymbolSearchModal } from '../modals/SymbolSearchModal'
import { IndicatorModal } from '../modals/IndicatorModal'
import { SettingsModal } from '../modals/SettingsModal'
import { SnapshotModal } from '../modals/SnapshotModal'
import { ImportPositionsModal } from '../modals/ImportPositionsModal'
import { UpdateNotificationBanner } from './UpdateNotificationBanner'

import { useMarketStore } from '../../stores/useMarketStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useChartStore } from '../../stores/useChartStore'
import { useAlertsStore } from '../../stores/useAlertsStore'
import { useTabStore } from '../../stores/useTabStore'
import { usePaperTradingStore } from '../../stores/usePaperTradingStore'
import { useScalpingHotkeys } from '../../hooks/useScalpingHotkeys'
import { THEME_TOKENS } from '../../theme/tokens'

const SuperchartsHub = lazy(() =>
  import('../hub/SuperchartsHub').then((module) => ({ default: module.SuperchartsHub }))
)
const MacroMapsView = lazy(() =>
  import('../macromaps/MacroMapsView').then((module) => ({
    default: module.MacroMapsView
  }))
)
const ControlPanelView = lazy(() =>
  import('../controlpanel/ControlPanelView').then((module) => ({
    default: module.ControlPanelView
  }))
)
const MarketHeatmapView = lazy(() =>
  import('../heatmap/MarketHeatmapView').then((module) => ({
    default: module.MarketHeatmapView
  }))
)

const featureFallback = (
  <div
    style={{
      display: 'grid',
      placeItems: 'center',
      flex: 1,
      color: THEME_TOKENS.colors.textSecondary
    }}
  >
    Loading workspace…
  </div>
)

export function TerminalWorkspace(): React.JSX.Element {
  const fetchSymbols = useMarketStore((state) => state.fetchSymbols)
  const subscribeToMarketEvents = useMarketStore((state) => state.subscribeToMarketEvents)
  const loadPaperAccount = usePaperTradingStore((state) => state.loadAccount)
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const activeTabItem = tabs.find((tab) => tab.id === activeTabId) || tabs[0]
  const isHubActive = activeTabItem?.type === 'hub'
  const isMacroMapsActive = activeTabItem?.type === 'macromaps'
  const isControlPanelActive = activeTabItem?.type === 'controlpanel'
  const isHeatmapActive = activeTabItem?.type === 'heatmap'
  const activeTab = useWorkspaceStore((state) => state.activeTab)
  const isRightPanelOpen = useWorkspaceStore((state) => state.isRightPanelOpen)
  const setSymbolSearchOpen = useWorkspaceStore((state) => state.setSymbolSearchOpen)
  const setIndicatorModalOpen = useWorkspaceStore((state) => state.setIndicatorModalOpen)
  const setSettingsModalOpen = useWorkspaceStore((state) => state.setSettingsModalOpen)
  const setImportPositionsModalOpen = useWorkspaceStore((state) => state.setImportPositionsModalOpen)
  const isSnapshotModalOpen = useWorkspaceStore((state) => state.isSnapshotModalOpen)
  const closeSnapshotModal = useWorkspaceStore((state) => state.closeSnapshotModal)
  const snapshotDataUrl = useWorkspaceStore((state) => state.snapshotDataUrl)
  const setActiveTool = useChartStore((state) => state.setActiveTool)
  const lastTriggeredAlert = useAlertsStore((state) => state.lastTriggeredAlert)
  const dismissBanner = useAlertsStore((state) => state.dismissBanner)

  const [dockWidth, setDockWidth] = useState(320)
  const isDraggingDockRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleDockResizeStart = (e: React.MouseEvent): void => {
    isDraggingDockRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = dockWidth

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingDockRef.current) return
      const delta = startXRef.current - moveEvent.clientX
      const nextW = Math.min(600, Math.max(240, startWidthRef.current + delta))
      setDockWidth(nextW)
    }

    const onMouseUp = (): void => {
      isDraggingDockRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Global scalping keyboard shortcuts (Shift+B, Shift+S, Shift+X)
  useScalpingHotkeys()

  // Auto-dismiss triggered alert notification banner after 6 seconds
  useEffect(() => {
    if (lastTriggeredAlert) {
      const timer = setTimeout(() => {
        dismissBanner()
      }, 6000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [lastTriggeredAlert, dismissBanner])

  // Initialize market data subscriptions & paper trading positions
  useEffect(() => {
    fetchSymbols()
    loadPaperAccount()
    const unsubscribe = subscribeToMarketEvents()
    return () => {
      unsubscribe()
    }
  }, [fetchSymbols, loadPaperAccount, subscribeToMarketEvents])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setActiveTool('cursor')
        setSymbolSearchOpen(false)
        setIndicatorModalOpen(false)
        setSettingsModalOpen(false)
        setImportPositionsModalOpen(false)
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSymbolSearchOpen(true)
      }

      if (e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setIndicatorModalOpen(true)
      }

      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSettingsModalOpen(true)
      }

      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (
        targetTag !== 'input' &&
        targetTag !== 'textarea' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        /[a-zA-Z0-9]/.test(e.key)
      ) {
        setSymbolSearchOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool, setSymbolSearchOpen, setIndicatorModalOpen, setSettingsModalOpen, setImportPositionsModalOpen])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: THEME_TOKENS.colors.bgApp
      }}
    >
      {/* TradingView Desktop Tab Strip */}
      <TabBar />

      {isHubActive ? (
        <Suspense fallback={featureFallback}>
          <SuperchartsHub />
        </Suspense>
      ) : isMacroMapsActive ? (
        <Suspense fallback={featureFallback}>
          <MacroMapsView />
        </Suspense>
      ) : isControlPanelActive ? (
        <Suspense fallback={featureFallback}>
          <ControlPanelView />
        </Suspense>
      ) : isHeatmapActive ? (
        <Suspense fallback={featureFallback}>
          <MarketHeatmapView />
        </Suspense>
      ) : (
        <>
          {/* Top TradingView Toolbar */}
          <TopToolbar />

          {/* Main Workspace (Left Rail + Canvas + Right Dock + Far Right Rail) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              minHeight: 0,
              position: 'relative'
            }}
          >
            {/* Left Drawing Tools Toolbar */}
            <LeftDrawingToolbar />

            {/* Central Chart Workspace */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <ChartContainer />
              </div>
              <ChartRangeBar />
              <BottomDockPanel />
            </div>

            {/* Collapsible Right Dock Panel (Resizable) */}
            {isRightPanelOpen && (
              <div
                style={{
                  width: dockWidth,
                  height: '100%',
                  borderLeft: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 10,
                  position: 'relative'
                }}
              >
                {/* Left Edge Resizer Handle */}
                <div
                  onMouseDown={handleDockResizeStart}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    cursor: 'col-resize',
                    zIndex: 30
                  }}
                  title="Drag to resize dock width"
                />

                {activeTab === 'watchlist' && <WatchlistPanel />}
                {activeTab === 'orderbook' && <OrderBookPanel />}
                {activeTab === 'intelligence' && <IntelligencePanel />}
                {activeTab === 'options' && <OptionsPanel />}
                {activeTab === 'macro' && <MacroPanel />}
                {activeTab === 'yields' && <YieldsPanel />}
                {activeTab === 'geosignals' && <GeoSignalsPanel />}
                {activeTab === 'energy' && <EnergyPanel />}
                {activeTab === 'sec' && <SecFilingsPanel />}
                {activeTab === 'social' && <SocialPanel />}
                {activeTab === 'calendar' && <CalendarPanel />}
                {activeTab === 'news' && <NewsPanel />}
                {activeTab === 'alerts' && <AlertsPanel />}
                {activeTab === 'paper' && <PaperTradingPanel />}
                {activeTab === 'live' && <LiveStreamPanel />}
              </div>
            )}

            {/* Far-Right Rail Icons */}
            <RightIconRail />

            {/* Floating Triggered Alert Toast Banner */}
            {lastTriggeredAlert && (
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: isRightPanelOpen ? 370 : 50,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  border: `1px solid ${THEME_TOKENS.colors.accent}`,
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  padding: '10px 14px',
                  zIndex: 100,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minWidth: 260,
                  animation: 'fadeIn 0.2s ease-out'
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(41, 98, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: THEME_TOKENS.colors.accent
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, color: THEME_TOKENS.colors.textBright }}
                  >
                    Price Alert Triggered!
                  </div>
                  <div
                    style={{ fontSize: 11, color: THEME_TOKENS.colors.textSecondary, marginTop: 1 }}
                  >
                    <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                      {lastTriggeredAlert.symbol}
                    </span>{' '}
                    crossed target ${lastTriggeredAlert.targetPrice.toLocaleString()}
                  </div>
                  {lastTriggeredAlert.note && (
                    <div
                      style={{
                        fontSize: 10,
                        color: THEME_TOKENS.colors.textSecondary,
                        fontStyle: 'italic'
                      }}
                    >
                      &quot;{lastTriggeredAlert.note}&quot;
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={dismissBanner}
                  className="tv-btn"
                  style={{
                    padding: '2px 6px',
                    fontSize: 13,
                    color: THEME_TOKENS.colors.textSecondary
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Bottom Status & Health Bar */}
      <BottomStatusBar />

      {/* Modal Dialogues */}
      <UpdateNotificationBanner />
      <SymbolSearchModal />
      <IndicatorModal />
      <SettingsModal />
      <ImportPositionsModal />
      <SnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={closeSnapshotModal}
        dataUrl={snapshotDataUrl}
      />
    </div>
  )
}
