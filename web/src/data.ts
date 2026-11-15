// Loads the site data built by pipeline/build_app_data.py. AI-assisted (Claude Code).
import siteJson from './data/site.json'
import siteTerrainUrl from './data/site_terrain.png'
import siteImageUrl from './data/site_hirise.jpg'
import ctxTerrainUrl from './data/context_terrain.png'
import ctxImageUrl from './data/context_ctx.jpg'
import themisUrl from './data/context_themis.png'
import photoS0 from './data/photo_S0.jpg'
import photoS1 from './data/photo_S1.jpg'
import photoS2 from './data/photo_S2.jpg'
import type { Grid } from './model'

export interface Station { id: string; name: string; note: string; sol: number; xy: [number, number] }
export interface Conditions {
  sol: string; terrestrial_date: string; ls: string; min_temp: string; max_temp: string; min_gts_temp: string; max_gts_temp: string
  pressure: string; atmo_opacity: string; local_uv_irradiance_index: string; sunrise: string; sunset: string
}
export interface Photo { sol: number; camera: string; date: string; url: string }
export interface SiteData {
  grid: Grid
  zmid: number
  bounds: { west: number; east: number; south: number; north: number }
  ctx: { n: number; cell: number; h: Float32Array }
  stations: Station[]
  track: [number, number][]
  conditions: Conditions
  photos: Record<string, Photo & { src: string }>
  images: { site: HTMLImageElement; ctx: HTMLImageElement; themis: HTMLImageElement }
}

const PHOTO_SRC: Record<string, string> = { S0: photoS0, S1: photoS1, S2: photoS2 }

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
  const srcs = [siteTerrainUrl, ctxTerrainUrl, siteImageUrl, ctxImageUrl, themisUrl]
  let done = 0
  const ims = await Promise.all(srcs.map((s) => image(s).then((im) => { progress(++done / srcs.length); return im })))
  const [terr, ctxTerr, site, ctx, themis] = ims
  const s = siteJson.site, cols = s.cols, rows = s.rows, n = cols * rows
  const px = pixels(terr), elev = new Float32Array(n), slope = new Float32Array(n)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < n; i++) {
    const z = s.zmin + ((px[i * 4] << 8) | px[i * 4 + 1]) / 100
    elev[i] = z; slope[i] = px[i * 4 + 2] / 4
    if (z < lo) lo = z
    if (z > hi) hi = z
  }
  const c = siteJson.context, cp = pixels(ctxTerr), h = new Float32Array(c.n * c.n)
  for (let i = 0; i < c.n * c.n; i++) h[i] = c.zmin + ((cp[i * 4] << 8) | cp[i * 4 + 1]) / c.per_m
  const photos: SiteData['photos'] = {}
  for (const [k, v] of Object.entries(siteJson.photos as Record<string, Photo>)) photos[k] = { ...v, src: PHOTO_SRC[k] }
  return {
    grid: { cols, rows, cell: s.cell, elev, slope },
    zmid: (lo + hi) / 2,
    bounds: { west: s.west, east: s.east, south: s.south, north: s.north },
    ctx: { n: c.n, cell: c.cell, h },
    stations: siteJson.stations as Station[],
    track: siteJson.track as [number, number][],
    conditions: siteJson.conditions as Conditions,
    photos,
    images: { site, ctx, themis },
  }
}
