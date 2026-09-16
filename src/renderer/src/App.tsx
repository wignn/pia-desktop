import React, { useEffect } from 'react'
import { TabBar } from './components/layout/TabBar'
import { SuperchartsHub } from './components/hub/SuperchartsHub'
import { MacroMapsView } from './components/macromaps/MacroMapsView'
import { TopToolbar } from './components/layout/TopToolbar'
import { LeftDrawingToolbar } from './components/layout/LeftDrawingToolbar'
import { RightIconRail } from './components/layout/RightIconRail'
import { BottomStatusBar } from './components/layout/BottomStatusBar'
import { ChartContainer } from './components/chart/ChartContainer'
import { WatchlistPanel } from './components/panels/WatchlistPanel'
import { CalendarPanel } from './components/panels/CalendarPanel'
import { NewsPanel } from './components/panels/NewsPanel'
import { AlertsPanel } from './components/panels/AlertsPanel'
import { PaperTradingPanel } from './components/panels/PaperTradingPanel'
import { OrderBookPanel } from './components/panels/OrderBookPanel'
import { IntelligencePanel } from './components/panels/IntelligencePanel'
import { OptionsPanel } from './components/panels/OptionsPanel'
import { MacroPanel } from './components/panels/MacroPanel'
import { YieldsPanel } from './components/panels/YieldsPanel'
import { GeoSignalsPanel } from './components/panels/GeoSignalsPanel'
import { EnergyPanel } from './components/panels/EnergyPanel'
import { SecFilingsPanel } from './components/panels/SecFilingsPanel'
import { SocialPanel } from './components/panels/SocialPanel'
import { LiveStreamPanel } from './components/panels/LiveStreamPanel'
import { ReplayToolbar } from './components/panels/ReplayToolbar'
import { SymbolSearchModal } from './components/modals/SymbolSearchModal'
import { IndicatorModal } from './components/modals/IndicatorModal'
import { SettingsModal } from './components/modals/SettingsModal'

import { useMarketStore } from './stores/useMarketStore'
import { useWorkspaceStore } from './stores/useWorkspaceStore'
import { useChartStore } from './stores/useChartStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useAlertsStore } from './stores/useAlertsStore'
import { useTabStore } from './stores/useTabStore'
import { THEME_TOKENS } from './theme/tokens'

export function App(): React.JSX.Element {
  const { fetchSymbols, subscribeToMarketEvents } = useMarketStore()
  const { tabs, activeTabId } = useTabStore()
  const activeTabItem = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const isHubActive = activeTabItem?.type === 'hub'
  const isMacroMapsActive = activeTabItem?.type === 'macromaps'
  const {
    activeTab,
    isRightPanelOpen,
    setSymbolSearchOpen,
    setIndicatorModalOpen,
    setSettingsModalOpen
  } = useWorkspaceStore()
  const { setActiveTool } = useChartStore()
  const { loadCredentials } = useSettingsStore()
  const { lastTriggeredAlert, dismissBanner } = useAlertsStore()

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

  // Initialize market data subscriptions & credentials
  useEffect(() => {
    fetchSymbols()
    loadCredentials()
    const unsubscribe = subscribeToMarketEvents()
    return () => {
      unsubscribe()
    }
  }, [fetchSymbols, loadCredentials, subscribeToMarketEvents])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape: reset drawing tool to cursor and close any open modals
      if (e.key === 'Escape') {
        setActiveTool('cursor')
        setSymbolSearchOpen(false)
        setIndicatorModalOpen(false)
        setSettingsModalOpen(false)
      }

      // Ctrl+K: Open Symbol Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSymbolSearchOpen(true)
      }

      // Alt+I: Open Indicator Modal
      if (e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setIndicatorModalOpen(true)
      }

      // Alt+S: Open Settings Modal
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSettingsModalOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool, setSymbolSearchOpen, setIndicatorModalOpen, setSettingsModalOpen])

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
        <SuperchartsHub />
      ) : isMacroMapsActive ? (
        <MacroMapsView />
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

            {/* Central Chart Area */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                height: '100%',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              <ChartContainer />
              <ReplayToolbar />
            </div>

            {/* Collapsible Right Dock Panel */}
            {isRightPanelOpen && (
              <div
                style={{
                  width: THEME_TOKENS.dimensions.rightPanelWidth,
                  height: '100%',
                  borderLeft: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  backgroundColor: THEME_TOKENS.colors.bgSurface,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 10
                }}
              >
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
                  right: isRightPanelOpen ? THEME_TOKENS.dimensions.rightPanelWidth + 50 : 50,
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
      <SymbolSearchModal />
      <IndicatorModal />
      <SettingsModal />
    </div>
  )
}

export default App
