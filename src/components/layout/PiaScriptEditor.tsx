// ponytail: PiaScript lightweight in-house IntelliSense without heavy Monaco/CodeMirror bundle overhead.
// Upgrade path: migrate to full CodeMirror 6 extension if language server protocol (LSP) is required.

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { THEME_TOKENS } from '../../theme/tokens'

export interface CompletionItem {
  label: string
  insertText: string
  detail: string
  kind: 'function' | 'series' | 'action' | 'keyword'
  doc: string
  cursorOffset?: number // relative offset from end of insertText
}

export const PIASCRIPT_COMPLETIONS: CompletionItem[] = [
  // Builtin Indicators & EA Math
  { label: 'atr', insertText: 'atr(14)', detail: 'atr(period)', kind: 'function', doc: 'Average True Range volatility indicator for dynamic SL/TP' },
  { label: 'macd', insertText: 'macd(close, 12, 26)', detail: 'macd(src, fast, slow)', kind: 'function', doc: 'MACD Line (Fast EMA minus Slow EMA)' },
  { label: 'macd_signal', insertText: 'macd_signal(close, 12, 26, 9)', detail: 'macd_signal(src, fast, slow, signal)', kind: 'function', doc: 'MACD Signal Line (EMA of MACD Line)' },
  { label: 'macd_hist', insertText: 'macd_hist(close, 12, 26, 9)', detail: 'macd_hist(src, fast, slow, signal)', kind: 'function', doc: 'MACD Histogram (MACD Line minus Signal Line)' },
  { label: 'bb_upper', insertText: 'bb_upper(close, 20, 2.0)', detail: 'bb_upper(src, period, mult)', kind: 'function', doc: 'Bollinger Bands Upper Band (SMA + mult * StDev)' },
  { label: 'bb_lower', insertText: 'bb_lower(close, 20, 2.0)', detail: 'bb_lower(src, period, mult)', kind: 'function', doc: 'Bollinger Bands Lower Band (SMA - mult * StDev)' },
  { label: 'bb_basis', insertText: 'bb_basis(close, 20)', detail: 'bb_basis(src, period)', kind: 'function', doc: 'Bollinger Bands Middle Basis (SMA)' },
  { label: 'ema', insertText: 'ema(close, 9)', detail: 'ema(src, period)', kind: 'function', doc: 'Exponential Moving Average' },
  { label: 'sma', insertText: 'sma(close, 20)', detail: 'sma(src, period)', kind: 'function', doc: 'Simple Moving Average' },
  { label: 'rsi', insertText: 'rsi(close, 14)', detail: 'rsi(src, period)', kind: 'function', doc: 'Relative Strength Index (0-100 oscillator)' },
  { label: 'crossover', insertText: 'crossover(fast, slow)', detail: 'crossover(a, b)', kind: 'function', doc: 'Returns true when a crosses above b' },
  { label: 'crossunder', insertText: 'crossunder(fast, slow)', detail: 'crossunder(a, b)', kind: 'function', doc: 'Returns true when a crosses below b' },
  { label: 'highest', insertText: 'highest(high, 20)', detail: 'highest(src, period)', kind: 'function', doc: 'Highest value over past period bars' },
  { label: 'lowest', insertText: 'lowest(low, 20)', detail: 'lowest(src, period)', kind: 'function', doc: 'Lowest value over past period bars' },
  { label: 'input', insertText: 'input(14)', detail: 'input(default)', kind: 'function', doc: 'Defines an adjustable parameter input for the Expert Advisor' },
  { label: 'abs', insertText: 'abs(src)', detail: 'abs(src)', kind: 'function', doc: 'Absolute value' },
  { label: 'plot', insertText: 'plot(val, color="#00bcd4", title="")', detail: 'plot(series, color, title)', kind: 'function', doc: 'Plots an indicator series onto the chart canvas' },

  // Actions (EA Execution)
  { label: 'buy', insertText: 'buy(1, sl=low - atr(14), tp=close + 2 * atr(14))', detail: 'buy(size, sl, tp)', kind: 'action', doc: 'Enter LONG with optional Stop Loss and Take Profit brackets' },
  { label: 'sell', insertText: 'sell(1, sl=high + atr(14), tp=close - 2 * atr(14))', detail: 'sell(size, sl, tp)', kind: 'action', doc: 'Enter SHORT with optional Stop Loss and Take Profit brackets' },
  { label: 'close', insertText: 'close()', detail: 'close()', kind: 'action', doc: 'Close any currently open trade position' },

  // Candle Data Series
  { label: 'close', insertText: 'close', detail: 'Series', kind: 'series', doc: 'Candle closing price (close[1] for previous bar)' },
  { label: 'open', insertText: 'open', detail: 'Series', kind: 'series', doc: 'Candle opening price' },
  { label: 'high', insertText: 'high', detail: 'Series', kind: 'series', doc: 'Candle highest price' },
  { label: 'low', insertText: 'low', detail: 'Series', kind: 'series', doc: 'Candle lowest price' },
  { label: 'volume', insertText: 'volume', detail: 'Series', kind: 'series', doc: 'Candle trading volume' },
  { label: 'hl2', insertText: 'hl2', detail: 'Series', kind: 'series', doc: 'Median price: (high + low) / 2' },
  { label: 'hlc3', insertText: 'hlc3', detail: 'Series', kind: 'series', doc: 'Typical price: (high + low + close) / 3' },

  // Keywords
  { label: 'if', insertText: 'if condition:\n    ', detail: 'Keyword', kind: 'keyword', doc: 'Conditional branch execution' },
  { label: 'and', insertText: 'and ', detail: 'Keyword', kind: 'keyword', doc: 'Logical AND operator' },
  { label: 'or', insertText: 'or ', detail: 'Keyword', kind: 'keyword', doc: 'Logical OR operator' }
]

interface PiaScriptEditorProps {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export const PiaScriptEditor: React.FC<PiaScriptEditorProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const [completions, setCompletions] = useState<CompletionItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const [matchedPrefix, setMatchedPrefix] = useState('')

  const lineCount = Math.max(1, value.split('\n').length)

  // Sync scroll of line numbers gutter with textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>): void => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  const dismissPopup = useCallback(() => {
    setCompletions([])
    setPopupPos(null)
    setMatchedPrefix('')
  }, [])

  // Check prefix at cursor for IntelliSense suggestions
  const updateCompletions = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    const cursor = el.selectionStart
    const textBefore = value.slice(0, cursor)
    const match = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/)

    if (!match || match[1].length < 1) {
      dismissPopup()
      return
    }

    const prefix = match[1]
    const matches = PIASCRIPT_COMPLETIONS.filter((item) =>
      item.label.toLowerCase().startsWith(prefix.toLowerCase())
    )

    if (matches.length === 0) {
      dismissPopup()
      return
    }

    // Calculate approximate caret position based on lines & cols
    const lines = textBefore.split('\n')
    const currentLineIdx = lines.length - 1
    const currentColIdx = lines[currentLineIdx].length

    const lineHeight = 19.2
    const charWidth = 7.2
    const gutterWidth = 44

    const top = 10 + (currentLineIdx + 1) * lineHeight - el.scrollTop
    const left = gutterWidth + 14 + currentColIdx * charWidth - el.scrollLeft

    setMatchedPrefix(prefix)
    setCompletions(matches)
    setSelectedIndex(0)
    setPopupPos({ top: Math.max(10, top), left: Math.max(gutterWidth + 10, left) })
  }, [value, dismissPopup])

  const insertCompletion = useCallback(
    (item: CompletionItem) => {
      const el = textareaRef.current
      if (!el) return

      const cursor = el.selectionStart
      const textBefore = value.slice(0, cursor)
      const textAfter = value.slice(cursor)
      const prefixLen = matchedPrefix.length

      const replacedBefore = textBefore.slice(0, -prefixLen) + item.insertText
      const newValue = replacedBefore + textAfter
      onChange(newValue)

      dismissPopup()

      // Restore focus and position cursor sensibly
      setTimeout(() => {
        if (!el) return
        el.focus()
        const newCursorPos = replacedBefore.length
        el.selectionStart = el.selectionEnd = newCursorPos
      }, 0)
    },
    [value, matchedPrefix, onChange, dismissPopup]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (completions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % completions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + completions.length) % completions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (completions[selectedIndex]) {
          insertCompletion(completions[selectedIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissPopup()
        return
      }
    }

    // Indentation Tab key support
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const updated = value.substring(0, start) + '    ' + value.substring(end)
      onChange(updated)
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4
      }, 0)
    }
  }

  // Recalculate completions on cursor moves
  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return
    updateCompletions()
  }

  const handleClick = (): void => {
    updateCompletions()
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flex: 1,
        height: '100%',
        backgroundColor: '#12141a',
        overflow: 'hidden'
      }}
    >
      {/* Line Numbers Gutter */}
      <div
        ref={lineNumbersRef}
        style={{
          width: 44,
          padding: '10px 8px 10px 0',
          textAlign: 'right',
          fontFamily: 'Consolas, "Fira Code", monospace',
          fontSize: 12,
          lineHeight: '19.2px',
          color: '#555b6e',
          backgroundColor: '#0d0f14',
          borderRight: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          userSelect: 'none',
          overflowY: 'hidden'
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </div>

      {/* Code Textarea Area */}
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
          setTimeout(updateCompletions, 0)
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        onScroll={handleScroll}
        spellCheck={false}
        data-testid="piascript-editor-textarea"
        style={{
          flex: 1,
          height: '100%',
          padding: '10px 14px',
          fontFamily: 'Consolas, "Fira Code", monospace',
          fontSize: 12,
          color: '#9cdcfe',
          backgroundColor: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          lineHeight: '19.2px',
          whiteSpace: 'pre',
          overflowX: 'auto',
          overflowY: 'auto'
        }}
      />

      {/* IntelliSense Dropdown Popup */}
      {popupPos && completions.length > 0 && (
        <div
          data-testid="piascript-intellisense-popup"
          style={{
            position: 'absolute',
            top: popupPos.top,
            left: Math.min(popupPos.left, 450),
            zIndex: 1000,
            width: 320,
            maxHeight: 220,
            overflowY: 'auto',
            backgroundColor: '#1a1d26',
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontSize: 11,
            fontFamily: 'Consolas, "Fira Code", monospace'
          }}
        >
          {completions.map((item, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <div
                key={`${item.label}-${item.kind}-${idx}`}
                onClick={() => insertCompletion(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(41, 98, 255, 0.25)' : 'transparent',
                  borderLeft: isSelected ? `3px solid ${THEME_TOKENS.colors.accent}` : '3px solid transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        padding: '1px 4px',
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 3,
                        backgroundColor: getKindBadgeColor(item.kind),
                        color: '#fff'
                      }}
                    >
                      {item.kind.slice(0, 3)}
                    </span>
                    <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textBright }}>
                      {item.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: THEME_TOKENS.colors.textMuted }}>
                    {item.detail}
                  </span>
                </div>
                {isSelected && item.doc && (
                  <div
                    style={{
                      fontSize: 10,
                      color: THEME_TOKENS.colors.textSecondary,
                      marginTop: 3,
                      fontFamily: THEME_TOKENS.typography?.fontSans
                    }}
                  >
                    {item.doc}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getKindBadgeColor(kind: CompletionItem['kind']): string {
  switch (kind) {
    case 'function':
      return '#2962ff'
    case 'action':
      return '#26a69a'
    case 'series':
      return '#ff9800'
    case 'keyword':
      return '#ab47bc'
    default:
      return '#787b86'
  }
}
