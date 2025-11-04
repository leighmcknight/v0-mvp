"use client"

import { MapWithDrawing } from "@/components/map-with-drawing"
import { useState } from "react"

export default function Page() {
  const [mode, setMode] = useState<"draw" | "georef">("draw")
  const [georefMode, setGeorefMode] = useState<"none" | "point" | "line" | "polygon">("none")
  const [polygon, setPolygon] = useState<{ lat: number; lng: number }[]>([])
  const [area, setArea] = useState<number | null>(null)

  const handlePolygonChange = (newPolygon: { lat: number; lng: number }[], areaSqMeters: number | null) => {
    setPolygon(newPolygon)
    setArea(areaSqMeters)
  }

  const handleGeorefComplete = (result: any) => {}

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - 1/3 width */}
      <div className="w-1/3 border-r overflow-y-auto">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Map with Drawing</h1>
            <p className="text-muted-foreground text-sm mt-1">Esri Basemap + Geoman Tools + Layers</p>
          </div>

          {/* Mode Controls */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Mode</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMode("draw")}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  mode === "draw"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Draw Mode
              </button>
              <button
                onClick={() => setMode("georef")}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  mode === "georef"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Georef Mode
              </button>
            </div>
          </div>

          {/* Georef Controls */}
          {mode === "georef" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Georef Type</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setGeorefMode("point")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    georefMode === "point"
                      ? "bg-blue-500 text-white"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  Point
                </button>
                <button
                  onClick={() => setGeorefMode("line")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    georefMode === "line"
                      ? "bg-blue-500 text-white"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  Line
                </button>
                <button
                  onClick={() => setGeorefMode("polygon")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    georefMode === "polygon"
                      ? "bg-blue-500 text-white"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  Polygon
                </button>
              </div>
            </div>
          )}

          {/* Area Display */}
          {polygon.length > 0 && area && (
            <div className="rounded-lg border bg-card p-3">
              <div className="text-sm">
                <span className="font-medium">Total Area:</span>
                <div className="text-lg font-bold mt-1">{(area / 1000000).toFixed(2)} km²</div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="rounded-lg border bg-card p-4 text-sm">
            <h3 className="font-semibold mb-2">Instructions:</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>Draw Mode:</strong> Use the polygon tool in the top-left to draw work areas.
              </li>
              <li>
                <strong>Georef Mode:</strong> Select type, then click on map. Double-click to complete.
              </li>
              <li>
                <strong>Layers:</strong> Use layer control (top-right) to toggle visibility.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border bg-card p-4 text-sm">
            <h3 className="font-semibold mb-2">Layer Legend:</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-muted-foreground">🟢 Work Areas (User-drawn)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Map - 2/3 width, full height */}
      <div className="w-2/3 h-full">
        <MapWithDrawing
          mode={mode}
          polygon={polygon}
          onPolygonChange={handlePolygonChange}
          georefMode={georefMode}
          georefColor="#3b82f6"
          onGeorefComplete={handleGeorefComplete}
          bubbles={[]}
          shapes={[]}
        />
      </div>
    </div>
  )
}
