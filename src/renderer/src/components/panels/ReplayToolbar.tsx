import React, { useEffect } from 'react'
import { useChartStore } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'

export const ReplayToolbar: React.FC = () => {
  const {
    isReplaying,
    setReplaying,
    isReplayPlaying,
    toggleReplayPlay,
    replaySpeedMs,
    setReplaySpeed,
    stepReplayForward,
    jumpReplayTo,
    replayCurrentIndex,
    replayTotalBars
  } = useChartStore()

  // Automated playback timer
  useEffect(() => {
    if (!isReplaying || !isReplayPlaying) return

    const interval = setInterval(() => {
      stepReplayForward()
    }, replaySpeedMs)

    return (): void => {
      clearInterval(interval)
    }
  }, [isReplaying, isReplayPlaying, replaySpeedMs, stepReplayForward])

  if (!isReplaying) return null

  const isAtEnd = replayCurrentIndex >= replayTotalBars

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
        borderRadius: 8,
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        userSelect: 'none'
      }}
    >
      {/* Replay Mode Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isReplayPlaying
              ? THEME_TOKENS.colors.bullish
              : THEME_TOKENS.colors.accent,
            boxShadow: `0 0 8px ${
              isReplayPlaying ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.accent
            }`
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: THEME_TOKENS.colors.textBright
          }}
        >
          REPLAY
        </span>
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Play / Pause Button */}
      <button
        type="button"
        onClick={toggleReplayPlay}
        disabled={isAtEnd && !isReplayPlaying}
        className={`tv-btn ${isReplayPlaying ? 'active' : ''}`}
        title={isReplayPlaying ? 'Pause Replay' : 'Play Replay'}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        {isReplayPlaying ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            <span>Pause</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Play</span>
          </>
        )}
      </button>

      {/* Step Forward 1 Bar */}
      <button
        type="button"
        onClick={stepReplayForward}
        disabled={isAtEnd}
        className="tv-btn"
        title="Step Forward 1 Bar"
        style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" />
        </svg>
        <span>Step</span>
      </button>

      {/* Scrubber / Slider */}
      {replayTotalBars > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={1}
            max={replayTotalBars}
            value={replayCurrentIndex}
            onChange={(e) => jumpReplayTo(Number(e.target.value))}
            style={{
              width: 110,
              accentColor: THEME_TOKENS.colors.accent,
              cursor: 'pointer',
              height: 4
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: THEME_TOKENS.colors.textSecondary,
              minWidth: 70
            }}
          >
            {replayCurrentIndex} / {replayTotalBars}
          </span>
        </div>
      )}

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Speed Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {[
          { label: '0.5s', ms: 500 },
          { label: '1s', ms: 1000 },
          { label: '2s', ms: 2000 }
        ].map((item) => (
          <button
            key={item.ms}
            type="button"
            onClick={() => setReplaySpeed(item.ms)}
            className={`tv-btn ${replaySpeedMs === item.ms ? 'active' : ''}`}
            style={{ fontSize: 11, padding: '3px 7px' }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Exit Replay Button */}
      <button
        type="button"
        onClick={() => setReplaying(false)}
        className="tv-btn"
        title="Exit Replay Mode"
        style={{
          padding: '4px 8px',
          color: THEME_TOKENS.colors.bearish,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span>Exit</span>
      </button>
    </div>
  )
}
