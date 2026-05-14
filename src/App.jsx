import { useEffect, useMemo, useState } from "react"
import L from "leaflet"
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

const ALTITUDE_STEP = 2000

const CANVAS_RENDERER = L.canvas({
  padding: 0.5,
  tolerance: 8
})

const ALTITUDE_COLORS = [
  { altitude: 0, color: "#326ed2" },
  { altitude: 2000, color: "#3c82dc" },
  { altitude: 4000, color: "#46aadc" },
  { altitude: 6000, color: "#4bc3b4" },
  { altitude: 8000, color: "#5ac85f" },
  { altitude: 10000, color: "#8cc34b" },
  { altitude: 12000, color: "#c8be46" },
  { altitude: 14000, color: "#e1af3c" },
  { altitude: 16000, color: "#e69137" },
  { altitude: 18000, color: "#e67832" },
  { altitude: 20000, color: "#e15f2d" },
  { altitude: 22000, color: "#d74632" },
  { altitude: 24000, color: "#c83c46" },
  { altitude: 26000, color: "#b43e64" },
  { altitude: 28000, color: "#a04282" },
  { altitude: 30000, color: "#8c4696" },
  { altitude: 32000, color: "#784aa5" },
  { altitude: 34000, color: "#694aaf" },
  { altitude: 36000, color: "#5f46af" },
  { altitude: 38000, color: "#5540a8" },
  { altitude: 40000, color: "#4c3a9c" }
]

function normalizeAltitude(altitude) {
  const value = Number(altitude)

  if (!Number.isFinite(value)) {
    return 0
  }

  const rounded = Math.floor(value / ALTITUDE_STEP) * ALTITUDE_STEP

  if (rounded < 0) {
    return 0
  }

  if (rounded > 40000) {
    return 40000
  }

  return rounded
}

function altitudeColor(altitude) {
  const normalized = normalizeAltitude(altitude)
  const found = ALTITUDE_COLORS.find((item) => item.altitude === normalized)

  return found ? found.color : "#666666"
}

function altitudeLabel(altitude) {
  const normalized = normalizeAltitude(altitude)
  const next = normalized + ALTITUDE_STEP

  if (normalized >= 40000) {
    return "40000+ ft"
  }

  return `${normalized} - ${next} ft`
}

function groupKey(point) {
  return `${point.aircraft || "-"}|${point.flight || "-"}|${point.origem || "-"}|${point.destino || "-"}`
}

function validPoint(point) {
  const lat = Number(point.lat)
  const lon = Number(point.lon)

  return Number.isFinite(lat) && Number.isFinite(lon)
}

function FitBounds({ points, onDone }) {
  const map = useMap()

  useEffect(() => {
    if (!points.length) {
      onDone()
      return
    }

    const bounds = L.latLngBounds(points.map((point) => [Number(point.lat), Number(point.lon)]))

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize()
      onDone()
    }, 500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [map, points, onDone])

  return null
}

function MapInvalidator({ points }) {
  const map = useMap()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize()
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [map, points.length])

  return null
}

export default function App() {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [mapDrawing, setMapDrawing] = useState(true)
  const [error, setError] = useState("")
  const [selectedAltitudes, setSelectedAltitudes] = useState(() => {
    return new Set(ALTITUDE_COLORS.map((item) => item.altitude))
  })

  const showLoading = loading || mapDrawing

  const validPoints = useMemo(() => {
    return points.filter(validPoint)
  }, [points])

  const visiblePoints = useMemo(() => {
    return validPoints.filter((point) => selectedAltitudes.has(normalizeAltitude(point.altitude)))
  }, [validPoints, selectedAltitudes])

  const grouped = useMemo(() => {
    const map = new Map()

    for (const point of visiblePoints) {
      const key = groupKey(point)
      const list = map.get(key) || []
      list.push(point)
      map.set(key, list)
    }

    return Array.from(map.entries())
  }, [visiblePoints])

  const altitudeGroups = useMemo(() => {
    const map = new Map()

    for (const point of validPoints) {
      const altitude = normalizeAltitude(point.altitude)
      map.set(altitude, (map.get(altitude) || 0) + 1)
    }

    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [validPoints])

  function toggleAltitude(altitude) {
    setSelectedAltitudes((current) => {
      const next = new Set(current)

      if (next.has(altitude)) {
        next.delete(altitude)
      } else {
        next.add(altitude)
      }

      return next
    })
  }

  function selectAllAltitudes() {
    setSelectedAltitudes(new Set(ALTITUDE_COLORS.map((item) => item.altitude)))
  }

  function clearAllAltitudes() {
    setSelectedAltitudes(new Set())
  }

  async function loadData() {
    setLoading(true)
    setMapDrawing(true)
    setError("")

    try {
      const response = await fetch(`${API_URL}/api/flights`)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Erro ${response.status}`)
      }

      const json = await response.json()
      setPoints(Array.isArray(json.data) ? json.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados")
      setMapDrawing(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="page">
      <aside className="sidebar">
        <div className="legend only-legend">
          <div className="legend-title">Altitude por faixa</div>

          <div className="legend-actions">
            <button type="button" onClick={selectAllAltitudes}>
              Marcar todas
            </button>

            <button type="button" onClick={clearAllAltitudes}>
              Limpar
            </button>
          </div>

          {ALTITUDE_COLORS.map((item) => {
            const count = altitudeGroups.find(([altitude]) => altitude === item.altitude)?.[1] || 0
            const checked = selectedAltitudes.has(item.altitude)

            return (
              <label className={`legend-row ${checked ? "" : "legend-row-disabled"}`} key={item.altitude}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAltitude(item.altitude)}
                />

                <span style={{ background: item.color }} />

                <strong>{altitudeLabel(item.altitude)}</strong>

                <small>{count ? `(${count})` : "(0)"}</small>
              </label>
            )
          })}
        </div>

        <div className="summary-box">
          <div>Total de pontos: {validPoints.length}</div>
          <div>Pontos visíveis: {visiblePoints.length}</div>
          <div>Total de rotas visíveis: {grouped.length}</div>
        </div>

        {error ? <div className="error">{error}</div> : null}
      </aside>

      <main className="map-area">
        {showLoading ? (
          <div className="loading-overlay">
            <div className="loading-card">
              <div className="loading-spinner" />
              <div className="loading-text">
                {loading ? "Carregando dados..." : "Desenhando mapa..."}
              </div>
            </div>
          </div>
        ) : null}

        <MapContainer
          center={[-14.235, -51.9253]}
          zoom={4}
          className="map"
          zoomControl
          preferCanvas
          renderer={CANVAS_RENDERER}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          <MapInvalidator points={visiblePoints} />
          <FitBounds points={visiblePoints} onDone={() => setMapDrawing(false)} />

          {grouped.map(([key, list]) => {
            const positions = list.map((point) => [Number(point.lat), Number(point.lon)])
            const first = list[0]
            const color = altitudeColor(first.altitude)

            if (positions.length < 2) {
              return null
            }

            return (
              <Polyline
                key={`line-${key}`}
                positions={positions}
                renderer={CANVAS_RENDERER}
                smoothFactor={2}
                pathOptions={{
                  color,
                  weight: 2,
                  opacity: 0.35,
                  interactive: true
                }}
              >
                <Tooltip sticky>
                  {first.flight} | {first.origem} → {first.destino}
                </Tooltip>
              </Polyline>
            )
          })}

          {visiblePoints.map((point, index) => {
            const color = altitudeColor(point.altitude)

            return (
              <CircleMarker
                key={`point-${point.flight || "flight"}-${point.aircraft || "aircraft"}-${index}`}
                center={[Number(point.lat), Number(point.lon)]}
                radius={3}
                renderer={CANVAS_RENDERER}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.9,
                  weight: 1,
                  opacity: 0.9
                }}
              >
                <Tooltip sticky>
                  {point.flight} | {point.altitude} ft | {altitudeLabel(point.altitude)}
                </Tooltip>

                <Popup>
                  <div className="popup">
                    <div><strong>Voo:</strong> {point.flight}</div>
                    <div><strong>Aeronave:</strong> {point.aircraft}</div>
                    <div><strong>Tipo:</strong> {point.aircraftType}</div>
                    <div><strong>Origem:</strong> {point.origem}</div>
                    <div><strong>Destino:</strong> {point.destino}</div>
                    <div><strong>Coordenada:</strong> {point.coord}</div>
                    <div><strong>Latitude:</strong> {Number(point.lat).toFixed(6)}</div>
                    <div><strong>Longitude:</strong> {Number(point.lon).toFixed(6)}</div>
                    <div><strong>Altitude:</strong> {point.altitude} ft</div>
                    <div><strong>Faixa:</strong> {altitudeLabel(point.altitude)}</div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </main>
    </div>
  )
}