/**
 * PIA Terminal - Chart Position Overlay Synchronizer
 * Renders live visual position, TP, and SL lines on KLineCharts with real-time PnL badges.
 */

import type { Chart } from 'klinecharts'
import type { PaperPosition, PriceQuote } from '@shared/types'
import { getSymbolPrecision } from '@shared/market-utils'
import { THEME_TOKENS } from '../../theme/tokens'

export interface PositionOverlaySyncParams {
  chart: Chart | null
  positions: PaperPosition[]
  currentSymbol: string | null
  prices: Record<string, PriceQuote>
  accountType: 'standard' | 'cent'
  onClosePosition?: (positionId: string) => void
}

/**
 * Formats PnL according to standard ($) or cent (¢) account requirements.
 * ponytail: cent format follows brief specification ('+1,250 ¢' or '-$450 ¢'); upgrade if currency symbol normalization is unified across all broker profiles.
 */
export function formatPnL(pnl: number, accountType: 'standard' | 'cent'): string {
  if (accountType === 'cent') {
    const formatted = Math.abs(Math.round(pnl)).toLocaleString('en-US')
    return pnl >= 0 ? `+${formatted} ¢` : `-${formatted} ¢`
  }
  const formatted = Math.abs(pnl).toFixed(2)
  return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`
}

/**
 * Calculates pip difference between current price and position entry price.
 * ponytail: uses standard forex/crypto pip heuristic; upgrade to full broker-pip-size metadata dictionary if exotic currency pairs or fractional pipettes require customized calculation.
 */
export function calculatePipDifference(pos: PaperPosition, currentPrice: number): number {
  const upper = (pos.symbol || '').toUpperCase()
  const isJpy = upper.includes('JPY')
  const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT'].some((c) => upper.includes(c))
  const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001
  const diff = pos.side === 'buy' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice
  return diff / pipSize
}

/**
 * Calculates unrealized position PnL.
 */
export function calculatePositionPnL(pos: PaperPosition, markPrice: number): number {
  const diff = pos.side === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice
  return diff * pos.size
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
 * Formats position entry badge: [SIDE LOTS L @ PRICE | PNL (PIPS pips)]
 */
export function formatPositionBadge(
  pos: PaperPosition,
  currentPrice: number,
  accountType: 'standard' | 'cent'
): string {
  const pnl = calculatePositionPnL(pos, currentPrice)
  const pips = calculatePipDifference(pos, currentPrice)
  const pnlStr = formatPnL(pnl, accountType)
  const pipsSign = pips >= 0 ? '+' : ''
  const pipsStr = `${pipsSign}${pips.toFixed(1)}`
  const priceStr = formatPrice(pos.entryPrice, pos.symbol)
  const lotsStr = pos.size.toFixed(2)
  const sideStr = pos.side.toUpperCase()

  return `[${sideStr} ${lotsStr} L @ ${priceStr} | ${pnlStr} (${pipsStr} pips)]`
}

/**
 * Formats TP badge: [TP PRICE | PNL]
 */
export function formatTpBadge(pos: PaperPosition, accountType: 'standard' | 'cent'): string {
  if (typeof pos.takeProfit !== 'number') return ''
  const pnl = calculatePositionPnL(pos, pos.takeProfit)
  const pnlStr = formatPnL(pnl, accountType)
  const priceStr = formatPrice(pos.takeProfit, pos.symbol)
  return `[TP ${priceStr} | ${pnlStr}]`
}

/**
 * Formats SL badge: [SL PRICE | PNL]
 */
export function formatSlBadge(pos: PaperPosition, accountType: 'standard' | 'cent'): string {
  if (typeof pos.stopLoss !== 'number') return ''
  const pnl = calculatePositionPnL(pos, pos.stopLoss)
  const pnlStr = formatPnL(pnl, accountType)
  const priceStr = formatPrice(pos.stopLoss, pos.symbol)
  return `[SL ${priceStr} | ${pnlStr}]`
}

/**
 * Synchronizes visual position lines (Entry, TP, SL) onto the KLineCharts instance.
 */
export function syncPositionOverlays(
  params: PositionOverlaySyncParams,
  activeOverlayIdsRef: { current: Set<string> }
): void {
  const { chart, positions, currentSymbol, prices, accountType, onClosePosition } = params

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

    // 1. Entry Overlay
    const entryId = `pos_entry_${pos.id}`
    newActiveIds.add(entryId)
    const entryBadge = formatPositionBadge(pos, markPrice, accountType)
    const entryColor = THEME_TOKENS.colors.accent

    const entryConfig = {
      name: 'priceLine',
      id: entryId,
      lock: true,
      points: [{ value: pos.entryPrice }],
      styles: {
        line: {
          color: entryColor,
          size: 1.5,
          style: 'solid' as const
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
      onClick: onClosePosition ? () => onClosePosition(pos.id) : undefined,
      createPointFigures: ({ bounding, coordinates, overlay }: any) => {
        const lineY = coordinates[0]?.y ?? 0
        const text = (overlay?.extendData?.text as string) || entryBadge
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
              color: entryColor,
              size: 1.5,
              style: 'solid'
            }
          },
          {
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: 8,
              y: lineY - 4,
              text,
              baseline: 'bottom'
            },
            styles: {
              color: '#ffffff',
              backgroundColor: 'rgba(30, 38, 56, 0.90)',
              size: 11,
              family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 3,
              borderColor: entryColor,
              borderSize: 1
            }
          }
        ]
      }
    }

    if (activeOverlayIdsRef.current.has(entryId)) {
      chart.removeOverlay({ id: entryId })
    }
    chart.createOverlay(entryConfig as any)

    // 2. Take Profit Overlay
    if (typeof pos.takeProfit === 'number' && pos.takeProfit > 0) {
      const tpId = `pos_tp_${pos.id}`
      newActiveIds.add(tpId)
      const tpBadge = formatTpBadge(pos, accountType)
      const tpColor = THEME_TOKENS.colors.bullish

      const tpConfig = {
        name: 'priceLine',
        id: tpId,
        lock: true,
        points: [{ value: pos.takeProfit }],
        styles: {
          line: {
            color: tpColor,
            size: 1.5,
            style: 'dashed' as const
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
                style: 'dashed'
              }
            },
            {
              type: 'text',
              ignoreEvent: true,
              attrs: {
                x: 8,
                y: lineY - 4,
                text,
                baseline: 'bottom'
              },
              styles: {
                color: '#ffffff',
                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                size: 11,
                family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 2,
                paddingBottom: 2,
                borderRadius: 3,
                borderColor: tpColor,
                borderSize: 1
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

    // 3. Stop Loss Overlay
    if (typeof pos.stopLoss === 'number' && pos.stopLoss > 0) {
      const slId = `pos_sl_${pos.id}`
      newActiveIds.add(slId)
      const slBadge = formatSlBadge(pos, accountType)
      const slColor = THEME_TOKENS.colors.bearish

      const slConfig = {
        name: 'priceLine',
        id: slId,
        lock: true,
        points: [{ value: pos.stopLoss }],
        styles: {
          line: {
            color: slColor,
            size: 1.5,
            style: 'dashed' as const
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
                style: 'dashed'
              }
            },
            {
              type: 'text',
              ignoreEvent: true,
              attrs: {
                x: 8,
                y: lineY - 4,
                text,
                baseline: 'bottom'
              },
              styles: {
                color: '#ffffff',
                backgroundColor: 'rgba(244, 63, 94, 0.25)',
                size: 11,
                family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 2,
                paddingBottom: 2,
                borderRadius: 3,
                borderColor: slColor,
                borderSize: 1
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
