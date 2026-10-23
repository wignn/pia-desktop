/**
 * PIA Terminal - Spiral Treemap Layout Engine
 * Generates an inward spiral treemap layout replicating TradingView's market heatmap.
 * ponytail: Pure geometric partition algorithm; upgrade to WebGL canvas for >10,000 micro-nodes.
 */

export interface HeatmapItem {
  symbol: string
  name: string
  category: 'crypto' | 'forex' | 'metals' | 'stocks_idx' | 'stocks_us' | 'stocks_asia' | 'indices' | 'commodities' | string
  value: number // Weight/Market Cap/Volume
  change24hPercent: number // e.g. -20.33, +4.5
  price?: number
  volume24h?: number
  marketCap?: number
  currency?: string
}

export interface TreemapNode extends HeatmapItem {
  x: number
  y: number
  width: number
  height: number
  depth: number
}

export interface TreemapRect {
  x: number
  y: number
  width: number
  height: number
}

export const HIGHCHARTS_HEATMAP_COLOR_STOPS: Array<[number, string]> = [
  [-4, '#990000'],
  [-3, '#b30000'],
  [-2, '#ff0000'],
  [-1, '#ff1a1a'],
  [0, '#2a2e39'],
  [1, '#47d147'],
  [2, '#33cc33'],
  [3, '#29a329'],
  [4, '#29a329']
]

/**
 * Returns color mapping inspired by Marketcalls Highcharts Heatmap
 * [-4% to +4%] scale with vibrant crimson-to-emerald gradient stops.
 */
export function getHighchartsHeatmapColor(changePercent: number): {
  bg: string
  text: string
  border: string
} {
  if (changePercent <= -3.5) return { bg: '#990000', text: '#ffffff', border: '#121212' }
  if (changePercent <= -2.5) return { bg: '#b30000', text: '#ffffff', border: '#121212' }
  if (changePercent <= -1.5) return { bg: '#ff0000', text: '#ffffff', border: '#121212' }
  if (changePercent <= -0.5) return { bg: '#ff1a1a', text: '#ffffff', border: '#121212' }
  if (changePercent < 0.5) return { bg: '#2a2e39', text: '#d1d4dc', border: '#121212' }
  if (changePercent < 1.5) return { bg: '#47d147', text: '#ffffff', border: '#121212' }
  if (changePercent < 2.5) return { bg: '#33cc33', text: '#ffffff', border: '#121212' }
  return { bg: '#29a329', text: '#ffffff', border: '#121212' }
}

/**
 * Returns TradingView-authentic color based on 24h percentage change.
 * Deep crimson/burgundy for bloodbath days, emerald/mint for bullish, dark slate for neutral.
 */
export function getHeatmapColor(changePercent: number): {
  bg: string
  text: string
  border: string
} {
  if (changePercent <= -25) {
    return { bg: '#8b1414', text: '#ffffff', border: '#131722' }
  }
  if (changePercent <= -15) {
    return { bg: '#ab1e1e', text: '#ffffff', border: '#131722' }
  }
  if (changePercent <= -8) {
    return { bg: '#c82828', text: '#ffffff', border: '#131722' }
  }
  if (changePercent <= -3) {
    return { bg: '#e03e3e', text: '#ffffff', border: '#131722' }
  }
  if (changePercent < -0.05) {
    return { bg: '#ea5555', text: '#ffffff', border: '#131722' }
  }
  if (changePercent <= 0.05) {
    return { bg: '#2a2e39', text: '#d1d4dc', border: '#131722' }
  }
  if (changePercent < 3) {
    return { bg: '#26a69a', text: '#ffffff', border: '#131722' }
  }
  if (changePercent < 8) {
    return { bg: '#10b981', text: '#ffffff', border: '#131722' }
  }
  if (changePercent < 15) {
    return { bg: '#089981', text: '#ffffff', border: '#131722' }
  }
  return { bg: '#057b68', text: '#ffffff', border: '#131722' }
}

/**
 * Computes a Recursive Inward Spiral Treemap layout matching TradingView's iconic heatmap.
 * Alternates between left vertical strips and top horizontal strips, spiraling down-right.
 */
export function computeSpiralTreemap(
  items: HeatmapItem[],
  containerWidth: number,
  containerHeight: number
): TreemapNode[] {
  if (!items || items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return []
  }

  // Sort descending by value / weight
  const sorted = [...items].sort((a, b) => (b.value || 0) - (a.value || 0))
  const nodes: TreemapNode[] = []

  let remainingRect: TreemapRect = {
    x: 0,
    y: 0,
    width: containerWidth,
    height: containerHeight
  }

  let currentIndex = 0
  let side: 'left' | 'top' = 'left'
  let round = 0

  while (currentIndex < sorted.length) {
    const remainingCount = sorted.length - currentIndex

    // Terminal condition: if few items left or small remaining bounds, tile remaining area as a grid
    if (remainingCount <= 12 || remainingRect.width < 70 || remainingRect.height < 70) {
      const tailNodes = tileGrid(
        sorted.slice(currentIndex),
        remainingRect,
        round
      )
      nodes.push(...tailNodes)
      break
    }

    // Determine count of items in this strip (grows moderately with each round)
    const baseCount = side === 'left' ? 4 : 6
    const countInStrip = Math.min(
      remainingCount - 4,
      Math.max(2, Math.round(baseCount * Math.pow(1.18, round)))
    )

    const stripItems = sorted.slice(currentIndex, currentIndex + countInStrip)
    currentIndex += countInStrip

    // Calculate strip thickness based on weight share
    const totalRemWeight = sorted
      .slice(currentIndex - countInStrip)
      .reduce((acc, curr) => acc + (curr.value || 1), 0)
    const stripWeight = stripItems.reduce((acc, curr) => acc + (curr.value || 1), 0)
    const weightFraction = totalRemWeight > 0 ? stripWeight / totalRemWeight : 0.2

    if (side === 'left') {
      const sliceWidth = Math.max(
        40,
        Math.min(remainingRect.width * 0.35, remainingRect.width * Math.max(0.16, weightFraction * 1.15))
      )

      let currentY = remainingRect.y
      for (let i = 0; i < stripItems.length; i++) {
        const item = stripItems[i]
        const isLast = i === stripItems.length - 1
        const itemFraction = stripWeight > 0 ? (item.value || 1) / stripWeight : 1 / stripItems.length
        const itemHeight = isLast
          ? remainingRect.y + remainingRect.height - currentY
          : Math.max(20, Math.round(remainingRect.height * itemFraction))

        nodes.push({
          ...item,
          x: Math.round(remainingRect.x),
          y: Math.round(currentY),
          width: Math.round(sliceWidth),
          height: Math.max(4, Math.round(itemHeight)),
          depth: round
        })
        currentY += itemHeight
      }

      remainingRect = {
        x: remainingRect.x + sliceWidth,
        y: remainingRect.y,
        width: remainingRect.width - sliceWidth,
        height: remainingRect.height
      }
      side = 'top'
    } else {
      const sliceHeight = Math.max(
        35,
        Math.min(remainingRect.height * 0.35, remainingRect.height * Math.max(0.15, weightFraction * 1.15))
      )

      let currentX = remainingRect.x
      for (let i = 0; i < stripItems.length; i++) {
        const item = stripItems[i]
        const isLast = i === stripItems.length - 1
        const itemFraction = stripWeight > 0 ? (item.value || 1) / stripWeight : 1 / stripItems.length
        const itemWidth = isLast
          ? remainingRect.x + remainingRect.width - currentX
          : Math.max(20, Math.round(remainingRect.width * itemFraction))

        nodes.push({
          ...item,
          x: Math.round(currentX),
          y: Math.round(remainingRect.y),
          width: Math.max(4, Math.round(itemWidth)),
          height: Math.round(sliceHeight),
          depth: round
        })
        currentX += itemWidth
      }

      remainingRect = {
        x: remainingRect.x,
        y: remainingRect.y + sliceHeight,
        width: remainingRect.width,
        height: remainingRect.height - sliceHeight
      }
      side = 'left'
    }

    round++
  }

  return nodes
}

/**
 * Fills the remaining tail area (dense spiral micro-grid) into equalized rows and columns.
 */
function tileGrid(items: HeatmapItem[], rect: TreemapRect, depth: number): TreemapNode[] {
  if (items.length === 0 || rect.width <= 0 || rect.height <= 0) return []

  const total = items.length
  const aspect = rect.width / Math.max(1, rect.height)
  const cols = Math.max(1, Math.min(total, Math.round(Math.sqrt(total * aspect))))
  const rows = Math.ceil(total / cols)

  const cellWidth = rect.width / cols
  const cellHeight = rect.height / rows

  const result: TreemapNode[] = []

  for (let idx = 0; idx < total; idx++) {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const isLastCol = col === cols - 1
    const isLastRow = row === rows - 1

    const x = rect.x + col * cellWidth
    const y = rect.y + row * cellHeight
    const w = isLastCol ? rect.x + rect.width - x : cellWidth
    const h = isLastRow ? rect.y + rect.height - y : cellHeight

    result.push({
      ...items[idx],
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(2, Math.round(w)),
      height: Math.max(2, Math.round(h)),
      depth
    })
  }

  return result
}

/**
 * Computes a standard Squarified Treemap layout (Bruls, Huizing, van Wijk algorithm).
 * Replicates Highcharts treemap squarified layout where aspect ratios are kept as close to 1 as possible.
 */
export function computeSquarifiedTreemap(
  items: HeatmapItem[],
  containerWidth: number,
  containerHeight: number
): TreemapNode[] {
  if (!items || items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return []
  }

  const validItems = items.filter((it) => (it.value || 0) > 0)
  if (validItems.length === 0) return []

  const sorted = [...validItems].sort((a, b) => (b.value || 0) - (a.value || 0))
  const totalValue = sorted.reduce((sum, it) => sum + (it.value || 1), 0)
  const totalArea = containerWidth * containerHeight

  // Map each item to its scaled area
  const scaledItems = sorted.map((it) => ({
    item: it,
    area: ((it.value || 1) / totalValue) * totalArea
  }))

  const nodes: TreemapNode[] = []
  let remainingRect: TreemapRect = {
    x: 0,
    y: 0,
    width: containerWidth,
    height: containerHeight
  }

  const worstRatio = (row: typeof scaledItems, length: number): number => {
    if (row.length === 0 || length <= 0) return Infinity
    const s = row.reduce((sum, r) => sum + r.area, 0)
    if (s <= 0) return Infinity
    let worst = 0
    const lSq = length * length
    const sSq = s * s
    for (const r of row) {
      const area = Math.max(0.0001, r.area)
      const ratio = Math.max((lSq * area) / sSq, sSq / (lSq * area))
      if (ratio > worst) worst = ratio
    }
    return worst
  }

  const layoutRow = (row: typeof scaledItems, rect: TreemapRect): TreemapRect => {
    if (row.length === 0) return rect
    const isHorizontal = rect.width <= rect.height
    const s = row.reduce((sum, r) => sum + r.area, 0)
    const length = isHorizontal ? rect.width : rect.height
    const thickness = length > 0 ? s / length : 0

    if (isHorizontal) {
      let curX = rect.x
      for (let i = 0; i < row.length; i++) {
        const isLast = i === row.length - 1
        const w = isLast ? rect.x + rect.width - curX : row[i].area / thickness
        nodes.push({
          ...row[i].item,
          x: Math.round(curX),
          y: Math.round(rect.y),
          width: Math.max(1, Math.round(w)),
          height: Math.max(1, Math.round(thickness)),
          depth: 0
        })
        curX += w
      }
      return {
        x: rect.x,
        y: rect.y + thickness,
        width: rect.width,
        height: Math.max(0, rect.height - thickness)
      }
    } else {
      let curY = rect.y
      for (let i = 0; i < row.length; i++) {
        const isLast = i === row.length - 1
        const h = isLast ? rect.y + rect.height - curY : row[i].area / thickness
        nodes.push({
          ...row[i].item,
          x: Math.round(rect.x),
          y: Math.round(curY),
          width: Math.max(1, Math.round(thickness)),
          height: Math.max(1, Math.round(h)),
          depth: 0
        })
        curY += h
      }
      return {
        x: rect.x + thickness,
        y: rect.y,
        width: Math.max(0, rect.width - thickness),
        height: rect.height
      }
    }
  }

  let currentRow: typeof scaledItems = []

  for (const item of scaledItems) {
    const side = Math.min(remainingRect.width, remainingRect.height)
    if (currentRow.length === 0) {
      currentRow.push(item)
    } else {
      const currentWorst = worstRatio(currentRow, side)
      const nextWorst = worstRatio([...currentRow, item], side)
      if (nextWorst <= currentWorst) {
        currentRow.push(item)
      } else {
        remainingRect = layoutRow(currentRow, remainingRect)
        currentRow = [item]
      }
    }
  }

  if (currentRow.length > 0) {
    layoutRow(currentRow, remainingRect)
  }

  return nodes
}
