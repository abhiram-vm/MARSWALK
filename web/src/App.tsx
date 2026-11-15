// Written with AI assistance (Claude Code).
// Starter map: proves the Mars Trek tile recipe and shows the real site.
// Routing, comparison and the briefing are not built yet (docs/PLAN.md).

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { AOI, TREK_LAYERS, trekUrl } from './layers'

// Map marks sit on greyscale imagery in both themes, so they use fixed values:
// the dark-theme signal orange, off-white and ink. See docs/DESIGN.md.
const SIGNAL = '#f26a3a'

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

    L.rectangle(aoi, { color: SIGNAL, weight: 1, fill: false, dashArray: '4 4' }).addTo(map)

    const track = L.geoJSON(undefined, { style: { color: '#fafbfa', weight: 2, opacity: 0.9 } }).addTo(map)
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
            color: '#14181b',
            weight: 2,
            fillColor: p.id.startsWith('S') ? SIGNAL : '#fafbfa',
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
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-rule bg-surface px-4">
        <h1 className="text-base font-bold tracking-[0.2em]">MARSWALK</h1>
        <p className="hidden truncate font-mono text-xs text-ink-2 md:block">
          Boxwork unit, Mount Sharp, Gale crater. 4.80 S, 137.38 E
        </p>
        <p className="ml-auto shrink-0 border border-rule px-2 py-1 font-mono text-xs text-ink-2">
          Starter: layers and stations only
        </p>
      </header>
      <div ref={el} className="min-h-0 flex-1" />
    </div>
  )
}
