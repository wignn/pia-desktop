/**
 * PIA Terminal - Chart Position Overlay Synchronizer
 * Renders live visual position, TP, and SL lines on KLineCharts with real-time PnL badges.
 */

import type { Chart } from 'klinecharts'
import type { CustomEntryDraft, PaperOrder, PaperPosition, PriceQuote } from '@shared/types'
import { getSymbolPrecision } from '@shared/market-utils'
import { THEME_TOKENS } from '../../theme/tokens'

export interface PositionOverlaySyncParams {
  chart: Chart | null
  positions: PaperPosition[]
  orders?: PaperOrder[]
  currentSymbol: string | null
  prices: Record<string, PriceQuote>
  accountType: 'standard' | 'cent'
  customEntryDraft?: CustomEntryDraft | null
  onClosePosition?: (positionId: string) => void
  onUpdatePosition?: (
    positionId: string,
    updates: { entryPrice?: number; takeProfit?: number; stopLoss?: number }
  ) => void
  onCancelOrder?: (orderId: string) => void
  onUpdateOrder?: (orderId: string, updates: { price: number }) => void
  onUpdateCustomEntryPrice?: (newPrice: number) => void
  isOverlayDragging?: (active?: boolean) => boolean | void
}

/**
 * Formats PnL according to standard ($ USD) or cent (¢ USC) account requirements.
 * In a USD Cent (USC) account, 1 USD = 100 US Cents (¢).
 */
export function formatPnL(pnl: number, accountType: 'standard' | 'cent'): string {
  const sign = pnl >= 0 ? '+' : '-'
  const absPnl = Math.abs(pnl)
  const formatted = absPnl.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  if (accountType === 'cent') {
    return `${sign}${formatted} ¢`
  }
  return `${sign}$${formatted}`
}

/**
 * Calculates pip difference between current price and position entry price.
 * Accurately handles Forex (0.0001), JPY (0.01), Gold/Metals (0.1), Indices (1.0), and Crypto (1.0).
 */
export function calculatePipDifference(pos: PaperPosition, currentPrice: number): number {
  const upper = (pos.symbol || '').toUpperCase()
  const isJpy = upper.includes('JPY')
  const isGold = upper.includes('XAU') || upper.includes('GOLD')
  const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT', 'BNB', 'XRP', 'DOGE'].some((c) => upper.includes(c))
  const isIndex = ['US30', 'US500', 'NAS100', 'SPX', 'NDX', 'DJI'].some((c) => upper.includes(c))

  let pipSize = 0.0001
  if (isCrypto || isIndex) {
    pipSize = 1.0
  } else if (isGold) {
    pipSize = 0.1
  } else if (isJpy) {
    pipSize = 0.01
  } else if (pos.entryPrice > 500) {
    pipSize = 0.1
  }

  const diff = pos.side === 'buy' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice
  return diff / pipSize
}

/**
 * Calculates unrealized position PnL.
 * In USD Cent (USC) accounts, 1 USD = 100 US Cents (¢).
 */
export function calculatePositionPnL(
  pos: PaperPosition,
  markPrice: number,
  accountType?: 'standard' | 'cent'
): number {
  const isCent = accountType === 'cent' || pos.accountType === 'cent' || pos.lotType === 'cent'
  const diff = pos.side === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice
  const basePnl = diff * pos.size
  // In a USD Cent (USC) account, 1 USD = 100 US Cents (¢)
  return isCent ? basePnl * 100 : basePnl
}

/**
 * Formats price using symbol metadata precision.
 */
function formatPrice(price: number, symbol: string): string {
  try {
    const { pricePrecision } = getSymbolPrecision(symbol, undefined, price)
    return price.toFixed(pricePrecision)
  } catch {
    return price.toString()
  }
}

/**
 * Formats position entry badge in sleek TradingView / MT5 institutional style:
 * SIDE LOTS • ENTRY_PRICE • PNL ✕
 */
export function formatPositionBadge(
  pos: PaperPosition,
  currentPrice: number,
  accountType: 'standard' | 'cent'
): string {
  const pnl = calculatePositionPnL(pos, currentPrice, accountType)
  const pnlStr = formatPnL(pnl, accountType)
  const priceStr = formatPrice(pos.entryPrice, pos.symbol)
  const lotsStr = pos.size.toFixed(2)
  const sideStr = pos.side.toUpperCase()

  return `${sideStr} ${lotsStr} • ${priceStr} • ${pnlStr} ✕`
}

/**
 * Formats pending order badge (Buy Limit, Sell Limit, Buy Stop, Sell Stop):
 * TYPE LOTS • PRICE ✕
 */
export function formatPendingOrderBadge(order: PaperOrder): string {
  const typeLabel = order.type.replace('_', ' ').toUpperCase()
  const priceStr = formatPrice(order.price, order.symbol)
  const lotsStr = order.size.toFixed(2)
  return `${typeLabel} ${lotsStr} • ${priceStr} ✕`
}

/**
 * Formats TP badge in TradingView / MT5 style:
 * TP • PRICE • PNL ✕
 */
export function formatTpBadge(pos: PaperPosition, accountType: 'standard' | 'cent'): string {
  if (typeof pos.takeProfit !== 'number') return ''
  const pnl = calculatePositionPnL(pos, pos.takeProfit, accountType)
  const pnlStr = formatPnL(pnl, accountType)
  const priceStr = formatPrice(pos.takeProfit, pos.symbol)
  return `TP • ${priceStr} • ${pnlStr} ✕`
}

/**
 * Formats SL badge in TradingView / MT5 style:
 * SL • PRICE • PNL ✕
 */
export function formatSlBadge(pos: PaperPosition, accountType: 'standard' | 'cent'): string {
  if (typeof pos.stopLoss !== 'number') return ''
  const pnl = calculatePositionPnL(pos, pos.stopLoss, accountType)
  const pnlStr = formatPnL(pnl, accountType)
  const priceStr = formatPrice(pos.stopLoss, pos.symbol)
  return `SL • ${priceStr} • ${pnlStr} ✕`
}

/**
 * Formats custom entry draft preview badge:
 * TYPE LOTS • PRICE (↕ Drag to place)
 */
export function formatCustomEntryBadge(
  draft: CustomEntryDraft,
  symbol: string
): string {
  const priceStr = formatPrice(draft.price, symbol)
  const lotsStr = draft.size.toFixed(2)
  const typeStr = draft.orderType && draft.orderType !== 'market'
    ? `${draft.side.toUpperCase()} ${draft.orderType.toUpperCase()}`
    : `CUSTOM ${draft.side.toUpperCase()}`
  return `${typeStr} ${lotsStr} • ${priceStr}  (↕ Drag to place)`
}

/**
 * Synchronizes visual position lines (Entry, TP, SL) onto the KLineCharts instance.
 */
export function syncPositionOverlays(
  params: PositionOverlaySyncParams,
  activeOverlayIdsRef: { current: Set<string> }
): void {
  const {
    chart,
    positions,
    currentSymbol,
    prices,
    accountType,
    customEntryDraft,
    onClosePosition,
    onUpdatePosition,
    onUpdateCustomEntryPrice,
    isOverlayDragging
  } = params

  // Price ticks can re-render the chart while a line is being dragged. Keep its
  // current overlay instance alive until pointer-up, then sync from persisted state.
  if (isOverlayDragging?.()) return

  if (!chart) return

  if (!currentSymbol) {
    clearPositionOverlays(chart, activeOverlayIdsRef)
    return
  }

  const cleanCurrentSymbol = currentSymbol.toUpperCase()
  const matchingPositions = positions.filter(
    (pos) => (pos.symbol || '').toUpperCase() === cleanCurrentSymbol
  )

  const newActiveIds = new Set<string>()

  for (const pos of matchingPositions) {
    const quote = prices[currentSymbol] || prices[cleanCurrentSymbol] || prices[pos.symbol]
    const markPrice = quote && typeof quote.price === 'number' ? quote.price : pos.entryPrice

    // 1. Entry Overlay (Slideable, with TradingView profit/loss dynamic color styling)
    const entryId = `pos_entry_${pos.id}`
    newActiveIds.add(entryId)
    const entryBadge = formatPositionBadge(pos, markPrice, accountType)
    const initialPnL = calculatePositionPnL(pos, markPrice, accountType)
    const entryColor =
      initialPnL > 0
        ? THEME_TOKENS.colors.bullish
        : initialPnL < 0
          ? THEME_TOKENS.colors.bearish
          : THEME_TOKENS.colors.accent

    const entryConfig = {
      name: 'priceLine',
      id: entryId,
      lock: false,
      points: [{ value: pos.entryPrice }],
      styles: {
        line: {
          color: entryColor,
          size: 1.5,
          style: 'dashed' as const,
          dashedValue: [5, 4]
        },
        text: {
          color: entryColor,
          size: 11,
          family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      },
      extendData: {
        text: entryBadge,
        type: 'entry',
        positionId: pos.id
      },
      onPressedMoveStart: () => {
        isOverlayDragging?.(true)
      },
        onClick: onClosePosition
          ? () => {
              isOverlayDragging?.(true)
              onClosePosition(pos.id)
            }
          : undefined,
      onPressedMoving: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0 && event?.overlay?.extendData) {
          const tempPos = { ...pos, entryPrice: newPrice }
          event.overlay.extendData.text = formatPositionBadge(tempPos, markPrice, accountType)
        }
      },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0 && onUpdatePosition) {
          onUpdatePosition(pos.id, { entryPrice: newPrice })
        }
      },
      createPointFigures: ({ bounding, coordinates, overlay }: any) => {
        const lineY = coordinates[0]?.y ?? 0
        const text = (overlay?.extendData?.text as string) || entryBadge
        const currentEntry = overlay?.points?.[0]?.value ?? pos.entryPrice
        const curPnL = calculatePositionPnL({ ...pos, entryPrice: currentEntry }, markPrice, accountType)
        const figColor =
          curPnL > 0
            ? THEME_TOKENS.colors.bullish
            : curPnL < 0
              ? THEME_TOKENS.colors.bearish
              : THEME_TOKENS.colors.accent
        const figBg =
          curPnL > 0
            ? 'rgba(16, 185, 129, 0.95)'
            : curPnL < 0
              ? 'rgba(244, 63, 94, 0.95)'
              : 'rgba(30, 41, 59, 0.95)'
        const figBorder =
          curPnL > 0
            ? '#059669'
            : curPnL < 0
              ? '#e11d48'
              : '#3b82f6'

        return [
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x: 0, y: lineY },
                { x: bounding.width, y: lineY }
              ]
            },
            styles: {
              color: figColor,
              size: 1.5,
              style: 'dashed',
              dashedValue: [5, 4]
            }
          },
          {
            type: 'text',
            ignoreEvent: false,
            attrs: {
              x: 10,
              y: lineY - 4,
              text,
              baseline: 'bottom'
            },
            styles: {
              color: '#ffffff',
              backgroundColor: figBg,
              size: 11,
              weight: 'bold',
              family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 4,
              borderColor: figBorder,
              borderSize: 1.5
            }
          }
        ]
      }
    }

    if (activeOverlayIdsRef.current.has(entryId)) {
      chart.removeOverlay({ id: entryId })
    }
    chart.createOverlay(entryConfig as any)

    // 2. Take Profit Overlay (Slideable)
    if (typeof pos.takeProfit === 'number' && pos.takeProfit > 0) {
      const tpId = `pos_tp_${pos.id}`
      newActiveIds.add(tpId)
      const tpBadge = formatTpBadge(pos, accountType)
      const tpColor = THEME_TOKENS.colors.bullish

      const tpConfig = {
        name: 'priceLine',
        id: tpId,
        lock: false,
        points: [{ value: pos.takeProfit }],
        styles: {
          line: {
            color: tpColor,
            size: 1.5,
            style: 'dashed' as const,
            dashedValue: [5, 4]
          },
          text: {
            color: tpColor,
            size: 11,
            family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }
        },
        extendData: {
          text: tpBadge,
          type: 'tp',
          positionId: pos.id
        },
        onPressedMoveStart: () => {
          isOverlayDragging?.(true)
        },
        onPressedMoving: (event: any) => {
          const newPrice = event?.overlay?.points?.[0]?.value
          if (typeof newPrice === 'number' && newPrice > 0 && event?.overlay?.extendData) {
            const tempPos = { ...pos, takeProfit: newPrice }
            event.overlay.extendData.text = formatTpBadge(tempPos, accountType)
          }
        },
        onPressedMoveEnd: (event: any) => {
          const newPrice = event?.overlay?.points?.[0]?.value
          if (typeof newPrice === 'number' && newPrice > 0 && onUpdatePosition) {
            onUpdatePosition(pos.id, { takeProfit: newPrice })
          }
        },
        createPointFigures: ({ bounding, coordinates, overlay }: any) => {
          const lineY = coordinates[0]?.y ?? 0
          const text = (overlay?.extendData?.text as string) || tpBadge
          return [
            {
              type: 'line',
              attrs: {
                coordinates: [
                  { x: 0, y: lineY },
                  { x: bounding.width, y: lineY }
                ]
              },
              styles: {
                color: tpColor,
                size: 1.5,
                style: 'dashed',
                dashedValue: [5, 4]
              }
            },
            {
              type: 'text',
              ignoreEvent: false,
              attrs: {
                x: 10,
                y: lineY - 4,
                text,
                baseline: 'bottom'
              },
              styles: {
                color: '#ffffff',
                backgroundColor: 'rgba(16, 185, 129, 0.95)',
                size: 11,
                weight: 'bold',
                family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 3,
                paddingBottom: 3,
                borderRadius: 4,
                borderColor: '#059669',
                borderSize: 1.5
              }
            }
          ]
        }
      }

      if (activeOverlayIdsRef.current.has(tpId)) {
        chart.removeOverlay({ id: tpId })
      }
      chart.createOverlay(tpConfig as any)
    }

    // 3. Stop Loss Overlay (Slideable)
    if (typeof pos.stopLoss === 'number' && pos.stopLoss > 0) {
      const slId = `pos_sl_${pos.id}`
      newActiveIds.add(slId)
      const slBadge = formatSlBadge(pos, accountType)
      const slColor = THEME_TOKENS.colors.bearish

      const slConfig = {
        name: 'priceLine',
        id: slId,
        lock: false,
        points: [{ value: pos.stopLoss }],
        styles: {
          line: {
            color: slColor,
            size: 1.5,
            style: 'dashed' as const,
            dashedValue: [5, 4]
          },
          text: {
            color: slColor,
            size: 11,
            family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }
        },
        extendData: {
          text: slBadge,
          type: 'sl',
          positionId: pos.id
        },
        onPressedMoveStart: () => {
          isOverlayDragging?.(true)
        },
        onPressedMoving: (event: any) => {
          const newPrice = event?.overlay?.points?.[0]?.value
          if (typeof newPrice === 'number' && newPrice > 0 && event?.overlay?.extendData) {
            const tempPos = { ...pos, stopLoss: newPrice }
            event.overlay.extendData.text = formatSlBadge(tempPos, accountType)
          }
        },
        onPressedMoveEnd: (event: any) => {
          const newPrice = event?.overlay?.points?.[0]?.value
          if (typeof newPrice === 'number' && newPrice > 0 && onUpdatePosition) {
            onUpdatePosition(pos.id, { stopLoss: newPrice })
          }
        },
        createPointFigures: ({ bounding, coordinates, overlay }: any) => {
          const lineY = coordinates[0]?.y ?? 0
          const text = (overlay?.extendData?.text as string) || slBadge
          return [
            {
              type: 'line',
              attrs: {
                coordinates: [
                  { x: 0, y: lineY },
                  { x: bounding.width, y: lineY }
                ]
              },
              styles: {
                color: slColor,
                size: 1.5,
                style: 'dashed',
                dashedValue: [5, 4]
              }
            },
            {
              type: 'text',
              ignoreEvent: false,
              attrs: {
                x: 10,
                y: lineY - 4,
                text,
                baseline: 'bottom'
              },
              styles: {
                color: '#ffffff',
                backgroundColor: 'rgba(244, 63, 94, 0.95)',
                size: 11,
                weight: 'bold',
                family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 3,
                paddingBottom: 3,
                borderRadius: 4,
                borderColor: '#e11d48',
                borderSize: 1.5
              }
            }
          ]
        }
      }

      if (activeOverlayIdsRef.current.has(slId)) {
        chart.removeOverlay({ id: slId })
      }
      chart.createOverlay(slConfig as any)
    }
  }

  // 4. Custom Entry Preview Line (Slideable on chart)
  if (
    customEntryDraft &&
    customEntryDraft.active &&
    (customEntryDraft.symbol || '').toUpperCase() === cleanCurrentSymbol &&
    customEntryDraft.price > 0
  ) {
    const draftId = 'draft_custom_entry'
    newActiveIds.add(draftId)
    const draftBadge = formatCustomEntryBadge(customEntryDraft, cleanCurrentSymbol)
    const draftColor = THEME_TOKENS.colors.gold

    const draftConfig = {
      name: 'priceLine',
      id: draftId,
      lock: false,
      points: [{ value: customEntryDraft.price }],
      styles: {
        line: {
          color: draftColor,
          size: 2,
          style: 'dashed' as const,
          dashedValue: [6, 4]
        },
        text: {
          color: draftColor,
          size: 11,
          family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      },
      extendData: {
        text: draftBadge,
        type: 'custom_draft'
      },
      onPressedMoveStart: () => {
        isOverlayDragging?.(true)
      },
      onPressedMoving: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0) {
          if (event?.overlay?.extendData) {
            event.overlay.extendData.text = formatCustomEntryBadge(
              { ...customEntryDraft, price: newPrice },
              cleanCurrentSymbol
            )
          }
          onUpdateCustomEntryPrice?.(newPrice)
        }
      },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0 && onUpdateCustomEntryPrice) {
          onUpdateCustomEntryPrice(newPrice)
        }
      },
      createPointFigures: ({ bounding, coordinates, overlay }: any) => {
        const lineY = coordinates[0]?.y ?? 0
        const text = (overlay?.extendData?.text as string) || draftBadge
        return [
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x: 0, y: lineY },
                { x: bounding.width, y: lineY }
              ]
            },
            styles: {
              color: draftColor,
              size: 2,
              style: 'dashed',
              dashedValue: [6, 4]
            }
          },
          {
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: 10,
              y: lineY - 4,
              text,
              baseline: 'bottom'
            },
            styles: {
              color: '#ffffff',
              backgroundColor: 'rgba(19, 23, 34, 0.95)',
              size: 11,
              weight: 'bold',
              family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 4,
              borderColor: draftColor,
              borderSize: 1.5
            }
          }
        ]
      }
    }

    if (activeOverlayIdsRef.current.has(draftId)) {
      chart.removeOverlay({ id: draftId })
    }
    chart.createOverlay(draftConfig as any)
  }

  // 5. Active Pending Orders (Slideable, Buy Limit / Sell Limit / Buy Stop / Sell Stop)
  const activeOrders = (params.orders || []).filter(
    (o) =>
      (o.symbol || '').toUpperCase() === cleanCurrentSymbol && (!o.status || o.status === 'pending')
  )

  for (const order of activeOrders) {
    const orderOverlayId = `order_${order.id}`
    newActiveIds.add(orderOverlayId)
    const orderBadge = formatPendingOrderBadge(order)
    const isBuy = order.side === 'buy' || order.type.startsWith('buy')
    const orderColor = isBuy ? '#06b6d4' : '#f59e0b'

    const orderConfig = {
      name: 'priceLine',
      id: orderOverlayId,
      lock: false,
      points: [{ value: order.price }],
      styles: {
        line: {
          color: orderColor,
          size: 1.5,
          style: 'dashed' as const,
          dashedValue: [5, 4]
        },
        text: {
          color: orderColor,
          size: 11,
          family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      },
      extendData: {
        text: orderBadge,
        type: 'pending_order',
        orderId: order.id
      },
      onPressedMoveStart: () => {
        isOverlayDragging?.(true)
      },
        onClick: params.onCancelOrder
          ? () => {
              isOverlayDragging?.(true)
              params.onCancelOrder!(order.id)
            }
          : undefined,
      onPressedMoving: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0 && event?.overlay?.extendData) {
          const tempOrder = { ...order, price: newPrice }
          event.overlay.extendData.text = formatPendingOrderBadge(tempOrder)
        }
      },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event?.overlay?.points?.[0]?.value
        if (typeof newPrice === 'number' && newPrice > 0 && params.onUpdateOrder) {
          params.onUpdateOrder(order.id, { price: newPrice })
        }
      },
      createPointFigures: ({ bounding, coordinates, overlay }: any) => {
        const lineY = coordinates[0]?.y ?? 0
        const text = (overlay?.extendData?.text as string) || orderBadge
        return [
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x: 0, y: lineY },
                { x: bounding.width, y: lineY }
              ]
            },
            styles: {
              color: orderColor,
              size: 1.5,
              style: 'dashed',
              dashedValue: [5, 4]
            }
          },
          {
            type: 'text',
            ignoreEvent: false,
            attrs: {
              x: 10,
              y: lineY - 4,
              text,
              baseline: 'bottom'
            },
            styles: {
              color: '#ffffff',
              backgroundColor: 'rgba(19, 23, 34, 0.95)',
              size: 11,
              weight: 'bold',
              family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 4,
              borderColor: orderColor,
              borderSize: 1.5
            }
          }
        ]
      }
    }

    if (activeOverlayIdsRef.current.has(orderOverlayId)) {
      chart.removeOverlay({ id: orderOverlayId })
    }
    chart.createOverlay(orderConfig as any)
  }

  // Remove any previously active overlays that are no longer present
  for (const prevId of Array.from(activeOverlayIdsRef.current)) {
    if (!newActiveIds.has(prevId)) {
      chart.removeOverlay({ id: prevId })
      activeOverlayIdsRef.current.delete(prevId)
    }
  }

  for (const newId of newActiveIds) {
    activeOverlayIdsRef.current.add(newId)
  }
}

/**
 * Removes all tracked position overlays from the chart and clears the ref.
 */
export function clearPositionOverlays(
  chart: Chart | null,
  activeOverlayIdsRef: { current: Set<string> }
): void {
  if (chart && activeOverlayIdsRef.current.size > 0) {
    for (const id of activeOverlayIdsRef.current) {
      chart.removeOverlay({ id })
    }
  }
  activeOverlayIdsRef.current.clear()
}
