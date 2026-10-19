import { useEffect } from 'react'
import { useMarketStore } from '../stores/useMarketStore'
import { usePaperTradingStore } from '../stores/usePaperTradingStore'

/**
 * Checks whether user is currently focused on an editable element,
 * to prevent accidental hotkey execution when typing search terms or inputs.
 */
export function isEditableElement(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  const tag = (el.tagName || '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable)
}

export interface ScalpingKeyEvent {
  target?: unknown
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  code?: string
  key?: string
  preventDefault?: () => void
}

/**
 * Handles individual hotkey event:
 * - Shift + B: Quick Buy Market
 * - Shift + S: Quick Sell Market
 * - Shift + X: Close All Positions
 *
 * Returns true if an action was handled/executed, false otherwise.
 */
export async function handleScalpingHotkey(e: ScalpingKeyEvent): Promise<boolean> {
  // Ignore if user is typing in form controls or modifier combinations like Ctrl/Alt/Meta
  if (isEditableElement(e.target)) return false
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false

  const code = e.code || ''
  const key = (e.key || '').toUpperCase()

  const isB = code === 'KeyB' || key === 'B'
  const isS = code === 'KeyS' || key === 'S'
  const isX = code === 'KeyX' || key === 'X'

  if (!isB && !isS && !isX) return false

  e.preventDefault?.()

  const { symbol, prices } = useMarketStore.getState()
  const { openPosition, closeAllPositions, activeLotSize, accountType } = usePaperTradingStore.getState()

  if (isX) {
    const markPrice = symbol && prices[symbol]?.price ? prices[symbol].price : undefined
    return await closeAllPositions(undefined, markPrice)
  }

  if (!symbol) return false
  const quote = prices[symbol]
  if (!quote || quote.price <= 0) return false

  const lotSize = activeLotSize > 0 ? activeLotSize : 0.10

  if (isB) {
    const askPrice = quote.ask ?? quote.price
    const res = await openPosition({
      symbol,
      side: 'buy',
      size: lotSize,
      price: askPrice,
      accountType,
      comment: 'Hotkey Shift+B'
    })
    return res.success
  } else if (isS) {
    const bidPrice = quote.bid ?? quote.price
    const res = await openPosition({
      symbol,
      side: 'sell',
      size: lotSize,
      price: bidPrice,
      accountType,
      comment: 'Hotkey Shift+S'
    })
    return res.success
  }

  return false
}

/**
 * Global Scalping Hotkeys Hook
 * - Shift + B: Quick Buy Market
 * - Shift + S: Quick Sell Market
 * - Shift + X: Close All Positions
 *
 * Automatically triggers the order filled sound and notifications via usePaperTradingStore.
 */
export function useScalpingHotkeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleScalpingHotkey)
    return () => {
      window.removeEventListener('keydown', handleScalpingHotkey)
    }
  }, [enabled])
}
