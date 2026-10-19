import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleScalpingHotkey, isEditableElement } from './useScalpingHotkeys'
import { useMarketStore } from '../stores/useMarketStore'
import { usePaperTradingStore } from '../stores/usePaperTradingStore'

describe('useScalpingHotkeys', () => {
  let originalOpenPosition: any
  let originalCloseAllPositions: any
  let mockOpenPosition: ReturnType<typeof vi.fn>
  let mockCloseAllPositions: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalOpenPosition = usePaperTradingStore.getState().openPosition
    originalCloseAllPositions = usePaperTradingStore.getState().closeAllPositions

    mockOpenPosition = vi.fn().mockResolvedValue({ success: true })
    mockCloseAllPositions = vi.fn().mockResolvedValue(true)

    useMarketStore.setState({
      symbol: 'BTCUSDT',
      prices: {
        BTCUSDT: {
          symbol: 'BTCUSDT',
          price: 65000,
          bid: 64998,
          ask: 65002,
          timestamp: Date.now()
        }
      }
    })

    usePaperTradingStore.setState({
      activeLotSize: 0.25,
      accountType: 'standard',
      openPosition: mockOpenPosition as any,
      closeAllPositions: mockCloseAllPositions as any
    })
  })

  afterEach(() => {
    usePaperTradingStore.setState({
      openPosition: originalOpenPosition,
      closeAllPositions: originalCloseAllPositions
    })
    vi.restoreAllMocks()
  })

  it('triggers Quick Buy Market when Shift + B is pressed', async () => {
    const preventDefault = vi.fn()
    const handled = await handleScalpingHotkey({
      key: 'B',
      code: 'KeyB',
      shiftKey: true,
      preventDefault
    })

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockOpenPosition).toHaveBeenCalledTimes(1)
    expect(mockOpenPosition).toHaveBeenCalledWith({
      symbol: 'BTCUSDT',
      side: 'buy',
      size: 0.25,
      price: 65002,
      accountType: 'standard',
      comment: 'Hotkey Shift+B'
    })
  })

  it('triggers Quick Sell Market when Shift + S is pressed', async () => {
    const preventDefault = vi.fn()
    const handled = await handleScalpingHotkey({
      key: 'S',
      code: 'KeyS',
      shiftKey: true,
      preventDefault
    })

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockOpenPosition).toHaveBeenCalledTimes(1)
    expect(mockOpenPosition).toHaveBeenCalledWith({
      symbol: 'BTCUSDT',
      side: 'sell',
      size: 0.25,
      price: 64998,
      accountType: 'standard',
      comment: 'Hotkey Shift+S'
    })
  })

  it('triggers Close All Positions when Shift + X is pressed', async () => {
    const preventDefault = vi.fn()
    const handled = await handleScalpingHotkey({
      key: 'X',
      code: 'KeyX',
      shiftKey: true,
      preventDefault
    })

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockCloseAllPositions).toHaveBeenCalledTimes(1)
    expect(mockCloseAllPositions).toHaveBeenCalledWith(undefined, 65000)
  })

  it('ignores hotkey presses when user is typing in an input element', async () => {
    const handled = await handleScalpingHotkey({
      key: 'B',
      code: 'KeyB',
      shiftKey: true,
      target: { tagName: 'INPUT' }
    })

    expect(handled).toBe(false)
    expect(mockOpenPosition).not.toHaveBeenCalled()
  })

  it('correctly identifies editable form controls', () => {
    expect(isEditableElement({ tagName: 'input' })).toBe(true)
    expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableElement({ tagName: 'select' })).toBe(true)
    expect(isEditableElement({ isContentEditable: true })).toBe(true)
    expect(isEditableElement({ tagName: 'DIV' })).toBe(false)
    expect(isEditableElement(null)).toBe(false)
    expect(isEditableElement(undefined)).toBe(false)
  })

  it('ignores keys without Shift modifier or with other modifiers like Ctrl/Alt', async () => {
    // Just 'b' without Shift
    const handledNoShift = await handleScalpingHotkey({
      key: 'b',
      code: 'KeyB',
      shiftKey: false
    })
    expect(handledNoShift).toBe(false)
    expect(mockOpenPosition).not.toHaveBeenCalled()

    // Ctrl + Shift + B
    const handledWithCtrl = await handleScalpingHotkey({
      key: 'B',
      code: 'KeyB',
      shiftKey: true,
      ctrlKey: true
    })
    expect(handledWithCtrl).toBe(false)
    expect(mockOpenPosition).not.toHaveBeenCalled()
  })
})
