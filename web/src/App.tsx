// Written with AI assistance (Claude Code).
// Starter map: proves the Mars Trek tile recipe and shows the real site.
// Routing, comparison and the briefing are not built yet (docs/PLAN.md).

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { AOI, TREK_LAYERS, trekUrl } from './layers'

type Station = {
  id: string
  name: string
  waypoint_sol: number
  elev_geoid_m: number
  note: string
}

export default function App() {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!el.current) return
    const aoi = L.latLngBounds([AOI.south, AOI.west], [AOI.north, AOI.east])
    const map = L.map(el.current, {
      crs: L.CRS.EPSG4326,
      minZoom: 6,
      maxZoom: 19,
      zoomSnap: 0.5,
    }).fitBounds(aoi)

    const bases: Record<string, L.Layer> = {}
    const overlays: Record<string, L.Layer> = {}
    for (const l of TREK_LAYERS) {
      const layer = L.tileLayer(trekUrl(l.product), {
        maxNativeZoom: l.maxNativeZoom,
        maxZoom: 19,
        opacity: l.opacity,
        attribution: `${l.instrument}: ${l.credit}`,
      })
      const name = `${l.label} <small>(${l.mission}, ${l.resolution})</small>`
      if (l.base) bases[name] = layer
      else overlays[name] = layer
    }
    Object.values(bases)[0].addTo(map)

    L.rectangle(aoi, { color: '#f2b84b', weight: 1, fill: false, dashArray: '4 4' }).addTo(map)

    const track = L.geoJSON(undefined, { style: { color: '#6ec3ff', weight: 2 } }).addTo(map)
    const stations = L.layerGroup().addTo(map)
    overlays['Curiosity track <small>(NASA/JPL-Caltech)</small>'] = track
    overlays['Science stations'] = stations

    const base = import.meta.env.BASE_URL
    fetch(`${base}data/track.geojson`)
      .then((r) => r.json())
      .then((g) => track.addData(g))
    fetch(`${base}data/stations.geojson`)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection<GeoJSON.Point, Station>) => {
        for (const f of g.features) {
          const [lon, lat] = f.geometry.coordinates
          const p = f.properties
          L.circleMarker([lat, lon], {
            radius: 7,
            color: '#1b1410',
            weight: 2,
            fillColor: p.id.startsWith('S') ? '#f2b84b' : '#ffffff',
            fillOpacity: 1,
          })
            .bindTooltip(`${p.id} ${p.name}`)
            .bindPopup(
              `<b>${p.id} ${p.name}</b><br>${p.note}<br>` +
                `Elevation ${p.elev_geoid_m.toFixed(1)} m (rover localization, sol ${p.waypoint_sol})<br>` +
                `<small>Rover position, not drill-hole position. NASA/JPL-Caltech.</small>`,
            )
            .addTo(stations)
        }
      })

    L.control.layers(bases, overlays, { collapsed: false }).addTo(map)
    // No L.control.scale here: Leaflet's scale bar assumes Earth's radius.

    return () => {
      map.remove()
    }
  }, [])

  return (
    <div className="app">
      <header>
        <h1>MARSWALK</h1>
        <p>Boxwork unit, Mount Sharp, Gale crater. Starter map: layers and stations only.</p>
      </header>
      <div ref={el} className="map" />
    </div>
  )
}
