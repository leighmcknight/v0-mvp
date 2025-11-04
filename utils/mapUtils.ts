import L from "leaflet"

/**
 * Calculate polygon area in square meters using spherical excess formula
 * @param latlngs Array of Leaflet LatLng points
 * @returns Area in square meters
 */
export function calculateArea(latlngs: L.LatLng[]): number {
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

/**
 * Convert square meters to hectares
 * @param sqMeters Area in square meters
 * @returns Area in hectares
 */
export function sqMetersToHectares(sqMeters: number): number {
  return sqMeters / 10000
}

/**
 * Convert square meters to square kilometers
 * @param sqMeters Area in square meters
 * @returns Area in square kilometers
 */
export function sqMetersToSqKm(sqMeters: number): number {
  return sqMeters / 1000000
}

/**
 * Format area for display with appropriate units
 * @param sqMeters Area in square meters
 * @returns Formatted string with appropriate units
 */
export function formatArea(sqMeters: number): string {
  if (sqMeters < 10000) {
    return `${sqMeters.toFixed(2)} m²`
  } else if (sqMeters < 1000000) {
    return `${sqMetersToHectares(sqMeters).toFixed(4)} hectares`
  } else {
    return `${sqMetersToSqKm(sqMeters).toFixed(2)} km²`
  }
}

/**
 * Check if two coordinate arrays represent the same feature
 * @param coords1 First coordinate array
 * @param coords2 Second coordinate array
 * @param tolerance Tolerance for floating point comparison (default: 0.000001)
 * @returns True if coordinates match within tolerance
 */
export function areCoordinatesEqual(
  coords1: { lat: number; lng: number }[],
  coords2: { lat: number; lng: number }[],
  tolerance = 0.000001,
): boolean {
  if (coords1.length !== coords2.length) return false

  return coords1.every((coord, index) => {
    const otherCoord = coords2[index]
    const latMatch = Math.abs(coord.lat - otherCoord.lat) < tolerance
    const lngMatch = Math.abs(coord.lng - otherCoord.lng) < tolerance
    return latMatch && lngMatch
  })
}

/**
 * Get bounding box string from GeoJSON features
 * @param features Array of GeoJSON features
 * @returns Bounding box string or null if no valid bounds
 */
export function getBoundingBox(features: any[]): string | null {
  if (features.length === 0) return null

  const geojsonLayer = L.geoJSON({ type: "FeatureCollection", features })
  const bounds = geojsonLayer.getBounds()

  if (!bounds.isValid()) return null

  return bounds.toBBoxString()
}

/**
 * Export features to GeoJSON format
 * @param layerGroup Leaflet LayerGroup containing features
 * @returns GeoJSON FeatureCollection
 */
export function exportToGeoJSON(layerGroup: L.LayerGroup): any {
  const features: any[] = []

  layerGroup.eachLayer((layer: any) => {
    if (layer.toGeoJSON) {
      features.push(layer.toGeoJSON())
    }
  })

  return {
    type: "FeatureCollection",
    features,
  }
}

/**
 * Download GeoJSON as a file
 * @param geojson GeoJSON object
 * @param filename Optional filename (default: timestamped)
 */
export function downloadGeoJSON(geojson: any, filename?: string): void {
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename || `features_${new Date().toISOString().split("T")[0]}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * ESRI basemap configurations
 */
export const ESRI_BASEMAPS = {
  streets: {
    name: "Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
  },
  lightGray: {
    name: "Light Gray",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  darkGray: {
    name: "Dark Gray",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  imagery: {
    name: "Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
  },
} as const

export type BasemapType = keyof typeof ESRI_BASEMAPS
