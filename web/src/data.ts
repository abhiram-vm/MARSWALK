// Loads the site data built by pipeline/build_app_data.py. AI-assisted (Claude Code).
import siteJson from './data/site.json'
import siteTerrainUrl from './data/site_terrain.png'
import siteImageUrl from './data/site_hirise.jpg'
import ctxTerrainUrl from './data/context_terrain.png'
import ctxImageUrl from './data/context_ctx.jpg'
import themisUrl from './data/context_themis.png'
import siteAoUrl from './data/site_ao.png'
import ctxAoUrl from './data/context_ao.png'
import outerTerrainUrl from './data/outer_terrain.png'
import outerAoUrl from './data/outer_ao.png'
import outerImageUrl from './data/outer_ctx.jpg'
import type { Grid, SpaceWeather, SunModel } from './model'

export interface Photo { sol: number; camera: string; date: string; url: string; src: string }
/** A place Curiosity stopped to work, from its waypoints and raw-image record (pipeline/find_stops.py). */
export interface Station {
  id: string; rmc: string; name: string
  kind: 'drill' | 'named' | 'stop'
  note: string | null; source: string | null
  sols: [number, number]; visits: [number, number][]; stay: number; mahli: number; chemcam: number
  xy: [number, number]; photo: Photo | null
}
export interface Conditions {
  sol: string; terrestrial_date: string; ls: string; min_temp: string; max_temp: string; min_gts_temp: string; max_gts_temp: string
  pressure: string; atmo_opacity: string; local_uv_irradiance_index: string; sunrise: string; sunset: string
}
export interface SiteData {
  grid: Grid
  zmid: number
  bounds: { west: number; east: number; south: number; north: number }
  ctx: { n: number; cell: number; h: Float32Array; ao: Float32Array }
  /** 30 km ring at 64 m, context only */
  outer: { n: number; cell: number; h: Float32Array; ao: Float32Array }
  /** sky visibility of the site at 4 m (half the routing grid in each direction) */
  siteAo: { cols: number; rows: number; v: Float32Array }
  stations: Station[]
  track: [number, number][]
  conditions: Conditions
  sun: SunModel & { date: string }
  spaceWeather: SpaceWeather & { source: string }
  images: { site: HTMLImageElement; ctx: HTMLImageElement; themis: HTMLImageElement; outer: HTMLImageElement }
}

// every stop's Navcam photo, inlined by the build
const PHOTO_SRC = import.meta.glob('./data/photos/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function image(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('Could not load ' + src.slice(0, 40)))
    im.src = src
  })
}
function pixels(im: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = im.naturalWidth; c.height = im.naturalHeight
  const x = c.getContext('2d', { willReadFrequently: true })!
  x.drawImage(im, 0, 0)
  return x.getImageData(0, 0, c.width, c.height).data
}

export async function loadSite(progress: (f: number) => void): Promise<SiteData> {
  const srcs = [siteTerrainUrl, ctxTerrainUrl, siteImageUrl, ctxImageUrl, themisUrl, siteAoUrl, ctxAoUrl, outerTerrainUrl, outerAoUrl, outerImageUrl]
  let done = 0
  const ims = await Promise.all(srcs.map((s) => image(s).then((im) => { progress(++done / srcs.length); return im })))
  const [terr, ctxTerr, site, ctx, themis, siteAo, ctxAo, outerTerr, outerAo, outerIm] = ims
  const grey = (im: HTMLImageElement) => { const p = pixels(im), v = new Float32Array(p.length / 4); for (let i = 0; i < v.length; i++) v[i] = p[i * 4] / 255; return v }
  const s = siteJson.site, cols = s.cols, rows = s.rows, n = cols * rows
  const px = pixels(terr), elev = new Float32Array(n), slope = new Float32Array(n)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < n; i++) {
    const z = s.zmin + ((px[i * 4] << 8) | px[i * 4 + 1]) / s.per_m
    elev[i] = z; slope[i] = px[i * 4 + 2] / 4
    if (z < lo) lo = z
    if (z > hi) hi = z
  }
  const c = siteJson.context, cp = pixels(ctxTerr), h = new Float32Array(c.n * c.n)
  for (let i = 0; i < c.n * c.n; i++) h[i] = c.zmin + ((cp[i * 4] << 8) | cp[i * 4 + 1]) / c.per_m
  const o = siteJson.outer, op = pixels(outerTerr), oh = new Float32Array(o.n * o.n)
  for (let i = 0; i < o.n * o.n; i++) oh[i] = o.zmin + ((op[i * 4] << 8) | op[i * 4 + 1]) / o.per_m
  type RawStation = Omit<Station, 'photo'> & { photo: Omit<Photo, 'src'> | null }
  const stations = (siteJson.stations as unknown as RawStation[]).map((st) => ({
    ...st, photo: st.photo ? { ...st.photo, src: PHOTO_SRC[`./data/photos/${st.id}.jpg`] } : null,
  })) as Station[]
  return {
    grid: { cols, rows, cell: s.cell, elev, slope },
    zmid: (lo + hi) / 2,
    bounds: { west: s.west, east: s.east, south: s.south, north: s.north },
    ctx: { n: c.n, cell: c.cell, h, ao: grey(ctxAo) },
    outer: { n: o.n, cell: o.cell, h: oh, ao: grey(outerAo) },
    siteAo: { cols: siteAo.naturalWidth, rows: siteAo.naturalHeight, v: grey(siteAo) },
    stations,
    track: siteJson.track as [number, number][],
    conditions: siteJson.conditions as Conditions,
    sun: siteJson.sun,
    spaceWeather: siteJson.spaceWeather as SiteData['spaceWeather'],
    images: { site, ctx, themis, outer: outerIm },
  }
}
