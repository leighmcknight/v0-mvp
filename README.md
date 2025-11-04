# Map Component with Drawing Tools

A production-ready Next.js map component featuring Leaflet, Geoman drawing tools, and ESRI basemaps. Built for the UTILITX MVP.

## Features

- **Multiple ESRI Basemaps**: Streets, Light Gray, Dark Gray, and Imagery
- **Drawing Tools**: Polygon, polyline, marker, and rectangle drawing with Geoman
- **Layer Management**: Separate layer groups for new geometry, georeferencing, record markers, and boundaries
- **Area Calculation**: Real-time area calculation in square meters and hectares
- **GeoJSON Export**: Download drawn features as GeoJSON files
- **Developer Tools**: Debug panel with layer statistics and console logging
- **Duplicate Prevention**: Automatic detection and prevention of duplicate features
- **Map Controls**: Basemap switcher, recenter, and clear all features

## Installation

### Prerequisites

- Node.js 18+ 
- Next.js 14+
- React 18+

### Dependencies

\`\`\`bash
npm install leaflet @geoman-io/leaflet-geoman-free
npm install -D @types/leaflet
\`\`\`

### Required CSS

Add these imports to your layout or global CSS:

\`\`\`typescript
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"
\`\`\`

### Leaflet Marker Icons

Copy the marker icon files to your `public/leaflet/` directory:
- `marker-icon.png`
- `marker-icon-2x.png`
- `marker-shadow.png`

These files are included in the project export.

## Usage

### Basic Example

\`\`\`typescript
import { MapWithDrawing } from "@/components/map-with-drawing"

export default function Page() {
  const handlePolygonChange = (polygon, area) => {
    console.log("Polygon updated:", polygon, "Area:", area, "m²")
  }

  return (
    <div className="h-screen">
      <MapWithDrawing
        mode="draw"
        onPolygonChange={handlePolygonChange}
        defaultCenter={{ lat: 43.7, lng: -79.4 }}
        defaultZoom={12}
        defaultBasemap="streets"
      />
    </div>
  )
}
\`\`\`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `"draw" \| "georef"` | `"draw"` | Map interaction mode |
| `polygon` | `LatLng[]` | `[]` | Initial polygon coordinates |
| `onPolygonChange` | `(polygon: LatLng[], area: number \| null) => void` | - | Callback when polygon changes |
| `georefMode` | `"none" \| "point" \| "line" \| "polygon"` | `"none"` | Georeferencing mode |
| `georefColor` | `string` | `"#3b82f6"` | Color for georef features |
| `onGeorefComplete` | `(result) => void` | - | Callback when georef is complete |
| `bubbles` | `Bubble[]` | `[]` | Record markers to display |
| `shapes` | `Shape[]` | `[]` | Record boundaries to display |
| `focusPoint` | `LatLng \| null` | `null` | Point to focus on |
| `focusZoom` | `number` | `16` | Zoom level when focusing |
| `defaultCenter` | `LatLng` | `{ lat: 43.7, lng: -79.4 }` | Default map center |
| `defaultZoom` | `number` | `12` | Default zoom level |
| `defaultBasemap` | `BasemapType` | `"streets"` | Default basemap |

### Utility Functions

The `utils/mapUtils.ts` file provides reusable functions:

\`\`\`typescript
import { 
  calculateArea, 
  sqMetersToHectares,
  formatArea,
  exportToGeoJSON,
  downloadGeoJSON 
} from "@/utils/mapUtils"

// Calculate area of a polygon
const area = calculateArea(latlngs)

// Convert to hectares
const hectares = sqMetersToHectares(area)

// Format for display
const formatted = formatArea(area) // "1.5 hectares"

// Export layer to GeoJSON
const geojson = exportToGeoJSON(layerGroup)

// Download as file
downloadGeoJSON(geojson, "my-features.geojson")
\`\`\`

## Layer Groups

The component manages four separate layer groups:

1. **New Geometry** - User-drawn features (polygons, lines, markers)
2. **Georef Points/Lines** - Georeferencing features
3. **Record Markers** - Bubble markers for records
4. **Record Boundaries** - Polygon/line boundaries for records

Use the layer control (top-right) to toggle visibility of each group.

## Map Controls

### Basemap Switcher (Top-Left)
- Streets
- Light Gray
- Dark Gray
- Imagery

### Action Buttons (Top-Left)
- **Recenter** - Reset map to default view
- **Clear All** - Remove all drawn features

### Developer Tools (Top-Right)
- Layer statistics
- Download GeoJSON
- Console logging tools

## Development

### Debug Mode

All console logging is gated behind `process.env.NODE_ENV === "development"`. In production builds, debug logs are automatically removed.

### Console Logging

Use the developer tools panel to:
- Log all map layers
- Export GeoJSON to console
- View layer counts and statistics

## ESRI Attribution

This component uses ESRI basemaps. The required attribution ("Tiles © Esri") is automatically included in the map. Ensure you comply with [ESRI's terms of service](https://www.esri.com/en-us/legal/terms/full-master-agreement).

## File Structure

\`\`\`
/components
  └── map-with-drawing.tsx    # Main map component
/utils
  └── mapUtils.ts             # Shared utility functions
/public
  └── leaflet/
      ├── marker-icon.png
      ├── marker-icon-2x.png
      └── marker-shadow.png
\`\`\`

## Migration to GitHub Repo

When migrating this component to your main codebase:

1. Copy `components/map-with-drawing.tsx`
2. Copy `utils/mapUtils.ts`
3. Copy `public/leaflet/` directory
4. Install dependencies: `npm install leaflet @geoman-io/leaflet-geoman-free`
5. Add CSS imports to your layout
6. Update import paths as needed

## License

This component is part of the UTILITX MVP project.

## Support

For issues or questions, contact the development team.
