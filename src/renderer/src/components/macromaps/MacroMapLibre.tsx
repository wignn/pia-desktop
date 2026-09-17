import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Map as MapLibre, GeoJSONSource, Popup, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import rawWorldGeoJson from './world-countries.json'
import type { CountryMacroData, MacroMetricType } from '@shared/types'
import { MACRO_METRICS, getChoroplethColor } from './macroDataset'
import { Globe, Map as MapIcon, RotateCcw, ZoomIn, ZoomOut, Compass } from 'lucide-react'

// Direct MapLibre GL to use the bundled worker script in both dev and production
if (maplibreWorkerUrl) {
  setWorkerUrl(maplibreWorkerUrl)
}

export interface MacroMapLibreProps {
  selectedMetric: MacroMetricType
  selectedYear: number
  macroData: CountryMacroData[]
  selectedCountryId: string | null
  onSelectCountry: (countryId: string) => void
  onHoverCountry: (country: CountryMacroData | null, x?: number, y?: number) => void
  onOpenChart?: (country: CountryMacroData) => void
}

// Pre-indexed approximate centroids for instant, reliable camera flyTo
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

export const MacroMapLibre: React.FC<MacroMapLibreProps> = ({
  selectedMetric,
  selectedYear = 2025,
  macroData,
  selectedCountryId,
  onSelectCountry,
  onHoverCountry
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isGlobe, setIsGlobe] = useState(false)

  // Fast lookup table for macro data by ISO country code
  const macroByIso = useMemo(() => {
    const map = new Map<string, CountryMacroData>()
    for (const item of macroData) {
      map.set(item.id.toUpperCase(), item)
    }
    return map
  }, [macroData])

  // Enrich world GeoJSON features with current metric values and color ramps
  const enrichedGeoJson = useMemo(() => {
    const raw = rawWorldGeoJson as unknown as GeoJSON.FeatureCollection
    const features = raw.features.map((feature) => {
      const rawIso = String(
        (feature.properties?.iso_a2 && feature.properties.iso_a2 !== '-99'
          ? feature.properties.iso_a2
          : '') ||
          feature.properties?.wb_a2 ||
          feature.properties?.postal ||
          feature.properties?.ISO_A2 ||
          ''
      ).toUpperCase()
      const macro = macroByIso.get(rawIso)

      const activeValue =
        macro?.history && typeof macro.history[selectedYear] === 'number'
          ? macro.history[selectedYear]
          : macro?.value

      const choroplethColor =
        activeValue === undefined ? '#1a202c' : getChoroplethColor(activeValue, selectedMetric)

      return {
        ...feature,
        properties: {
          ...feature.properties,
          iso_a2: rawIso,
          hasData: Boolean(macro && activeValue !== undefined),
          metricValue: activeValue !== undefined ? activeValue : null,
          choroplethColor,
          countryName: macro?.name || feature.properties?.name || rawIso,
          flag: macro?.flag || '',
          ticker: macro?.ticker || ''
        }
      }
    })

    return {
      type: 'FeatureCollection',
      features
    } as GeoJSON.FeatureCollection
  }, [macroByIso, selectedMetric, selectedYear])

  // Initialize MapLibre GL map instance
  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new MapLibre({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'world-countries': {
            type: 'geojson',
            data: enrichedGeoJson
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#0d111a'
            }
          },
          {
            id: 'countries-fill',
            type: 'fill',
            source: 'world-countries',
            paint: {
              'fill-color': ['coalesce', ['get', 'choroplethColor'], '#181d28'],
              'fill-opacity': ['case', ['boolean', ['get', 'hasData'], false], 0.88, 0.35]
            }
          },
          {
            id: 'countries-borders',
            type: 'line',
            source: 'world-countries',
            paint: {
              'line-color': '#282f42',
              'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1.2, 8, 2.0]
            }
          },
          {
            id: 'countries-hover',
            type: 'line',
            source: 'world-countries',
            paint: {
              'line-color': '#ffffff',
              'line-width': 1.8
            },
            filter: ['==', ['get', 'iso_a2'], '']
          },
          {
            id: 'countries-selected',
            type: 'line',
            source: 'world-countries',
            paint: {
              'line-color': '#2962ff',
              'line-width': 2.8
            },
            filter: ['==', ['get', 'iso_a2'], '']
          }
        ]
      },
      center: [15, 25],
      zoom: 1.45,
      minZoom: 1,
      maxZoom: 9,
      attributionControl: false
    })

    map.on('load', () => {
      setIsMapLoaded(true)
      map.resize()
      if (selectedCountryId) {
        map.setFilter('countries-selected', ['==', ['get', 'iso_a2'], selectedCountryId])
      }
    })

    // Observe container resizing to automatically adapt WebGL canvas
    let resizeObserver: ResizeObserver | null = null
    if (mapContainerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.resize()
      })
      resizeObserver.observe(mapContainerRef.current)
    }

    // Native MapLibre Popup for zero-lag 60fps tooltips
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'macro-map-native-popup'
    })

    let lastHoveredIso = ''

    // Mouse hover detection over countries (optimized with ISO deduplication)
    map.on('mousemove', 'countries-fill', (e) => {
      const feature = e.features?.[0]
      if (!feature || !feature.properties) return

      const iso = (feature.properties.iso_a2 as string)?.toUpperCase()
      if (iso) {
        map.getCanvas().style.cursor = 'pointer'

        const macro = macroByIso.get(iso) || null
        const name = (feature.properties.countryName as string) || (feature.properties.name as string) || iso
        const flag = (feature.properties.flag as string) || macro?.flag || '🌐'
        const rawVal = feature.properties.metricValue !== null && feature.properties.metricValue !== undefined
          ? Number(feature.properties.metricValue)
          : macro?.value
        const valStr = rawVal !== undefined && !isNaN(rawVal) ? `${rawVal.toFixed(1)}%` : 'Unavailable'

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 6px 10px; background: #1e222d; border: 1px solid #2a2e39; border-radius: 5px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); color: #d1d4dc; font-size: 11px; pointer-events: none; min-width: 120px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 5px; font-weight: 700; color: #ffffff;">
                  <span style="font-size: 13px;">${flag}</span>
                  <span>${name}</span>
                </div>
                ${macro?.rank ? `<span style="font-size: 9px; padding: 1px 4px; background: #131722; color: #787b86; border-radius: 2px;">#${macro.rank}</span>` : ''}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
                <span style="color: #787b86; text-transform: uppercase; font-size: 9px; font-weight: 600;">${selectedMetric.replace('_', ' ')}:</span>
                <span style="font-size: 13px; font-weight: 700; color: #2962ff;">${valStr}</span>
              </div>
            </div>`
          )
          .addTo(map)

        if (iso !== lastHoveredIso) {
          lastHoveredIso = iso
          map.setFilter('countries-hover', ['==', ['get', 'iso_a2'], iso])
          onHoverCountry(macro, e.point.x, e.point.y)
        }
      }
    })

    map.on('mouseleave', 'countries-fill', () => {
      map.getCanvas().style.cursor = ''
      if (lastHoveredIso) {
        lastHoveredIso = ''
        map.setFilter('countries-hover', ['==', ['get', 'iso_a2'], ''])
      }
      popup.remove()
      onHoverCountry(null)
    })

    // Click handler for country selection and camera flyTo
    map.on('click', 'countries-fill', (e) => {
      const feature = e.features?.[0]
      if (!feature || !feature.properties) return

      const iso = (feature.properties.iso_a2 as string)?.toUpperCase()
      if (iso) {
        onSelectCountry(iso)
        const coords = COUNTRY_COORDINATES[iso]
        if (coords) {
          map.flyTo({
            center: coords,
            zoom: Math.max(map.getZoom(), 2.8),
            duration: 800,
            essential: true
          })
        }
      }
    })

    mapRef.current = map

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      setIsMapLoaded(false)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push updated choropleth data into MapLibre GeoJSON source on metric or timeline scrub
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapLoaded) return

    const source = map.getSource('world-countries') as GeoJSONSource | undefined
    if (source) {
      source.setData(enrichedGeoJson)
    }
  }, [enrichedGeoJson, isMapLoaded])

  // Sync selected country outline filter and smooth camera flyTo
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapLoaded) return

    map.setFilter('countries-selected', ['==', ['get', 'iso_a2'], selectedCountryId || ''])

    if (selectedCountryId && COUNTRY_COORDINATES[selectedCountryId]) {
      const coords = COUNTRY_COORDINATES[selectedCountryId]
      map.flyTo({
        center: coords,
        zoom: Math.max(map.getZoom(), 2.6),
        duration: 700,
        essential: true
      })
    }
  }, [selectedCountryId, isMapLoaded])

  // Toggle Projection (3D Globe vs 2D Mercator)
  const toggleProjection = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const nextIsGlobe = !isGlobe
    setIsGlobe(nextIsGlobe)

    map.setProjection({
      type: nextIsGlobe ? 'globe' : 'mercator'
    })
  }, [isGlobe])

  // Reset Camera View
  const handleResetView = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    map.flyTo({
      center: [15, 25],
      zoom: 1.45,
      bearing: 0,
      pitch: 0,
      duration: 700,
      essential: true
    })
  }, [])

  // Zoom In / Out Handlers
  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 })
  }, [])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 })
  }, [])

  const activeMetricConfig = useMemo(
    () => MACRO_METRICS.find((m) => m.id === selectedMetric) || MACRO_METRICS[0],
    [selectedMetric]
  )

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .macro-map-native-popup .maplibregl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        .macro-map-native-popup .maplibregl-popup-tip {
          display: none !important;
        }
      `}</style>
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Map Navigation & Projection Toolbar */}
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
            justifyContent: 'center',
            transition: 'background 0.12s'
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
            justifyContent: 'center',
            transition: 'background 0.12s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <ZoomOut size={16} />
        </button>

        <div style={{ height: 1, backgroundColor: '#2a2e39' }} />

        <button
          type="button"
          onClick={handleResetView}
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
            justifyContent: 'center',
            transition: 'background 0.12s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2e39')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <RotateCcw size={15} />
        </button>

        <div style={{ height: 1, backgroundColor: '#2a2e39' }} />

        <button
          type="button"
          onClick={toggleProjection}
          title={isGlobe ? 'Switch to 2D Flat Map' : 'Switch to 3D Globe Projection'}
          style={{
            width: 32,
            height: 32,
            border: 'none',
            backgroundColor: isGlobe ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
            color: isGlobe ? '#2962ff' : '#d1d4dc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.12s'
          }}
          onMouseEnter={(e) => {
            if (!isGlobe) e.currentTarget.style.backgroundColor = '#2a2e39'
          }}
          onMouseLeave={(e) => {
            if (!isGlobe) e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {isGlobe ? <MapIcon size={16} /> : <Globe size={16} />}
        </button>
      </div>

      {/* Projection Mode Badge */}
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
        <Compass size={13} color="#2962ff" />
        <span>MapLibre GL</span>
        <span style={{ color: '#787b86' }}>•</span>
        <span style={{ color: isGlobe ? '#2962ff' : '#00b0ff' }}>
          {isGlobe ? '3D Globe' : '2D Mercator'}
        </span>
      </div>

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
export default MacroMapLibre
