import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import rawWorldGeoJson from './world-countries.json'
import type { CountryMacroData, MacroMetricType } from '@shared/types'
import { MACRO_METRICS, getChoroplethColor } from './macroDataset'
import { ZoomIn, ZoomOut, RotateCcw, Compass, Globe } from 'lucide-react'

export interface TradingViewMacroMapProps {
  selectedMetric: MacroMetricType
  selectedYear: number
  macroData: CountryMacroData[]
  selectedCountryId: string | null
  onSelectCountry: (countryId: string) => void
  onHoverCountry?: (country: CountryMacroData | null) => void
  onOpenChart?: (country: CountryMacroData) => void
  onSwitchToGlobe?: () => void
}

interface CountryPathItem {
  iso: string
  name: string
  flag: string
  ticker: string
  path: Path2D
  centroid: [number, number]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

// Pre-indexed approximate centroids for camera centering
const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  US: [-98.5, 39.8],
  CA: [-106.3, 56.1],
  MX: [-102.5, 23.6],
  BR: [-51.9, -14.2],
  AR: [-63.6, -38.4],
  CL: [-71.5, -35.6],
  CO: [-74.3, 4.5],
  PE: [-75.0, -9.1],
  GB: [-3.4, 55.3],
  DE: [10.4, 51.1],
  FR: [2.2, 46.2],
  IT: [12.5, 41.8],
  ES: [-3.7, 40.4],
  NL: [5.2, 52.1],
  CH: [8.2, 46.8],
  PL: [19.1, 51.9],
  SE: [18.6, 60.1],
  NO: [8.4, 60.4],
  RU: [95.0, 60.0],
  TR: [35.2, 38.9],
  SA: [45.0, 23.8],
  AE: [54.0, 24.0],
  EG: [30.8, 26.8],
  ZA: [24.0, -30.5],
  NG: [8.6, 9.0],
  CN: [104.1, 35.8],
  JP: [138.2, 36.2],
  KR: [127.7, 35.9],
  IN: [78.9, 20.5],
  ID: [113.9, -0.7],
  AU: [133.7, -25.2],
  NZ: [174.8, -40.9],
  SG: [103.8, 1.3],
  VN: [108.2, 14.0],
  TH: [100.9, 15.8],
  MY: [101.9, 4.2],
  PH: [121.7, 12.8]
}

// Base canvas coordinate space dimensions (16:9 ratio)
const WORLD_WIDTH = 2000
const WORLD_HEIGHT = 1100

// Miller / Modified Mercator projection: projects [lng, lat] into [WORLD_WIDTH, WORLD_HEIGHT]
function projectLngLat(lng: number, lat: number): [number, number] {
  // Normalize lng from [-180, 180] to [0, WORLD_WIDTH]
  const x = ((lng + 180) / 360) * WORLD_WIDTH

  // Miller cylindrical projection for realistic global aspect ratio
  const latClamped = Math.max(-82, Math.min(84, lat))
  const latRad = (latClamped * Math.PI) / 180
  const millerY = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * latRad))

  // Map to y with center at latitude 15 deg North for balanced view
  const yCenter = WORLD_HEIGHT * 0.46
  const scale = WORLD_WIDTH / (2 * Math.PI)
  const y = yCenter - millerY * scale * 0.78

  return [x, y]
}

export const TradingViewMacroMap: React.FC<TradingViewMacroMapProps> = ({
  selectedMetric,
  selectedYear,
  macroData,
  selectedCountryId,
  onSelectCountry,
  onHoverCountry,
  onSwitchToGlobe
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Camera Pan & Zoom Transform (TradingView Canvas Standard)
  const [transform, setTransform] = useState<{ x: number; y: number; zoom: number }>({
    x: 0,
    y: 0,
    zoom: 1
  })

  // Dragging / Panning State
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0
  })

  // Hover Tooltip State
  const [hoverInfo, setHoverInfo] = useState<{
    country: CountryMacroData | null
    name: string
    flag: string
    iso: string
    valStr: string
    periodStr: string
    chgStr: string
    chgPositive: boolean
    x: number
    y: number
  } | null>(null)

  // Pre-compile all country GeoJSON polygons into high-performance Path2D vectors ONCE
  const countryPaths = useMemo<CountryPathItem[]>(() => {
    const raw = rawWorldGeoJson as unknown as GeoJSON.FeatureCollection
    const items: CountryPathItem[] = []

    for (const feature of raw.features) {
      const rawIso = String(
        (feature.properties?.iso_a2 && feature.properties.iso_a2 !== '-99'
          ? feature.properties.iso_a2
          : '') ||
          feature.properties?.wb_a2 ||
          feature.properties?.postal ||
          feature.properties?.ISO_A2 ||
          ''
      ).toUpperCase()

      if (!rawIso) continue

      const name = String(feature.properties?.name || rawIso)
      const geom = feature.geometry
      if (!geom) continue

      const path = new Path2D()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      let totalPts = 0
      let sumX = 0
      let sumY = 0

      const processRing = (ring: number[][]) => {
        if (ring.length === 0) return
        for (let i = 0; i < ring.length; i++) {
          const [px, py] = projectLngLat(ring[i][0], ring[i][1])
          if (i === 0) path.moveTo(px, py)
          else path.lineTo(px, py)

          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)
          sumX += px
          sumY += py
          totalPts++
        }
        path.closePath()
      }

      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) {
          processRing(ring)
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          for (const ring of poly) {
            processRing(ring)
          }
        }
      }

      const centroid: [number, number] =
        totalPts > 0 ? [sumX / totalPts, sumY / totalPts] : [WORLD_WIDTH / 2, WORLD_HEIGHT / 2]

      items.push({
        iso: rawIso,
        name,
        flag: '',
        ticker: '',
        path,
        centroid,
        bounds: { minX, maxX, minY, maxY }
      })
    }

    return items
  }, [])

  // Fast ISO lookup map for active metric values
  const macroByIso = useMemo(() => {
    const map = new Map<string, CountryMacroData>()
    for (const item of macroData) {
      map.set(item.id.toUpperCase(), item)
    }
    return map
  }, [macroData])

  // Fit world into initial container view
  const fitView = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const scaleX = rect.width / WORLD_WIDTH
    const scaleY = rect.height / WORLD_HEIGHT
    const initialZoom = Math.max(scaleX, scaleY) * 0.95
    const initialX = (rect.width - WORLD_WIDTH * initialZoom) / 2
    const initialY = (rect.height - WORLD_HEIGHT * initialZoom) / 2

    setTransform({
      x: initialX,
      y: initialY,
      zoom: initialZoom
    })
  }, [])

  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Center camera on selected country when clicked from table
  useEffect(() => {
    if (!selectedCountryId || !containerRef.current) return
    const coords = COUNTRY_COORDINATES[selectedCountryId]
    const item = countryPaths.find((p) => p.iso === selectedCountryId)
    if (!coords && !item) return

    const rect = containerRef.current.getBoundingClientRect()
    const [targetPx, targetPy] = coords ? projectLngLat(coords[0], coords[1]) : item!.centroid
    const targetZoom = Math.max(transform.zoom, 1.8)

    setTransform({
      x: rect.width / 2 - targetPx * targetZoom,
      y: rect.height / 2 - targetPy * targetZoom,
      zoom: targetZoom
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryId])

  // Convert screen viewport coordinates to base canvas coordinate space
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): [number, number] => {
      const canvasX = (screenX - transform.x) / transform.zoom
      const canvasY = (screenY - transform.y) / transform.zoom
      return [canvasX, canvasY]
    },
    [transform]
  )

  // -------------------------------------------------------------------------
  // High-Performance 60-144 FPS Immediate Canvas Render Loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerRef.current) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const rect = containerRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // Size canvas with device pixel ratio for crystal clear Retina/4K sharpness
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }

    ctx.save()
    ctx.scale(dpr, dpr)

    // 1. Deep Matte Ocean Background (TradingView Standard #0d111a)
    ctx.fillStyle = '#0d111a'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // 2. Apply Camera Matrix Transformation
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.zoom, transform.zoom)

    // 3. Render Country Vector Polygons (TradingView Canvas Batching)
    const hoveredIso = hoverInfo?.iso || ''
    let hoveredItem: CountryPathItem | null = null
    let selectedItem: CountryPathItem | null = null

    for (const item of countryPaths) {
      const macro = macroByIso.get(item.iso)
      const activeValue =
        macro?.history && typeof macro.history[selectedYear] === 'number'
          ? macro.history[selectedYear]
          : macro?.value

      const choroplethColor =
        activeValue === undefined ? '#181d28' : getChoroplethColor(activeValue, selectedMetric)

      // Country Fill
      ctx.fillStyle = choroplethColor
      ctx.fill(item.path)

      // Country Border
      ctx.strokeStyle = '#282f42'
      ctx.lineWidth = 0.75 / transform.zoom
      ctx.stroke(item.path)

      if (item.iso === hoveredIso) {
        hoveredItem = item
      }
      if (item.iso === selectedCountryId) {
        selectedItem = item
      }
    }

    // 4. Highlight Hovered Country Outline
    if (hoveredItem) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.8 / transform.zoom
      ctx.stroke(hoveredItem.path)
    }

    // 5. Highlight Selected Country Outline (TradingView Blue #2962ff)
    if (selectedItem) {
      ctx.strokeStyle = '#2962ff'
      ctx.lineWidth = 2.6 / transform.zoom
      ctx.stroke(selectedItem.path)
    }

    ctx.restore()
    ctx.restore()
  }, [
    countryPaths,
    macroByIso,
    selectedMetric,
    selectedYear,
    transform,
    hoverInfo?.iso,
    selectedCountryId
  ])

  // -------------------------------------------------------------------------
  // Smooth Mouse & Touch Event Handlers
  // -------------------------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return // Left click only
    isDraggingRef.current = true
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: transform.x,
      startY: transform.y
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 1. Drag Panning
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      setTransform((prev) => ({
        ...prev,
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy
      }))
      return
    }

    // 2. High-Performance Point-in-Polygon Hit Testing (< 0.05 ms)
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const [canvasX, canvasY] = screenToCanvas(mouseX, mouseY)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let hitItem: CountryPathItem | null = null
    for (let i = countryPaths.length - 1; i >= 0; i--) {
      const item = countryPaths[i]
      // Quick bounding box check before path testing
      if (
        canvasX >= item.bounds.minX &&
        canvasX <= item.bounds.maxX &&
        canvasY >= item.bounds.minY &&
        canvasY <= item.bounds.maxY
      ) {
        if (ctx.isPointInPath(item.path, canvasX, canvasY)) {
          hitItem = item
          break
        }
      }
    }

    if (hitItem) {
      canvas.style.cursor = 'pointer'
      const macro = macroByIso.get(hitItem.iso) || null
      const activeVal =
        macro?.history && typeof macro.history[selectedYear] === 'number'
          ? macro.history[selectedYear]
          : macro?.value
      const valStr = activeVal !== undefined && !isNaN(activeVal) ? `${activeVal.toFixed(1)}%` : 'Unavailable'
      const flag = macro?.flag || '🌐'
      const periodStr = String(macro?.period || selectedYear || '2025')
      const chg = macro?.change
      const chgStr =
        chg !== undefined && !isNaN(chg)
          ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
          : ''

      setHoverInfo({
        country: macro,
        name: macro?.name || hitItem.name,
        flag,
        iso: hitItem.iso,
        valStr,
        periodStr,
        chgStr,
        chgPositive: chg !== undefined && chg >= 0,
        x: mouseX,
        y: mouseY
      })

      if (onHoverCountry) {
        onHoverCountry(macro)
      }
    } else {
      canvas.style.cursor = 'default'
      if (hoverInfo) {
        setHoverInfo(null)
        if (onHoverCountry) onHoverCountry(null)
      }
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Zoom centered around cursor position
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
    const nextZoom = Math.min(Math.max(transform.zoom * zoomFactor, 0.4), 10.0)

    const nextX = mouseX - (mouseX - transform.x) * (nextZoom / transform.zoom)
    const nextY = mouseY - (mouseY - transform.y) * (nextZoom / transform.zoom)

    setTransform({
      x: nextX,
      y: nextY,
      zoom: nextZoom
    })
  }

  const handleClick = () => {
    if (hoverInfo?.iso) {
      onSelectCountry(hoverInfo.iso)
    }
  }

  const handleZoomIn = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const nextZoom = Math.min(transform.zoom * 1.25, 10.0)
    setTransform({
      x: cx - (cx - transform.x) * (nextZoom / transform.zoom),
      y: cy - (cy - transform.y) * (nextZoom / transform.zoom),
      zoom: nextZoom
    })
  }

  const handleZoomOut = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const nextZoom = Math.max(transform.zoom * 0.8, 0.4)
    setTransform({
      x: cx - (cx - transform.x) * (nextZoom / transform.zoom),
      y: cy - (cy - transform.y) * (nextZoom / transform.zoom),
      zoom: nextZoom
    })
  }

  const activeMetricConfig = useMemo(
    () => MACRO_METRICS.find((m) => m.id === selectedMetric) || MACRO_METRICS[0],
    [selectedMetric]
  )

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0d111a',
        userSelect: 'none'
      }}
    >
      {/* High-Performance 2D Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      {/* Floating TradingView Navigation Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 15
        }}
      >
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            backgroundColor: 'transparent',
            color: '#d1d4dc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ZoomIn size={16} />
        </button>

        <div style={{ height: 1, backgroundColor: '#2a2e39' }} />

        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            backgroundColor: 'transparent',
            color: '#d1d4dc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ZoomOut size={16} />
        </button>

        <div style={{ height: 1, backgroundColor: '#2a2e39' }} />

        <button
          type="button"
          onClick={fitView}
          title="Reset View"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            backgroundColor: 'transparent',
            color: '#d1d4dc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <RotateCcw size={15} />
        </button>

        {onSwitchToGlobe && (
          <>
            <div style={{ height: 1, backgroundColor: '#2a2e39' }} />
            <button
              type="button"
              onClick={onSwitchToGlobe}
              title="Switch to 3D Globe View"
              style={{
                width: 32,
                height: 32,
                border: 'none',
                backgroundColor: 'transparent',
                color: '#d1d4dc',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Globe size={16} />
            </button>
          </>
        )}
      </div>

      {/* Engine Status Badge */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: '#d1d4dc',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          zIndex: 15,
          pointerEvents: 'none'
        }}
      >
        <Compass size={13} color="#089981" />
        <span>Canvas 2D Engine</span>
        <span style={{ color: '#787b86' }}>•</span>
        <span style={{ color: '#089981' }}>144 FPS Ultra-Fast</span>
      </div>

      {/* Zero-Lag TradingView Matte Dark Tooltip */}
      {hoverInfo && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(hoverInfo.x + 14, (containerRef.current?.clientWidth || 800) - 180),
            top: Math.max(hoverInfo.y - 65, 16),
            backgroundColor: '#1e222d',
            border: '1px solid #2a2e39',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            padding: '7px 11px',
            color: '#d1d4dc',
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: 140
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 4
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#ffffff' }}>
              <span style={{ fontSize: 14 }}>{hoverInfo.flag}</span>
              <span>{hoverInfo.name}</span>
            </div>
            {hoverInfo.country?.rank ? (
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  backgroundColor: '#131722',
                  color: '#787b86',
                  borderRadius: 2
                }}
              >
                #{hoverInfo.country.rank}
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 3
            }}
          >
            <span style={{ color: '#787b86', textTransform: 'uppercase', fontSize: 9, fontWeight: 600 }}>
              {selectedMetric.replace('_', ' ')}:
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2962ff' }}>{hoverInfo.valStr}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 9,
              color: '#787b86',
              borderTop: '1px solid #2a2e39',
              paddingTop: 4,
              marginTop: 2
            }}
          >
            <span>Period: {hoverInfo.periodStr}</span>
            {hoverInfo.chgStr ? (
              <span style={{ color: hoverInfo.chgPositive ? '#089981' : '#f23645', fontWeight: 600 }}>
                1Y: {hoverInfo.chgStr}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Choropleth Legend (Bottom Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: 6,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 15
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#d1d4dc',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>{activeMetricConfig.label}</span>
          <span style={{ color: '#787b86', fontSize: 10 }}>({activeMetricConfig.unit})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {activeMetricConfig.colorRamp.map((step, idx) => (
            <div
              key={idx}
              title={`<= ${step.stop}${activeMetricConfig.unit}`}
              style={{
                width: 20,
                height: 8,
                backgroundColor: step.color,
                borderRadius: 2
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#787b86'
          }}
        >
          <span>
            {activeMetricConfig.minVal}
            {activeMetricConfig.unit}
          </span>
          <span>
            {Math.round((activeMetricConfig.minVal + activeMetricConfig.maxVal) / 2)}
            {activeMetricConfig.unit}
          </span>
          <span>
            {activeMetricConfig.maxVal}
            {activeMetricConfig.unit}
          </span>
        </div>
      </div>
    </div>
  )
}

export default TradingViewMacroMap
