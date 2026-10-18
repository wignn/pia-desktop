import React, { useEffect } from 'react'
import { useChartStore } from '../../stores/useChartStore'
import { THEME_TOKENS } from '../../theme/tokens'

export interface ReplaySpeedOption {
  label: string
  ms: number
}

export const REPLAY_SPEED_OPTIONS: ReplaySpeedOption[] = [
  { label: '0.5x', ms: 2000 },
  { label: '1x', ms: 1000 },
  { label: '2x', ms: 500 },
  { label: '5x', ms: 200 },
  { label: '10x', ms: 100 }
]

export function formatReplayProgress(currentIndex: number, totalBars: number): string {
  return `${currentIndex} / ${totalBars}`
}

export interface ReplayControlBarProps {
  isReplaying?: boolean
  isReplayPlaying?: boolean
  replaySpeedMs?: number
  replayCurrentIndex?: number
  replayTotalBars?: number
  setReplaying?: (active: boolean) => void
  toggleReplayPlay?: () => void
  setReplaySpeed?: (speedMs: number) => void
  stepReplayForward?: () => void
  jumpReplayTo?: (index: number) => void
}

export const ReplayControlBar: React.FC<ReplayControlBarProps> = (props) => {
  const store = useChartStore()

  const isReplaying = props.isReplaying ?? store.isReplaying
  const isReplayPlaying = props.isReplayPlaying ?? store.isReplayPlaying
  const replaySpeedMs = props.replaySpeedMs ?? store.replaySpeedMs
  const replayCurrentIndex = props.replayCurrentIndex ?? store.replayCurrentIndex
  const replayTotalBars = props.replayTotalBars ?? store.replayTotalBars
  const setReplaying = props.setReplaying ?? store.setReplaying
  const toggleReplayPlay = props.toggleReplayPlay ?? store.toggleReplayPlay
  const setReplaySpeed = props.setReplaySpeed ?? store.setReplaySpeed
  const stepReplayForward = props.stepReplayForward ?? store.stepReplayForward
  const jumpReplayTo = props.jumpReplayTo ?? store.jumpReplayTo

  // Automated playback timer loop
  useEffect(() => {
    if (!isReplaying || !isReplayPlaying) return
    if (replayTotalBars > 0 && replayCurrentIndex >= replayTotalBars) return

    const timer = setInterval(() => {
      stepReplayForward()
    }, replaySpeedMs)

    return (): void => {
      clearInterval(timer)
    }
  }, [
    isReplaying,
    isReplayPlaying,
    replaySpeedMs,
    replayCurrentIndex,
    replayTotalBars,
    stepReplayForward
  ])

  if (!isReplaying) {
    return null
  }

  const isAtEnd = replayTotalBars > 0 && replayCurrentIndex >= replayTotalBars

  // ponytail: Replay bar uses standard setInterval timer loop; upgrade path: requestAnimationFrame bar interpolation or Web Worker timer for background tab execution.
  return (
    <div
      data-testid="replay-control-bar"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        backgroundColor: THEME_TOKENS.colors.bgSurface,
        border: `1px solid ${THEME_TOKENS.colors.borderMedium}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
        fontFamily: THEME_TOKENS.typography?.fontSans || 'sans-serif'
      }}
    >
      {/* Drag handle / Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
        <svg width="8" height="14" viewBox="0 0 10 16" fill={THEME_TOKENS.colors.textMuted}>
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="14" r="1.5" />
        </svg>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: isReplayPlaying
              ? THEME_TOKENS.colors.bullish
              : THEME_TOKENS.colors.accent,
            boxShadow: `0 0 6px ${
              isReplayPlaying ? THEME_TOKENS.colors.bullish : THEME_TOKENS.colors.accent
            }`
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.3,
            color: THEME_TOKENS.colors.textBright,
            whiteSpace: 'nowrap'
          }}
        >
          Bar Replay
        </span>
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Jump to start */}
      <button
        type="button"
        onClick={() => jumpReplayTo(1)}
        className="tv-btn"
        title="Jump to Start"
        aria-label="Jump to Start"
        style={{ width: 26, height: 26, padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2.5" />
          <polygon points="19 4 9 12 19 20 19 4" />
        </svg>
      </button>

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={toggleReplayPlay}
        disabled={isAtEnd && !isReplayPlaying}
        className={`tv-btn ${isReplayPlaying ? 'active' : ''}`}
        title={isReplayPlaying ? 'Pause Replay' : 'Play Replay'}
        aria-label={isReplayPlaying ? 'Pause Replay' : 'Play Replay'}
        style={{
          width: 26,
          height: 26,
          padding: 0,
          color: isReplayPlaying ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary
        }}
      >
        {isReplayPlaying ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4" height="16" rx="1" />
            <rect x="15" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        )}
      </button>

      {/* Step forward button */}
      <button
        type="button"
        onClick={stepReplayForward}
        disabled={isAtEnd}
        className="tv-btn"
        title="Step Forward 1 Bar"
        aria-label="Step Forward 1 Bar"
        style={{ width: 26, height: 26, padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      </button>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Speed selector pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {REPLAY_SPEED_OPTIONS.map((opt) => {
          const isActive = replaySpeedMs === opt.ms
          return (
            <button
              key={opt.ms}
              type="button"
              onClick={() => setReplaySpeed(opt.ms)}
              className={`tv-btn ${isActive ? 'active' : ''}`}
              title={`Playback speed ${opt.label}`}
              aria-label={`Playback speed ${opt.label}`}
              style={{
                fontSize: 11,
                padding: '2px 6px',
                height: 22,
                borderRadius: 4,
                backgroundColor: isActive ? 'rgba(41, 98, 255, 0.15)' : 'transparent',
                color: isActive ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary,
                fontWeight: isActive ? 600 : 400
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Status counter */}
      <div
        style={{
          fontSize: 11,
          fontFamily: THEME_TOKENS.typography?.fontMono || 'monospace',
          color: THEME_TOKENS.colors.textSecondary,
          whiteSpace: 'nowrap',
          padding: '0 4px'
        }}
      >
        {formatReplayProgress(replayCurrentIndex, replayTotalBars)}
      </div>

      <div style={{ width: 1, height: 16, backgroundColor: THEME_TOKENS.colors.borderMedium }} />

      {/* Exit Replay (X) button */}
      <button
        type="button"
        onClick={() => setReplaying(false)}
        className="tv-btn"
        title="Exit Replay"
        aria-label="Exit Replay"
        style={{
          width: 26,
          height: 26,
          padding: 0,
          color: THEME_TOKENS.colors.textSecondary
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = THEME_TOKENS.colors.bearish
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary
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
      </button>
    </div>
  )
}
