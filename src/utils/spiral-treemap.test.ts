import { describe, it, expect } from 'vitest'
import { computeSpiralTreemap, getHeatmapColor, type HeatmapItem } from './spiral-treemap'

describe('spiral-treemap', () => {
  it('correctly maps TradingView color palettes', () => {
    // Deep red for bloodbath <= -25%
    expect(getHeatmapColor(-30).bg).toBe('#8b1414')
    // Moderate red
    expect(getHeatmapColor(-10).bg).toBe('#c82828')
    // Neutral flat
    expect(getHeatmapColor(0).bg).toBe('#2a2e39')
    // Strong green
    expect(getHeatmapColor(12).bg).toBe('#089981')
  })

  it('computes non-empty spiral layout within container bounds', () => {
    const mockItems: HeatmapItem[] = Array.from({ length: 60 }, (_, i) => ({
      symbol: `SYM_${i}`,
      name: `Asset ${i}`,
      category: 'stocks_idx',
      value: 1000 / (i + 1), // descending weights
      change24hPercent: -15 + (i % 20)
    }))

    const width = 1000
    const height = 800
    const nodes = computeSpiralTreemap(mockItems, width, height)

    expect(nodes.length).toBe(mockItems.length)

    // All nodes must be within [0, 0, width, height]
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.width).toBeGreaterThan(0)
      expect(node.height).toBeGreaterThan(0)
      expect(node.x + node.width).toBeLessThanOrEqual(width + 2) // small rounding margin
      expect(node.y + node.height).toBeLessThanOrEqual(height + 2)
    }

    // Largest node (first item) should be on the left edge (x=0) and significantly large
    expect(nodes[0].x).toBe(0)
    expect(nodes[0].width).toBeGreaterThan(100)
    expect(nodes[0].height).toBeGreaterThan(80)

    // Tail node should be in the lower-right area with smaller dimensions
    const tailNode = nodes[nodes.length - 1]
    expect(tailNode.x).toBeGreaterThan(nodes[0].x)
    expect(tailNode.y).toBeGreaterThan(nodes[0].y)
    expect(tailNode.width * tailNode.height).toBeLessThan(nodes[0].width * nodes[0].height)
  })

  it('handles empty or zero-dimension input gracefully', () => {
    expect(computeSpiralTreemap([], 800, 600)).toEqual([])
    expect(computeSpiralTreemap([{ symbol: 'A', name: 'A', category: 'crypto', value: 10, change24hPercent: 1 }], 0, 0)).toEqual([])
  })
})
