"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import L from "leaflet"
import "@geoman-io/leaflet-geoman-free"
import {
  sqMetersToHectares,
  areCoordinatesEqual,
  exportToGeoJSON,
  downloadGeoJSON,
  getBoundingBox,
  ESRI_BASEMAPS,
  type BasemapType,
} from "@/utils/mapUtils"

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
})

type LatLng = { lat: number; lng: number }

type DrawMode = "workArea" | "record" | "edit" | null

type DrawnFeature = {
  id: string
  type: "polygon" | "polyline" | "marker" | "rectangle"
  area?: number
  coordinates: LatLng[]
  layer: L.Layer
  layerType: "workArea" | "record"
}

type MapWithDrawingProps = {
  mode: "draw" | "georef"
  polygon?: LatLng[]
  onPolygonChange?: (polygon: LatLng[], areaSqMeters: number | null) => void
  georefMode: "none" | "point" | "line" | "polygon"
  georefColor?: string
  onGeorefComplete?: (
    result: { type: "Point"; point: LatLng } | { type: "LineString" | "Polygon"; path: LatLng[] },
  ) => void
  pickPointActive?: boolean
  pickZoom?: number
  bubbles?: {
    id: string
    position: LatLng
    title: string
    description: string
    recordLabel: string
    size: number
  }[]
  shapes?: {
    id: string
    type: "line" | "polygon"
    path: LatLng[]
    color?: string
    fillColor?: string
    fillOpacity?: number
  }[]
  records?: {
    type: "FeatureCollection"
    features: Array<{
      type: "Feature"
      geometry: {
        type: "Polygon" | "LineString" | "Point"
        coordinates: any
      }
      properties: Record<string, any>
    }>
  }
  enableDrop?: boolean
  onDropFilesAt?: (latlng: LatLng, files: File[]) => void
  focusPoint?: LatLng | null
  focusZoom?: number
  defaultCenter?: LatLng
  defaultZoom?: number
  defaultBasemap?: BasemapType
}

export function MapWithDrawing({
  mode = "draw",
  polygon,
  onPolygonChange,
  georefMode = "none",
  georefColor = "#3b82f6",
  onGeorefComplete,
  pickPointActive = false,
  pickZoom = 16,
  bubbles = [],
  shapes = [],
  records,
  enableDrop = false,
  onDropFilesAt,
  focusPoint,
  focusZoom = 16,
  defaultCenter = { lat: 43.7, lng: -79.4 },
  defaultZoom = 12,
  defaultBasemap = "streets",
}: MapWithDrawingProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const workAreaLayerRef = useRef<L.LayerGroup | null>(null)
  const georefLayerRef = useRef<L.LayerGroup | null>(null)
  const bubblesLayerRef = useRef<L.LayerGroup | null>(null)
  const shapesLayerRef = useRef<L.LayerGroup | null>(null)
  const recordLayerRef = useRef<L.LayerGroup | null>(null)
  const polygonLayerRef = useRef<L.Polygon | null>(null)
  const basemapLayersRef = useRef<Record<string, L.TileLayer>>({})
  const currentBasemapRef = useRef<BasemapType>(defaultBasemap)
  const [isInitialized, setIsInitialized] = useState(false)
  const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([])
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>(null)

  const calculateArea = (latlngs: L.LatLng[]): number => {
    if (latlngs.length < 3) return 0

    const EARTH_RADIUS = 6378137 // Earth's radius in meters

    // Convert to radians
    const toRad = (deg: number) => (deg * Math.PI) / 180

    let area = 0
    const points = latlngs.map((ll) => ({
      lat: toRad(ll.lat),
      lng: toRad(ll.lng),
    }))

    // Calculate area using spherical excess
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % points.length]
      area += (p2.lng - p1.lng) * (2 + Math.sin(p1.lat) + Math.sin(p2.lat))
    }

    area = Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2)
    return area
  }

  const isDuplicateFeature = useCallback((newCoordinates: LatLng[], existingFeatures: DrawnFeature[]): boolean => {
    return existingFeatures.some((feature) => areCoordinatesEqual(feature.coordinates, newCoordinates))
  }, [])

  const clearAllDrawnFeatures = useCallback(() => {
    const workAreaLayer = workAreaLayerRef.current
    if (!workAreaLayer) return

    workAreaLayer.clearLayers()
    setDrawnFeatures([])
    setSelectedFeatureId(null)
    onPolygonChange?.([], null)
  }, [onPolygonChange])

  const recenterMap = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return

    map.setView([defaultCenter.lat, defaultCenter.lng], defaultZoom)
  }, [defaultCenter, defaultZoom])

  const switchBasemap = useCallback((basemapType: BasemapType) => {
    const map = mapInstanceRef.current
    if (!map) return

    // Remove current basemap
    const currentBasemap = basemapLayersRef.current[currentBasemapRef.current]
    if (currentBasemap) {
      map.removeLayer(currentBasemap)
    }

    // Add new basemap
    const newBasemap = basemapLayersRef.current[basemapType]
    if (newBasemap) {
      newBasemap.addTo(map)
      currentBasemapRef.current = basemapType
    }
  }, [])

  const activateDrawMode = useCallback((mode: DrawMode) => {
    const map = mapInstanceRef.current
    if (!map) return

    if (mode === "edit") {
      map.pm.enableGlobalEditMode()
      setDrawMode(mode)
    } else if (mode === "workArea" || mode === "record") {
      // Disable edit mode if it was active
      map.pm.disableGlobalEditMode()
      setDrawMode(mode)
    } else {
      // Deactivate all modes
      map.pm.disableDraw()
      map.pm.disableGlobalEditMode()
      setDrawMode(null)
    }
  }, [])

  const clearLayerFeatures = useCallback(
    (layerType: "workArea" | "record") => {
      const layer = layerType === "workArea" ? workAreaLayerRef.current : recordLayerRef.current
      if (!layer) return

      layer.clearLayers()
      setDrawnFeatures((prev) => prev.filter((f) => f.layerType !== layerType))
      setSelectedFeatureId(null)

      if (layerType === "workArea") {
        onPolygonChange?.([], null)
      }
    },
    [onPolygonChange],
  )

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [defaultCenter.lat, defaultCenter.lng],
      zoom: defaultZoom,
      zoomControl: true,
    })
    mapInstanceRef.current = map

    const streetsLayer = L.tileLayer(ESRI_BASEMAPS.streets.url, {
      attribution: ESRI_BASEMAPS.streets.attribution,
      maxZoom: ESRI_BASEMAPS.streets.maxZoom,
    })

    const lightGrayLayer = L.tileLayer(ESRI_BASEMAPS.lightGray.url, {
      attribution: ESRI_BASEMAPS.lightGray.attribution,
      maxZoom: ESRI_BASEMAPS.lightGray.maxZoom,
    })

    const darkGrayLayer = L.tileLayer(ESRI_BASEMAPS.darkGray.url, {
      attribution: ESRI_BASEMAPS.darkGray.attribution,
      maxZoom: ESRI_BASEMAPS.darkGray.maxZoom,
    })

    const imageryLayer = L.tileLayer(ESRI_BASEMAPS.imagery.url, {
      attribution: ESRI_BASEMAPS.imagery.attribution,
      maxZoom: ESRI_BASEMAPS.imagery.maxZoom,
    })

    basemapLayersRef.current = {
      streets: streetsLayer,
      lightGray: lightGrayLayer,
      darkGray: darkGrayLayer,
      imagery: imageryLayer,
    }

    // Add default basemap
    basemapLayersRef.current[defaultBasemap].addTo(map)

    workAreaLayerRef.current = L.layerGroup().addTo(map)
    georefLayerRef.current = L.layerGroup().addTo(map)
    bubblesLayerRef.current = L.layerGroup().addTo(map)
    shapesLayerRef.current = L.layerGroup().addTo(map)
    recordLayerRef.current = L.layerGroup().addTo(map)

    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      drawPolyline: true,
      drawCircle: false,
      drawCircleMarker: false,
      drawMarker: true,
      drawRectangle: true,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: true,
    })

    setTimeout(() => {
      map.invalidateSize()
      setIsInitialized(true)
    }, 100)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [defaultCenter, defaultZoom, defaultBasemap, mode, enableDrop, onDropFilesAt])

  useEffect(() => {
    const map = mapInstanceRef.current
    const workAreaLayer = workAreaLayerRef.current
    const recordLayer = recordLayerRef.current
    if (!map || !workAreaLayer || !recordLayer) return

    const handleCreate = (e: any) => {
      if (!e || !e.layer) {
        return
      }

      const layer = e.layer
      const id = `feature-${Date.now()}-${Math.random()}`

      const targetLayerType = drawMode === "record" ? "record" : "workArea"
      const targetLayer = targetLayerType === "record" ? recordLayer : workAreaLayer

      let featureData: DrawnFeature | null = null

      layer.on("click", () => {
        setSelectedFeatureId(id)
      })

      if (layer instanceof L.Polygon) {
        const latlngs = layer.getLatLngs()[0] as L.LatLng[]
        const area = calculateArea(latlngs)
        const coordinates = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }))

        if (isDuplicateFeature(coordinates, drawnFeatures)) {
          map.removeLayer(layer)
          return
        }

        featureData = {
          id,
          type: "polygon",
          area,
          coordinates,
          layer,
          layerType: targetLayerType,
        }

        targetLayer.addLayer(layer)

        if (targetLayerType === "workArea") {
          onPolygonChange?.(coordinates, area)
        }
      } else if (layer instanceof L.Polyline) {
        const latlngs = layer.getLatLngs() as L.LatLng[]
        const coordinates = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }))

        if (isDuplicateFeature(coordinates, drawnFeatures)) {
          map.removeLayer(layer)
          return
        }

        featureData = {
          id,
          type: "polyline",
          coordinates,
          layer,
          layerType: targetLayerType,
        }

        targetLayer.addLayer(layer)
      } else if (layer instanceof L.Marker) {
        const latlng = layer.getLatLng()
        const coordinates = [{ lat: latlng.lat, lng: latlng.lng }]

        if (isDuplicateFeature(coordinates, drawnFeatures)) {
          map.removeLayer(layer)
          return
        }

        featureData = {
          id,
          type: "marker",
          coordinates,
          layer,
          layerType: targetLayerType,
        }

        targetLayer.addLayer(layer)
      } else if (layer instanceof L.Rectangle) {
        const latlngs = layer.getLatLngs()[0] as L.LatLng[]
        const area = calculateArea(latlngs)
        const coordinates = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }))

        if (isDuplicateFeature(coordinates, drawnFeatures)) {
          map.removeLayer(layer)
          return
        }

        featureData = {
          id,
          type: "rectangle",
          area,
          coordinates,
          layer,
          layerType: targetLayerType,
        }

        targetLayer.addLayer(layer)
      }

      if (featureData) {
        setDrawnFeatures((prev) => [...prev, featureData!])
        setSelectedFeatureId(id)
      }
    }

    const handleEdit = (e: any) => {
      if (!e || !e.layer) {
        return
      }

      // Update feature data after edit
      setDrawnFeatures((prev) =>
        prev.map((feature) => {
          if (feature.layer === e.layer) {
            if (feature.layer instanceof L.Polygon || feature.layer instanceof L.Rectangle) {
              const latlngs = feature.layer.getLatLngs()[0] as L.LatLng[]
              const area = calculateArea(latlngs)
              const coordinates = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }))

              return { ...feature, area, coordinates }
            } else if (feature.layer instanceof L.Polyline) {
              const latlngs = feature.layer.getLatLngs() as L.LatLng[]
              const coordinates = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
              return { ...feature, coordinates }
            } else if (feature.layer instanceof L.Marker) {
              const latlng = feature.layer.getLatLng()
              const coordinates = [{ lat: latlng.lat, lng: latlng.lng }]
              return { ...feature, coordinates }
            }
          }
          return feature
        }),
      )
    }

    const handleRemove = (e: any) => {
      if (!e || !e.layer) {
        return
      }

      // Remove feature from state and clean up layer reference
      setDrawnFeatures((prev) => {
        const filtered = prev.filter((feature) => feature.layer !== e.layer)

        if (filtered.length === 0) {
          onPolygonChange?.([], null)
        }

        return filtered
      })
    }

    map.on("pm:create", handleCreate)
    map.on("pm:edit", handleEdit)
    map.on("pm:remove", handleRemove)

    return () => {
      map.off("pm:create", handleCreate)
      map.off("pm:edit", handleEdit)
      map.off("pm:remove", handleRemove)
    }
  }, [onPolygonChange, drawnFeatures, isDuplicateFeature, drawMode])

  useEffect(() => {
    const map = mapInstanceRef.current
    const georefLayer = georefLayerRef.current
    if (!map || !georefLayer || mode !== "georef" || georefMode === "none") return

    georefLayer.clearLayers()

    let currentLayer: L.Marker | L.Polyline | L.Polygon | null = null
    let points: L.LatLng[] = []

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (georefMode === "point") {
        const marker = L.marker(e.latlng, {
          icon: L.icon({
            iconUrl: "/leaflet/marker-icon.png",
            iconRetinaUrl: "/leaflet/marker-icon-2x.png",
            shadowUrl: "/leaflet/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
          }),
        }).addTo(georefLayer)
        onGeorefComplete?.({ type: "Point", point: { lat: e.latlng.lat, lng: e.latlng.lng } })
      } else if (georefMode === "line" || georefMode === "polygon") {
        points.push(e.latlng)

        if (currentLayer) {
          georefLayer.removeLayer(currentLayer)
        }

        if (georefMode === "line") {
          currentLayer = L.polyline(points, {
            color: georefColor,
            weight: 3,
          }).addTo(georefLayer)
        } else {
          currentLayer = L.polygon(points, {
            color: georefColor,
            fillColor: georefColor,
            fillOpacity: 0.2,
            weight: 3,
          }).addTo(georefLayer)
        }
      }
    }

    const handleDblClick = () => {
      if ((georefMode === "line" || georefMode === "polygon") && points.length > 1) {
        const path = points.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
        onGeorefComplete?.({
          type: georefMode === "line" ? "LineString" : "Polygon",
          path,
        })
        points = []
        currentLayer = null
      }
    }

    map.on("click", handleClick)
    map.on("dblclick", handleDblClick)

    return () => {
      map.off("click", handleClick)
      map.off("dblclick", handleDblClick)
      georefLayer.clearLayers()
    }
  }, [mode, georefMode, georefColor, onGeorefComplete])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !pickPointActive) return

    const handleClick = (e: L.LeafletMouseEvent) => {
      map.setView(e.latlng, pickZoom)
    }

    map.on("click", handleClick)

    return () => {
      map.off("click", handleClick)
    }
  }, [pickPointActive, pickZoom])

  useEffect(() => {
    const map = mapInstanceRef.current
    const workAreaLayer = workAreaLayerRef.current
    if (!map || !workAreaLayer || !isInitialized) return

    if (polygonLayerRef.current) {
      workAreaLayer.removeLayer(polygonLayerRef.current)
      polygonLayerRef.current = null
    }

    if (polygon && polygon.length > 0) {
      const latlngs = polygon.map((p) => L.latLng(p.lat, p.lng))
      const polygonLayer = L.polygon(latlngs, {
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(workAreaLayer)
      polygonLayerRef.current = polygonLayer
    }
  }, [polygon, isInitialized])

  useEffect(() => {
    const bubblesLayer = bubblesLayerRef.current
    if (!bubblesLayer || !isInitialized) return

    bubblesLayer.clearLayers()

    bubbles.forEach((bubble) => {
      const marker = L.circleMarker([bubble.position.lat, bubble.position.lng], {
        radius: bubble.size || 10,
        fillColor: "#3b82f6",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(bubblesLayer)

      marker.bindPopup(`
        <div>
          <strong>${bubble.title}</strong><br/>
          ${bubble.description}<br/>
          <em>${bubble.recordLabel}</em>
        </div>
      `)
    })
  }, [bubbles, isInitialized])

  useEffect(() => {
    const shapesLayer = shapesLayerRef.current
    if (!shapesLayer || !isInitialized) return

    shapesLayer.clearLayers()

    shapes.forEach((shape) => {
      const latlngs = shape.path.map((p) => L.latLng(p.lat, p.lng))

      if (shape.type === "line") {
        L.polyline(latlngs, {
          color: shape.color || "#ef4444",
          weight: 3,
        }).addTo(shapesLayer)
      } else if (shape.type === "polygon") {
        L.polygon(latlngs, {
          color: shape.color || "#ef4444",
          fillColor: shape.fillColor || shape.color || "#ef4444",
          fillOpacity: shape.fillOpacity ?? 0.2,
          weight: 2,
        }).addTo(shapesLayer)
      }
    })
  }, [shapes, isInitialized])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !focusPoint || !isInitialized) return

    map.setView([focusPoint.lat, focusPoint.lng], focusZoom)
  }, [focusPoint, focusZoom, isInitialized])

  useEffect(() => {
    const recordLayer = recordLayerRef.current
    if (!recordLayer || !isInitialized) return

    recordLayer.clearLayers()

    if (records && records.features) {
      L.geoJSON(records, {
        onEachFeature: (feature, layer) => {
          layer.on("click", () => {
            const properties = feature.properties || {}
            const propertyEntries = Object.entries(properties)

            let popupContent = "<div style='max-width: 300px;'>"
            popupContent +=
              "<strong style='font-size: 14px; display: block; margin-bottom: 8px;'>Record Metadata</strong>"

            if (propertyEntries.length === 0) {
              popupContent += "<em style='color: #666;'>No metadata available</em>"
            } else {
              popupContent += "<table style='width: 100%; font-size: 12px;'>"
              propertyEntries.forEach(([key, value]) => {
                popupContent += `<tr><td style='padding: 4px 8px 4px 0; font-weight: 600;'>${key}:</td><td style='padding: 4px 0;'>${value}</td></tr>`
              })
              popupContent += "</table>"
            }

            popupContent += "</div>"

            layer.bindPopup(popupContent).openPopup()
          })
        },
        style: (feature) => {
          return {
            color: "#6b21a8",
            fillColor: "#6b21a8",
            fillOpacity: 0.4,
            weight: 2,
          }
        },
      }).addTo(recordLayer)
    }
  }, [records, isInitialized])

  const downloadDrawnGeoJSON = () => {
    const workAreaLayer = workAreaLayerRef.current
    if (!workAreaLayer) {
      return
    }

    const geojson = exportToGeoJSON(workAreaLayer)
    downloadGeoJSON(geojson, `work_areas_${new Date().toISOString().split("T")[0]}.geojson`)
  }

  const logAllLayers = () => {
    const map = mapInstanceRef.current
    if (!map || !(map as any)._layers) {
      return
    }

    Object.values((map as any)._layers).forEach((layer: any, index: number) => {
      const type = layer.constructor?.name || "Unknown"
      const id = layer._leaflet_id || "—"
      const pane = layer.options?.pane || "default"
    })

    logLayerCounts()
  }

  const logDrawnGeoJSON = () => {
    const workAreaLayer = workAreaLayerRef.current
    if (!workAreaLayer) {
      return
    }

    const geojson = exportToGeoJSON(workAreaLayer)
    const bbox = getBoundingBox(geojson.features)
  }

  const logLayerCounts = () => {
    let totalArea = 0
    drawnFeatures.forEach((feature) => {
      if (feature.area) {
        totalArea += feature.area
      }
    })
  }

  const formatCoordinates = (coords: LatLng[]) => {
    return coords.map((c, i) => (
      <div key={i} className="text-[10px] font-mono">
        [{c.lat.toFixed(6)}, {c.lng.toFixed(6)}]
      </div>
    ))
  }

  const copyFeatureGeoJSON = (feature: DrawnFeature) => {
    const geojson = {
      type: "Feature",
      geometry: {
        type:
          feature.type === "polygon" || feature.type === "rectangle"
            ? "Polygon"
            : feature.type === "polyline"
              ? "LineString"
              : "Point",
        coordinates:
          feature.type === "marker"
            ? [feature.coordinates[0].lng, feature.coordinates[0].lat]
            : feature.type === "polygon" || feature.type === "rectangle"
              ? [feature.coordinates.map((c) => [c.lng, c.lat])]
              : feature.coordinates.map((c) => [c.lng, c.lat]),
      },
      properties: {
        area: feature.area,
      },
    }

    navigator.clipboard.writeText(JSON.stringify(geojson, null, 2))
  }

  const zoomToFeature = (feature: DrawnFeature) => {
    const map = mapInstanceRef.current
    if (!map) return

    if (
      feature.layer instanceof L.Polygon ||
      feature.layer instanceof L.Rectangle ||
      feature.layer instanceof L.Polyline
    ) {
      const bounds = feature.layer.getBounds()
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (feature.layer instanceof L.Marker) {
      const latlng = feature.layer.getLatLng()
      map.setView(latlng, 16)
    }

    setSelectedFeatureId(feature.id)
  }

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar - Developer Tools (1/3 width) */}
      <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="border-b border-gray-200 pb-3">
            <h2 className="font-semibold text-lg">Developer Tools</h2>
            <p className="text-xs text-gray-500 mt-1">Map debugging and layer management</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <div className="font-semibold text-sm mb-3 text-gray-800">Drawing Mode</div>
            <div className="space-y-2">
              <button
                onClick={() => activateDrawMode(drawMode === "workArea" ? null : "workArea")}
                className={`w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  drawMode === "workArea"
                    ? "bg-green-500 text-white shadow-lg scale-105"
                    : "bg-white text-gray-700 hover:bg-green-50 border border-gray-200"
                }`}
              >
                {drawMode === "workArea" ? "🟢 Work Area Mode Active" : "Draw Work Area"}
              </button>

              <button
                onClick={() => activateDrawMode(drawMode === "record" ? null : "record")}
                className={`w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  drawMode === "record"
                    ? "bg-purple-500 text-white shadow-lg scale-105"
                    : "bg-white text-gray-700 hover:bg-purple-50 border border-gray-200"
                }`}
              >
                {drawMode === "record" ? "🟣 Record Mode Active" : "Draw Record"}
              </button>

              <button
                onClick={() => activateDrawMode(drawMode === "edit" ? null : "edit")}
                className={`w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  drawMode === "edit"
                    ? "bg-yellow-500 text-white shadow-lg scale-105"
                    : "bg-white text-gray-700 hover:bg-yellow-50 border border-gray-200"
                }`}
              >
                {drawMode === "edit" ? "🟡 Edit Mode Active" : "Edit Features"}
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => clearLayerFeatures("workArea")}
                  className="flex-1 px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                  disabled={drawnFeatures.filter((f) => f.layerType === "workArea").length === 0}
                >
                  Clear Work Areas
                </button>
                <button
                  onClick={() => clearLayerFeatures("record")}
                  className="flex-1 px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                  disabled={drawnFeatures.filter((f) => f.layerType === "record").length === 0}
                >
                  Clear Records
                </button>
              </div>
            </div>

            {drawMode && drawMode !== "edit" && (
              <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-800">
                <strong>Tip:</strong> Use the toolbar on the map to draw shapes. They will be added to the{" "}
                {drawMode === "workArea" ? "Work Area" : "Record"} layer.
              </div>
            )}
            {drawMode === "edit" && (
              <div className="mt-3 p-2 bg-yellow-100 rounded text-xs text-yellow-800">
                <strong>Edit Mode:</strong> Click and drag vertices to modify shapes. Use the toolbar to delete
                features.
              </div>
            )}
          </div>

          {/* Layer Statistics */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="font-semibold text-sm mb-3">Layer Statistics</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">🟢 Work Areas:</span>
                <span className="font-mono font-semibold">
                  {drawnFeatures.filter((f) => f.layerType === "workArea").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">🟣 Records:</span>
                <span className="font-mono font-semibold">
                  {drawnFeatures.filter((f) => f.layerType === "record").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Existing Records:</span>
                <span className="font-mono font-semibold">{recordLayerRef.current?.getLayers().length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Georef Points/Lines:</span>
                <span className="font-mono font-semibold">{georefLayerRef.current?.getLayers().length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Record Markers:</span>
                <span className="font-mono font-semibold">{bubblesLayerRef.current?.getLayers().length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Record Boundaries:</span>
                <span className="font-mono font-semibold">{shapesLayerRef.current?.getLayers().length || 0}</span>
              </div>
              {drawnFeatures.some((f) => f.area) && (
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Area:</span>
                    <span className="font-mono font-semibold">
                      {sqMetersToHectares(drawnFeatures.reduce((sum, f) => sum + (f.area || 0), 0)).toFixed(4)} ha
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={downloadDrawnGeoJSON}
              className="w-full px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium text-sm"
              disabled={!workAreaLayerRef.current || workAreaLayerRef.current.getLayers().length === 0}
            >
              Download GeoJSON
            </button>

            <button
              onClick={logAllLayers}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            >
              Log All Layers
            </button>
            <button
              onClick={logDrawnGeoJSON}
              className="w-full px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
            >
              Export to Console
            </button>
            <button
              onClick={logLayerCounts}
              className="w-full px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
            >
              Log Layer Counts
            </button>
          </div>

          {/* Current Basemap Info */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="font-semibold text-sm mb-2">Current Basemap</div>
            <div className="text-xs text-gray-700 capitalize">
              {currentBasemapRef.current.replace(/([A-Z])/g, " $1").trim()}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Map (2/3 width) */}
      <div className="relative w-2/3 h-full">
        <div ref={mapRef} className="h-full w-full z-0" />

        {/* Basemap Controls - Bottom Left */}
        <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
          <div className="bg-white shadow-lg rounded-lg p-2 space-y-1">
            <div className="text-[10px] font-semibold text-gray-600 px-1 mb-1">Basemap</div>
            <button
              onClick={() => switchBasemap("streets")}
              className={`w-full px-2 py-1 text-xs rounded transition-colors ${
                currentBasemapRef.current === "streets"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Streets
            </button>
            <button
              onClick={() => switchBasemap("lightGray")}
              className={`w-full px-2 py-1 text-xs rounded transition-colors ${
                currentBasemapRef.current === "lightGray"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Light Gray
            </button>
            <button
              onClick={() => switchBasemap("darkGray")}
              className={`w-full px-2 py-1 text-xs rounded transition-colors ${
                currentBasemapRef.current === "darkGray"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Dark Gray
            </button>
            <button
              onClick={() => switchBasemap("imagery")}
              className={`w-full px-2 py-1 text-xs rounded transition-colors ${
                currentBasemapRef.current === "imagery"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Imagery
            </button>
          </div>

          <div className="bg-white shadow-lg rounded-lg p-2 space-y-1">
            <button
              onClick={recenterMap}
              className="w-full px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors font-medium"
              title="Reset map to default view"
            >
              ↻ Recenter
            </button>
            <button
              onClick={clearAllDrawnFeatures}
              className="w-full px-2 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors font-medium"
              disabled={drawnFeatures.length === 0}
              title="Clear all drawn features"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Drawn Features Panel - Bottom Center */}
        {drawnFeatures.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white shadow-lg rounded-lg overflow-hidden max-w-md">
            <div className="bg-green-500 text-white px-3 py-2 font-semibold text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🟢</span>
                <span>New Geometry Layer</span>
              </div>
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{drawnFeatures.length} features</span>
            </div>

            <div className="p-3 max-h-80 overflow-y-auto">
              <div className="text-[10px] text-gray-500 mb-3">
                Projection: WGS84 (EPSG:4326) • Click feature to view details
              </div>

              <div className="space-y-2">
                {drawnFeatures.map((feature, index) => (
                  <div
                    key={feature.id}
                    className={`border rounded-lg p-2 transition-all cursor-pointer ${
                      selectedFeatureId === feature.id
                        ? "border-green-500 bg-green-50 shadow-md"
                        : "border-gray-200 hover:border-green-300 hover:bg-gray-50"
                    }`}
                    onClick={() => zoomToFeature(feature)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold capitalize text-sm ${
                            selectedFeatureId === feature.id ? "text-green-700" : "text-gray-700"
                          }`}
                        >
                          {feature.type} {index + 1}
                        </span>
                        {selectedFeatureId === feature.id && (
                          <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded">Selected</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyFeatureGeoJSON(feature)
                        }}
                        className="px-2 py-0.5 bg-blue-500 text-white rounded text-[10px] hover:bg-blue-600 transition-colors"
                        title="Copy GeoJSON to clipboard"
                      >
                        Copy JSON
                      </button>
                    </div>

                    {feature.area && (
                      <div className="text-xs text-gray-700 mb-2 bg-gray-50 p-2 rounded">
                        <div className="font-semibold text-gray-600 mb-1">Area</div>
                        <div className="font-mono">{sqMetersToHectares(feature.area).toFixed(4)} hectares</div>
                        <div className="text-[10px] text-gray-500">({feature.area.toFixed(2)} m²)</div>
                      </div>
                    )}

                    <div className="text-xs">
                      <div className="font-semibold text-gray-600 mb-1">
                        Coordinates ({feature.coordinates.length}{" "}
                        {feature.coordinates.length === 1 ? "point" : "vertices"})
                      </div>
                      <div className="text-[10px] text-gray-500 mb-1">[Latitude, Longitude]</div>
                      <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded space-y-0.5">
                        {formatCoordinates(feature.coordinates)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
