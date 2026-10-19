import React from 'react'
import { useWorkspaceStore, type RightPanelTab } from '../../stores/useWorkspaceStore'
import { THEME_TOKENS } from '../../theme/tokens'

interface RailItem {
  id: RightPanelTab
  title: string
  icon: React.ReactNode
}

const RAIL_ITEMS: RailItem[] = [
  {
    id: 'watchlist',
    title: 'Watchlist, details and news (Alt+W)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    )
  },
  {
    id: 'alerts',
    title: 'Alerts Manager (Alt+A)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="13" r="8" />
        <polyline points="12 9 12 13 15 15" />
        <path d="M5 3L2 6" />
        <path d="M22 6L19 3" />
      </svg>
    )
  },
  {
    id: 'news',
    title: 'News Headlines & Wire',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </svg>
    )
  },
  {
    id: 'intelligence',
    title: 'Data Window & AI Market Intelligence',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    )
  },
  {
    id: 'orderbook',
    title: 'Hotlists / Level 2 Depth of Market',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h12M3 18h16" />
        <path d="M19 10v4" />
      </svg>
    )
  },
  {
    id: 'calendar',
    title: 'Economic Calendar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  },
  {
    id: 'macro',
    title: 'Macro Analytics & Central Banks',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    )
  },
  {
    id: 'social',
    title: 'Community Chats & Sentiment',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    )
  },
  {
    id: 'geosignals',
    title: 'Geopolitical Risk Radar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="3" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    id: 'energy',
    title: 'Energy Complex & Commodities',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2c0 4.5-5 7.5-5 12a7 7 0 0 0 14 0c0-4.5-5-7.5-5-12z" />
        <path d="M12 14c0 2-1.5 3.5-3 3.5" />
      </svg>
    )
  },
  {
    id: 'sec',
    title: 'SEC Filings & Insiders',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  },
  {
    id: 'options',
    title: 'Options & Gamma Exposure (GEX)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19h16" />
        <path d="M4 15c4-1 6-9 8-9s4 8 8 9" />
      </svg>
    )
  },
  {
    id: 'yields',
    title: 'Treasury Yield Curve & Inversion',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 20h18" />
        <path d="M5 17c3-3 6-5 9-6s4-3 5-6" />
        <circle cx="19" cy="5" r="1.5" />
      </svg>
    )
  },
  {
    id: 'paper',
    title: 'Trading Orders & Order Panel',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    )
  }
]

export const RightIconRail: React.FC = () => {
  const { activeTab, isRightPanelOpen, setActiveTab, setSettingsModalOpen } = useWorkspaceStore()

  const handleTabClick = (tabId: RightPanelTab): void => {
    setActiveTab(tabId)
  }

  return (
    <div
      style={{
        width: THEME_TOKENS.dimensions.rightRailWidth,
        height: '100%',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        borderLeft: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 0',
        gap: 2,
        overflowY: 'auto',
        scrollbarWidth: 'none',
        zIndex: 15,
        userSelect: 'none'
      }}
    >
      {RAIL_ITEMS.map((item) => {
        const isSelected = activeTab === item.id && isRightPanelOpen

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTabClick(item.id)}
            className={`tv-btn ${isSelected ? 'active' : ''}`}
            title={item.title}
            style={{
              width: 32,
              height: 30,
              padding: 0,
              color: isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textSecondary,
              backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              borderRadius: 5,
              border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              boxShadow: isSelected ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 10px rgba(59, 130, 246, 0.15)' : 'none'
            }}
          >
            {item.icon}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      <div style={{ width: 20, height: 1, backgroundColor: THEME_TOKENS.colors.borderSubtle, margin: '4px 0' }} />

      {/* Settings Modal Trigger */}
      <button
        type="button"
        onClick={() => setSettingsModalOpen(true)}
        className="tv-btn"
        title="Settings & API Credentials"
        style={{
          width: 32,
          height: 30,
          padding: 0,
          color: THEME_TOKENS.colors.textSecondary,
          borderRadius: 4
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
