// The 3D view. AI-assisted (Claude Code).
// One renderer, drawn only when something changes. Site terrain at 4 m mesh
// spacing over the 2 m grid; an 8 km context ring at 32 m around it.
import * as THREE from 'three'
import type { SiteData } from './data'
import type { Route } from './model'
import { sunAt, type SunModel } from './model'

export type Mode = 'orbit' | 'walk'
export interface Pose { target: THREE.Vector3; dist: number; yaw: number; pitch: number }
export interface CineFrame { dist: number; frac: number; heading: number; pos: THREE.Vector3; holding: boolean }

const SITE_STEP = 2
const CTX_STEP = 2
const ORANGE = 0xf2662f
const WHITE = 0xf4f1ec
export const PARTNER = 0x5fb4ff // astronaut B in pair mode

export class World {
  readonly canvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.5, 40000)
  mode: Mode = 'orbit'
  exag = 1
  onRender: () => void = () => {}
  onCine: (f: CineFrame) => void = () => {}
  onCineEnd: () => void = () => {}
  onUserMove: () => void = () => {}
  onContextLost: () => void = () => {}
  onStopReached: (i: number) => void = () => {}
  onHover: (cellX: number, cellY: number, clientX: number, clientY: number, inside: boolean) => void = () => {}
  onHoverEnd: () => void = () => {}
  /** Returns the index of a draggable point under the cursor, or -1. */
  dragTest: (clientX: number, clientY: number) => number = () => -1
  onDrag: (i: number, cellX: number, cellY: number, done: boolean) => void = () => {}
  pixelRatio = 1
  private maxRatio = 1
  private d: SiteData
  private zmid: number
  private world = new THREE.Group()
  private sun = new THREE.DirectionalLight(0xfff0dc, 2.6)
  private hemi = new THREE.HemisphereLight(0xd9b391, 0x3a271c, 0.95)
  private sky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private site!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private ctx!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private slopeLayer!: THREE.Mesh
  private slopeTex!: THREE.CanvasTexture
  private thermalLayers: THREE.Mesh[] = []
  private track!: THREE.Line
  private boundary!: THREE.Line
  // one ribbon per route profile and walker, keyed 'direct-0', 'cautious-1' and so on
  private ribbons = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>()
  private paths = new Map<string, { x: number; z: number; h: number; s: number }[]>()
  private partner!: THREE.Group
  private beacons: THREE.Group[] = [] // 0 is the start, then one per stop
  private orbit: Pose = { target: new THREE.Vector3(), dist: 5200, yaw: 0.4, pitch: 1.15 }
  private vel = { yaw: 0, pitch: 0 }
  private tween: { t0: number; ms: number; a: Pose; b: Pose } | null = null
  private cine: {
    key: string; s: number; rate: number; base: number; paused: boolean; hold: number; last: number
    endDist: number; stops: number[]; nextStop: number; clockAt: (dist: number) => number
    pos: THREE.Vector3 | null; look: THREE.Vector3 | null; lookYaw: number; lookPitch: number; lookHold: number
  } | null = null
  private reveal: { t0: number; ms: number } | null = null
  private raf = 0
  private frames: number[] = []
  private lastT = 0
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  private sunModel: SunModel
  private departMin = 540

  constructor(canvas: HTMLCanvasElement, d: SiteData) {
    this.canvas = canvas
    this.d = d
    this.zmid = d.zmid
    this.sunModel = d.sun
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.maxRatio = Math.min(2, devicePixelRatio || 1)
    this.pixelRatio = Math.min(1.5, this.maxRatio)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene.fog = new THREE.FogExp2(0xc69c7c, 0.00016)
    this.scene.add(this.world, this.hemi, this.sun, this.sun.target)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 1.4
    this.buildSky()
    this.buildSite()
    this.buildContext()
    this.buildOverlays()
    this.partner = this.figure(PARTNER)
    this.bindInput()
    // If the GPU resets, three.js cannot rebuild this scene by itself; tell the page.
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost() })
    addEventListener('resize', () => this.resize())
    this.resize()
  }

  // ---------- coordinates ----------
  wx(c: number) { return (c + 0.5 - this.d.grid.cols / 2) * this.d.grid.cell }
  wz(r: number) { return (r + 0.5 - this.d.grid.rows / 2) * this.d.grid.cell }
  gc(x: number) { return x / this.d.grid.cell + this.d.grid.cols / 2 - 0.5 }
  gr(z: number) { return z / this.d.grid.cell + this.d.grid.rows / 2 - 0.5 }
  inSite(x: number, z: number) { const c = this.gc(x), r = this.gr(z); return c >= 0 && r >= 0 && c <= this.d.grid.cols - 1 && r <= this.d.grid.rows - 1 }
  private siteH(c: number, r: number) {
    const { cols, rows, elev } = this.d.grid
    c = Math.max(0, Math.min(cols - 1.001, c)); r = Math.max(0, Math.min(rows - 1.001, r))
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * cols + c0
    return (elev[i] * (1 - fc) + elev[i + 1] * fc) * (1 - fr) + (elev[i + cols] * (1 - fc) + elev[i + cols + 1] * fc) * fr - this.zmid
  }
  private ctxH(x: number, z: number) {
    const { n, cell, h } = this.d.ctx
    const c = Math.max(0, Math.min(n - 1.001, x / cell + n / 2 - 0.5)), r = Math.max(0, Math.min(n - 1.001, z / cell + n / 2 - 0.5))
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * n + c0
    return (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + n] * (1 - fc) + h[i + n + 1] * fc) * fr - this.zmid
  }
  /** Height in metres relative to the site's mid elevation, true scale. */
  height(x: number, z: number) { return this.inSite(x, z) ? this.siteH(this.gc(x), this.gr(z)) : this.ctxH(x, z) }
  ground(x: number, z: number) { return this.height(x, z) * this.exag }
  cellToWorld(p: { x: number; y: number }, lift = 0) { const x = this.wx(p.x), z = this.wz(p.y); return new THREE.Vector3(x, (this.height(x, z) + lift) * this.exag, z) }

  // ---------- building ----------
  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x5f4436) }, horizon: { value: new THREE.Color(0xc69c7c) }, low: { value: new THREE.Color(0x6d4c3a) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, dusk: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top, horizon, low, sunDir; uniform float dusk; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(horizon, low, clamp(-h * 5.0, 0.0, 1.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          // Mars sunsets are blue near the sun: dust scatters blue light forward.
          vec3 halo = mix(vec3(1.0, 0.93, 0.82), vec3(0.42, 0.58, 0.82), dusk);
          c += halo * (pow(s, 1800.0) * 6.0 + pow(s, 60.0) * 0.35 * (1.0 + dusk) + pow(s, 7.0) * 0.12);
          c *= mix(1.0, 0.45, dusk * (1.0 - s * 0.6));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), mat)
    this.sky.renderOrder = -1
    this.scene.add(this.sky)
  }

  private gridMesh(nx: number, nz: number, pos: (i: number, j: number) => [number, number, number], uv: (i: number, j: number) => [number, number]) {
    const p = new Float32Array(nx * nz * 3), u = new Float32Array(nx * nz * 2), ind = new Uint32Array((nx - 1) * (nz - 1) * 6)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i, q = pos(i, j), w = uv(i, j)
      p[v * 3] = q[0]; p[v * 3 + 1] = q[1]; p[v * 3 + 2] = q[2]; u[v * 2] = w[0]; u[v * 2 + 1] = w[1]
    }
    let k = 0
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1
      ind[k++] = a; ind[k++] = c; ind[k++] = b; ind[k++] = b; ind[k++] = c; ind[k++] = e
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(u, 2))
    g.setIndex(new THREE.BufferAttribute(ind, 1))
    g.computeVertexNormals()
    return g
  }

  // Ambient occlusion from the terrain itself: how much of the sky each point sees.
  private bakeAO(g: THREE.BufferGeometry, radii: number[]) {
    const p = g.attributes.position.array as Float32Array, n = p.length / 3, col = new Float32Array(n * 3)
    const dirs = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)])
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]
      let occ = 0
      for (const [dx, dz] of dirs) {
        let m = 0
        for (const r of radii) { const s = (this.height(x + dx * r, z + dz * r) - y) / r; if (s > m) m = s }
        occ += m / Math.sqrt(1 + m * m)
      }
      const ao = Math.max(0.35, 1 - (occ / 8) * 1.25)
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = ao
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }

  private texture(im: HTMLImageElement) {
    const t = new THREE.Texture(im)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    t.needsUpdate = true
    return t
  }

  private buildSite() {
    const { cols, rows, elev } = this.d.grid
    const nx = Math.floor((cols - 1) / SITE_STEP) + 1, nz = Math.floor((rows - 1) / SITE_STEP) + 1
    const g = this.gridMesh(nx, nz,
      (i, j) => { const c = i * SITE_STEP, r = j * SITE_STEP; return [this.wx(c), elev[r * cols + c] - this.zmid, this.wz(r)] },
      (i, j) => [(i * SITE_STEP + 0.5) / cols, 1 - (j * SITE_STEP + 0.5) / rows])
    this.bakeAO(g, [6, 12, 24, 48, 96, 160])
    this.site = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.texture(this.d.images.site), vertexColors: true, color: 0xd6a07a, roughness: 0.97, metalness: 0 }))
    this.site.castShadow = this.site.receiveShadow = true
    this.world.add(this.site)
    // skirt so the site's edge never shows a gap against the coarser surroundings
    const edge: THREE.Vector3[] = []
    const ring = (c: number, r: number) => edge.push(new THREE.Vector3(this.wx(c), elev[r * cols + c] - this.zmid, this.wz(r)))
    for (let c = 0; c < cols; c += SITE_STEP) ring(c, 0)
    for (let r = 0; r < rows; r += SITE_STEP) ring(cols - 1, r)
    for (let c = cols - 1; c >= 0; c -= SITE_STEP) ring(c, rows - 1)
    for (let r = rows - 1; r >= 0; r -= SITE_STEP) ring(0, r)
    const sp: number[] = []
    for (let k = 0; k < edge.length; k++) {
      const a = edge[k], b = edge[(k + 1) % edge.length]
      sp.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, a.y - 14, a.z, b.x, b.y, b.z, b.x, b.y - 14, b.z, a.x, a.y - 14, a.z)
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.computeVertexNormals()
    this.world.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 1, side: THREE.DoubleSide })))
    const bl = edge.map((v) => new THREE.Vector3(v.x, v.y + 1.5, v.z)); bl.push(bl[0].clone())
    this.boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bl), new THREE.LineDashedMaterial({ color: 0xf4f1ec, dashSize: 14, gapSize: 10, transparent: true, opacity: 0.55, fog: false }))
    this.boundary.computeLineDistances()
    this.world.add(this.boundary)
    const tp = this.d.track.map(([c, r]) => new THREE.Vector3(this.wx(c), this.siteH(c, r) + 1.2, this.wz(r)))
    this.track = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tp), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }))
    this.track.visible = false
    this.world.add(this.track)
  }

  private buildContext() {
    const { n, cell } = this.d.ctx, m = Math.floor((n - 1) / CTX_STEP) + 1
    const hx = (this.d.grid.cols * this.d.grid.cell) / 2 - 12, hz = (this.d.grid.rows * this.d.grid.cell) / 2 - 12
    const g = this.gridMesh(m, m,
      (i, j) => {
        const x = (i * CTX_STEP + 0.5 - n / 2) * cell, z = (j * CTX_STEP + 0.5 - n / 2) * cell
        const y = this.ctxH(x, z) - (Math.abs(x) < hx && Math.abs(z) < hz ? 8 : 0)
        return [x, y, z]
      },
      (i, j) => [(i * CTX_STEP + 0.5) / n, 1 - (j * CTX_STEP + 0.5) / n])
    this.bakeAO(g, [48, 96, 192, 384, 700])
    this.ctx = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.texture(this.d.images.ctx), vertexColors: true, color: 0xd6a07a, roughness: 1, metalness: 0 }))
    this.ctx.receiveShadow = true
    this.world.add(this.ctx)
  }

  private buildOverlays() {
    // slope bands on the site
    const c = document.createElement('canvas')
    c.width = this.d.grid.cols; c.height = this.d.grid.rows
    this.slopeTex = new THREE.CanvasTexture(c)
    this.slopeTex.colorSpace = THREE.SRGBColorSpace
    this.slopeLayer = new THREE.Mesh(this.site.geometry, new THREE.MeshBasicMaterial({ map: this.slopeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }))
    this.slopeLayer.visible = false
    this.slopeLayer.renderOrder = 1
    this.world.add(this.slopeLayer)
    this.paintSlope(20)
    // THEMIS night infrared over the whole 8 km area, as a colour ramp
    const t = this.d.images.themis, tc = document.createElement('canvas')
    tc.width = t.naturalWidth; tc.height = t.naturalHeight
    const tx = tc.getContext('2d', { willReadFrequently: true })!
    tx.drawImage(t, 0, 0)
    const im = tx.getImageData(0, 0, tc.width, tc.height), px = im.data
    // stretch between the 2nd and 98th percentiles so the pattern reads
    const vals: number[] = []
    for (let i = 0; i < px.length; i += 4) vals.push(px[i])
    vals.sort((a, b) => a - b)
    const lo = vals[Math.floor(vals.length * 0.02)], hi = vals[Math.floor(vals.length * 0.98)]
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(1, (px[i] - lo) / Math.max(1, hi - lo))), [r, g, b] = ramp(v)
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 140
    }
    tx.putImageData(im, 0, 0)
    const tt = new THREE.CanvasTexture(tc)
    tt.colorSpace = THREE.SRGBColorSpace
    const half = (this.d.ctx.n * this.d.ctx.cell) / 2
    for (const mesh of [this.site, this.ctx]) {
      const geo = mesh.geometry.clone(), pos = geo.attributes.position.array as Float32Array, uv = geo.attributes.uv.array as Float32Array
      for (let v = 0; v < pos.length / 3; v++) { uv[v * 2] = (pos[v * 3] + half) / (2 * half); uv[v * 2 + 1] = 1 - (pos[v * 3 + 2] + half) / (2 * half) }
      geo.deleteAttribute('color')
      const layer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false }))
      layer.visible = false; layer.renderOrder = 1
      this.world.add(layer); this.thermalLayers.push(layer)
    }
  }

  paintSlope(limit: number) {
    const { cols, rows, slope } = this.d.grid, c = this.slopeTex.image as HTMLCanvasElement, x = c.getContext('2d')!
    const im = x.createImageData(cols, rows), d = im.data
    for (let i = 0; i < cols * rows; i++) {
      const s = slope[i], o = i * 4
      if (s > limit) { const st = ((i % cols) + ((i / cols) | 0)) % 6 < 2; d[o] = 26; d[o + 1] = 18; d[o + 2] = 14; d[o + 3] = st ? 215 : 80 }
      else if (s > 15) { d[o] = 240; d[o + 1] = 140; d[o + 2] = 32; d[o + 3] = 160 }
      else if (s > 10) { d[o] = 246; d[o + 1] = 214; d[o + 2] = 100; d[o + 3] = 115 }
    }
    x.putImageData(im, 0, 0)
    this.slopeTex.needsUpdate = true
    this.invalidate()
  }

  private beacon(color: number, tall: number) {
    const g = new THREE.Group()
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, tall, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, fog: false, toneMapped: false }))
    beam.position.y = tall / 2
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.4, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.7
    g.add(beam, ring); g.renderOrder = 4
    this.world.add(g)
    return g
  }

  /** Beacons for the start (white) and each stop; colours give the walker each stop belongs to. */
  setPoints(points: { x: number; y: number }[], colors?: number[]) {
    while (this.beacons.length < points.length) this.beacons.push(this.beacon(this.beacons.length ? ORANGE : WHITE, this.beacons.length ? 60 : 44))
    this.beacons.forEach((b, i) => {
      b.visible = b.userData.on = i < points.length
      if (!b.visible) return
      const x = this.wx(points[i].x), z = this.wz(points[i].y)
      b.position.set(x, this.height(x, z), z)
      b.scale.y = i && i === points.length - 1 ? 1.3 : 1
      const col = i === 0 ? WHITE : colors?.[i] ?? ORANGE
      b.children.forEach((m) => ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(col))
    })
    this.invalidate()
  }
  /** A simple astronaut-sized figure (2 m tall) for the partner in walk mode. */
  private figure(color: number) {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 })
    mat.userData.suit = true
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 10), mat); body.position.y = 0.85
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.3 })); head.position.y = 1.72
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), mat); pack.position.set(0, 1.05, -0.3)
    g.add(body, head, pack)
    g.traverse((o) => { o.castShadow = true })
    g.visible = false
    this.world.add(g)
    return g
  }
  /** Shows the partner at a grid position, facing a heading in degrees; null hides it. */
  setPartner(p: { x: number; y: number } | null, heading = 0, color = PARTNER) {
    this.partner.visible = !!p
    this.partner.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m?.userData.suit) { m.color.set(color); m.emissive.set(color) }
    })
    if (p) {
      const x = this.wx(p.x), z = this.wz(p.y)
      this.partner.position.set(x, this.height(x, z), z)
      this.partner.rotation.y = -(heading * Math.PI) / 180 + Math.PI
    }
  }

  // ---------- routes ----------
  /** routes[kind][walker]; walker 0 is the solo walker or astronaut A, walker 1 is B. */
  setRoutes(routes: Record<Route['kind'], (Route | null)[]>, sel: Route['kind'], animate: boolean) {
    for (const [, m] of this.ribbons) { this.world.remove(m); m.geometry.dispose(); m.material.dispose() }
    this.ribbons.clear(); this.paths.clear()
    for (const k of ['direct', 'cautious'] as const) routes[k].forEach((r, w) => {
      if (!r) return
      const key = `${k}-${w}`, sp = this.track3d(r)
      this.paths.set(key, sp)
      const m = this.ribbon(sp, w ? PARTNER : k === 'direct' || routes[k].length > 1 ? ORANGE : WHITE, k === 'cautious')
      this.ribbons.set(key, m); this.world.add(m)
    })
    this.pair = routes.direct.length > 1
    this.styleRibbons(sel)
    if (animate && !this.reduce) { this.reveal = { t0: performance.now(), ms: 1100 }; this.setReveal(0) }
    this.invalidate()
  }
  private pair = false
  private sel: Route['kind'] = 'direct'
  styleRibbons(sel: Route['kind']) {
    this.sel = sel
    for (const [key, m] of this.ribbons) {
      const k = key.split('-')[0], on = k === sel, walk = this.mode === 'walk', u = m.material.uniforms
      u.width.value = walk ? (on ? 0.55 : 0.45) : on ? 8 : 5
      u.lift.value = walk ? 0.08 : 1.6
      u.dash.value = walk ? 2.5 : 13
      u.chevron.value = on ? 1 : 0
      u.spacing.value = walk ? 5 : 26
      u.nearFade.value = walk ? 1 : 0
      if (!walk) { u.clipA.value = -1; u.reveal.value = 1e9 }
      // in pair mode only the chosen profile is drawn, or four lines would overlap
      // while walking, your own path is clear and your partner's is faint
      const mine = !this.cine || key === this.cine.key
      u.opacity.value = on ? (walk ? (mine ? 0.9 : 0.4) : 1) : walk || this.pair ? 0 : 0.55
      m.renderOrder = on ? 3 : 2
    }
    this.invalidate()
  }
  private setReveal(k: number) {
    for (const [key, m] of this.ribbons) { const sp = this.paths.get(key)!; m.material.uniforms.reveal.value = k >= 1 ? 1e9 : k * sp[sp.length - 1].s }
  }
  // The route is already straightened and sampled every metre by the model; keep every
  // second sample, and use the model's distances so the 3D view and the numbers agree.
  private track3d(r: Route) {
    const out: { x: number; z: number; h: number; s: number }[] = []
    for (let i = 0; i < r.xs.length; i += 2) out.push({ x: this.wx(r.xs[i]), z: this.wz(r.ys[i]), h: r.z[i] - this.zmid, s: r.d[i] })
    const L = r.xs.length - 1
    if (L % 2) out.push({ x: this.wx(r.xs[L]), z: this.wz(r.ys[L]), h: r.z[L] - this.zmid, s: r.d[L] })
    return out
  }
  private sample(sp: { x: number; z: number; s: number }[], s: number) {
    let lo = 0, hi = sp.length - 1
    s = Math.max(0, Math.min(sp[hi].s, s))
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sp[m].s < s) lo = m; else hi = m }
    const a = sp[lo], b = sp[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }
  }
  private ribbon(sp: { x: number; z: number; h: number; s: number }[], color: number, dashed: boolean) {
    const n = sp.length, pos = new Float32Array(n * 6), side = new Float32Array(n * 6), along = new Float32Array(n * 2), edge = new Float32Array(n * 2), ind: number[] = []
    for (let i = 0; i < n; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1
      const sx = -tz / l, sz = tx / l, dh = this.height(sp[i].x + sx, sp[i].z + sz) - this.height(sp[i].x - sx, sp[i].z - sz)
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e
        pos[v * 3] = sp[i].x; pos[v * 3 + 1] = sp[i].h; pos[v * 3 + 2] = sp[i].z
        side[v * 3] = sx; side[v * 3 + 1] = dh / 2; side[v * 3 + 2] = sz
        along[v] = sp[i].s; edge[v] = e ? 1 : -1
      }
      if (i < n - 1) ind.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('side', new THREE.BufferAttribute(side, 3))
    g.setAttribute('along', new THREE.BufferAttribute(along, 1))
    g.setAttribute('edge', new THREE.BufferAttribute(edge, 1))
    g.setIndex(ind)
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: {
        color: { value: new THREE.Color(color) }, width: { value: 8 }, lift: { value: 1.6 }, reveal: { value: 1e9 }, clipA: { value: -1 },
        dashed: { value: dashed ? 1 : 0 }, dash: { value: 13 }, opacity: { value: 1 }, chevron: { value: 0 }, spacing: { value: 26 }, nearFade: { value: 0 },
      },
      vertexShader: `attribute vec3 side; attribute float along; attribute float edge; uniform float width, lift; varying float vA; varying float vE; varying float vD;
        void main(){ vec3 p = position + side * edge * width * 0.5; p.y += lift; vA = along; vE = edge;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float reveal, clipA, dashed, dash, opacity, chevron, spacing, nearFade; varying float vA; varying float vE; varying float vD;
        void main(){
          if (vA > reveal || vA < clipA) discard;
          if (dashed > 0.5 && mod(vA, dash * 2.0) > dash) discard;
          float e = abs(vE);
          vec3 c = e > 0.7 ? vec3(0.04, 0.035, 0.03) : color;
          // chevrons point along the direction of travel
          if (chevron > 0.5 && e <= 0.7) { float v = fract(vA / spacing + e * 0.32); if (v < 0.14) c = mix(c, vec3(1.0), 0.55); }
          // at eye level the path fades out just in front of the walker, so it guides without covering the ground
          float a = opacity * mix(1.0, smoothstep(5.0, 30.0, vD), nearFade);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    }))
    m.frustumCulled = false
    return m
  }

  // ---------- layers and settings ----------
  setLayer(name: 'slope' | 'thermal' | 'track' | 'boundary', on: boolean) {
    if (name === 'slope') this.slopeLayer.visible = on
    if (name === 'thermal') this.thermalLayers.forEach((l) => (l.visible = on))
    if (name === 'track') this.track.visible = on
    if (name === 'boundary') this.boundary.visible = on
    this.invalidate()
  }
  setTint(on: boolean) { for (const m of [this.site, this.ctx]) m.material.color.set(on ? 0xd6a07a : 0xffffff); this.invalidate() }
  setExag(k: number) {
    this.exag = k
    this.world.scale.y = k
    this.orbit.target.y = this.ground(this.orbit.target.x, this.orbit.target.z)
    this.invalidate()
  }
  setDepart(min: number) { this.departMin = min; if (!this.cine) this.applySun(min); this.invalidate() }
  private applySun(minutes: number, focus?: THREE.Vector3, radius = 950) {
    const s = sunAt(minutes, this.sunModel)
    const el = Math.max(1.2, s.el) * (Math.PI / 180)
    const dir = new THREE.Vector3(s.e, Math.max(Math.sin(el), s.u), -s.n).normalize()
    const f = focus ?? new THREE.Vector3()
    this.sun.position.copy(f).addScaledVector(dir, 4000)
    this.sun.target.position.copy(f)
    const cam = this.sun.shadow.camera
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius; cam.near = 1000; cam.far = 7600
    cam.updateProjectionMatrix()
    const day = THREE.MathUtils.clamp((s.el - 1) / 25, 0, 1), dusk = 1 - THREE.MathUtils.clamp((s.el + 2) / 16, 0, 1)
    this.sun.intensity = 0.5 + 2.4 * day
    this.sun.color.setHSL(0.075, 0.6 - 0.35 * day, 0.72 + 0.14 * day)
    this.hemi.intensity = 0.45 + 0.55 * day
    const u = this.sky.material.uniforms
    u.sunDir.value.set(s.e, s.u, -s.n)
    u.dusk.value = dusk
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.set(0xc69c7c).multiplyScalar(1 - 0.5 * dusk)
    ;(u.horizon.value as THREE.Color).copy(fog.color)
  }

  // ---------- camera ----------
  pose(): Pose { return { target: this.orbit.target.clone(), dist: this.orbit.dist, yaw: this.orbit.yaw, pitch: this.orbit.pitch } }
  setPose(p: Pose) { this.orbit = { target: p.target.clone(), dist: p.dist, yaw: p.yaw, pitch: p.pitch }; this.invalidate() }
  frame(points: THREE.Vector3[], panelPx = 0, sheetPx = 0): Pose {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z) }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max(180, Math.hypot(x1 - x0, z1 - z0))
    // look across the route rather than along it, so its shape reads
    let yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2
    if (Math.cos(yaw) < -0.2) yaw += Math.PI
    const dist = span * (this.camera.aspect < 1 ? 2.5 : 1.6)
    const t = new THREE.Vector3(cx, this.ground(cx, cz), cz)
    // shift the aim so the route sits in the part of the screen the panel leaves free
    const w = this.canvas.clientWidth || 1, shift = (panelPx / 2 / w) * dist * 0.9
    t.addScaledVector(new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)), shift)
    // a bottom sheet covers the lower screen: move the aim toward the camera so the route sits higher
    const h = this.canvas.clientHeight || 1, lift = (sheetPx / 2 / h) * dist * 1.5
    t.addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), lift)
    t.y = this.ground(t.x, t.z)
    return { target: t, dist: dist * (sheetPx ? 1.25 : 1), yaw, pitch: sheetPx ? 0.75 : 0.6 }
  }
  flyTo(to: Pose, ms: number) {
    this.vel.yaw = this.vel.pitch = 0
    if (this.reduce || !ms) { this.setPose(to); this.tween = null; return }
    const dy = Math.atan2(Math.sin(to.yaw - this.orbit.yaw), Math.cos(to.yaw - this.orbit.yaw))
    this.tween = { t0: performance.now(), ms, a: this.pose(), b: { ...to, target: to.target.clone(), yaw: this.orbit.yaw + dy } }
    this.invalidate()
  }
  private applyOrbit() {
    const o = this.orbit, cp = Math.cos(o.pitch)
    this.camera.position.set(o.target.x + o.dist * cp * Math.sin(o.yaw), o.target.y + o.dist * Math.sin(o.pitch), o.target.z + o.dist * cp * Math.cos(o.yaw))
    const g = this.ground(this.camera.position.x, this.camera.position.z) + 15
    if (this.camera.position.y < g) this.camera.position.y = g
    this.camera.lookAt(o.target)
  }
  zoom(k: number) { this.orbit.dist = clamp(this.orbit.dist * k, 50, 9000); this.invalidate() }
  faceNorth() { this.flyTo({ ...this.pose(), yaw: 0 }, 700) }

  // ---------- picking ----------
  pick(clientX: number, clientY: number): THREE.Vector3 | null {
    const b = this.canvas.getBoundingClientRect(), ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1), this.camera)
    const o = ray.ray.origin, d = ray.ray.direction, half = (this.d.ctx.n * this.d.ctx.cell) / 2
    let t = 0, step = 2
    for (let i = 0; i < 6000; i++) {
      t += step
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t
      if (Math.abs(x) > half || Math.abs(z) > half) { if (t > 30000) break; continue }
      if (y <= this.ground(x, z)) {
        let lo = t - step, hi = t
        for (let j = 0; j < 14; j++) { const m = (lo + hi) / 2; if (o.y + d.y * m <= this.ground(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m }
        return new THREE.Vector3(o.x + d.x * hi, 0, o.z + d.z * hi)
      }
      step = Math.min(12, 2 + t / 400)
    }
    return null
  }
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera)
    return { x: ((p.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - p.y) / 2) * this.canvas.clientHeight, on: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 }
  }
  cameraInfo() {
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    return { x: this.gc(this.camera.position.x), y: this.gr(this.camera.position.z), heading: (Math.atan2(dir.x, -dir.z) * 180) / Math.PI }
  }

  // ---------- input ----------
  onPick: (cellX: number, cellY: number, inside: boolean) => void = () => {}
  private bindInput() {
    const ptr = new Map<number, { x: number; y: number }>()
    let moved = 0, pinch = 0, button = 0, lastMove = 0
    const c = this.canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault())
    let dragIdx = -1, hoverT = 0
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = 0; pinch = 0; button = e.button; this.tween = null; this.vel.yaw = this.vel.pitch = 0
      dragIdx = this.mode === 'orbit' && e.button === 0 && ptr.size === 1 ? this.dragTest(e.clientX, e.clientY) : -1
      if (dragIdx >= 0) { c.classList.add('moving'); this.onHoverEnd() }
    })
    c.addEventListener('pointerleave', () => this.onHoverEnd())
    c.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId)
      if (!p) {
        // hover: what the ground under the cursor is like, about 25 times a second
        const now = performance.now()
        if (this.mode !== 'orbit' || e.pointerType === 'touch' || now - hoverT < 40) return
        hoverT = now
        const hit = this.pick(e.clientX, e.clientY)
        if (hit) this.onHover(this.gc(hit.x), this.gr(hit.z), e.clientX, e.clientY, this.inSite(hit.x, hit.z)); else this.onHoverEnd()
        return
      }
      if (dragIdx >= 0) {
        const hit = this.pick(e.clientX, e.clientY)
        if (hit && this.inSite(hit.x, hit.z)) this.onDrag(dragIdx, this.gc(hit.x), this.gr(hit.z), false)
        moved += 10
        return
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY
      if (moved < 5) return
      c.classList.add('dragging')
      if (this.cine) { this.cine.lookYaw -= dx * 0.004; this.cine.lookPitch = clamp(this.cine.lookPitch - dy * 0.003, -0.6, 0.5); this.cine.lookHold = performance.now(); this.invalidate(); return }
      if (this.mode !== 'orbit') return
      this.onUserMove()
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) this.orbit.dist = clamp((this.orbit.dist * pinch) / d, 50, 9000)
        pinch = d; this.pan(dx * 0.5, dy * 0.5)
      } else if (button === 2 || e.shiftKey) this.pan(dx, dy)
      else {
        this.vel.yaw = -dx * 0.005; this.vel.pitch = dy * 0.004
        this.orbit.yaw += this.vel.yaw; this.orbit.pitch = clamp(this.orbit.pitch + this.vel.pitch, 0.08, 1.48)
        lastMove = performance.now()
      }
      this.invalidate()
    })
    const up = (e: PointerEvent) => {
      const was = ptr.get(e.pointerId)
      ptr.delete(e.pointerId); c.classList.remove('dragging'); c.classList.remove('moving'); pinch = 0
      if (dragIdx >= 0) {
        const i = dragIdx; dragIdx = -1
        const hit = e.type === 'pointerup' ? this.pick(e.clientX, e.clientY) : null
        if (moved >= 5 && hit && this.inSite(hit.x, hit.z)) { this.onDrag(i, this.gc(hit.x), this.gr(hit.z), true); return }
        if (moved >= 5) { this.onDrag(i, -1, -1, true); return }
        if (e.type === 'pointerup') { this.onDrag(i, -2, -2, true); this.invalidate(); return } // a tap selects the point
      }
      if (performance.now() - lastMove > 80) this.vel.yaw = this.vel.pitch = 0
      if (was && moved < 5 && e.type === 'pointerup' && this.mode === 'orbit' && e.button === 0) {
        const hit = this.pick(e.clientX, e.clientY)
        if (hit) this.onPick(this.gc(hit.x), this.gr(hit.z), this.inSite(hit.x, hit.z))
        else this.onPick(-1, -1, false)
      }
      this.invalidate()
    }
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener('wheel', (e) => { e.preventDefault(); if (this.mode !== 'orbit') return; this.tween = null; this.onUserMove(); this.zoom(Math.exp(e.deltaY * 0.0012)) }, { passive: false })
    c.addEventListener('keydown', (e) => {
      if (this.cine) {
        const look: Record<string, [number, number]> = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }
        if (look[e.key]) { this.cine.lookYaw += look[e.key][0]; this.cine.lookPitch = clamp(this.cine.lookPitch + look[e.key][1], -0.6, 0.5); this.cine.lookHold = performance.now(); e.preventDefault(); this.invalidate() }
        return
      }
      if (this.mode !== 'orbit') return
      const k: Record<string, () => void> = {
        ArrowLeft: () => (this.orbit.yaw += 0.08), ArrowRight: () => (this.orbit.yaw -= 0.08),
        ArrowUp: () => (this.orbit.pitch = clamp(this.orbit.pitch + 0.05, 0.08, 1.48)), ArrowDown: () => (this.orbit.pitch = clamp(this.orbit.pitch - 0.05, 0.08, 1.48)),
        '+': () => this.zoom(1 / 1.25), '=': () => this.zoom(1 / 1.25), '-': () => this.zoom(1.25),
      }
      if (k[e.key]) { k[e.key](); e.preventDefault(); this.invalidate() }
    })
  }
  private pan(dx: number, dy: number) {
    const s = (this.orbit.dist / this.canvas.clientHeight) * 1.1, cy = Math.cos(this.orbit.yaw), sy = Math.sin(this.orbit.yaw), half = (this.d.ctx.n * this.d.ctx.cell) / 2 - 200
    this.orbit.target.x = clamp(this.orbit.target.x + (-dx * cy - dy * sy) * s, -half, half)
    this.orbit.target.z = clamp(this.orbit.target.z + (dx * sy - dy * cy) * s, -half, half)
    this.orbit.target.y = this.ground(this.orbit.target.x, this.orbit.target.z)
  }

  // ---------- walk at eye level ----------
  /**
   * Walks a route at eye height from the start to endDist metres, at speed metres of route
   * per second of playback. It holds for a moment at each distance in stops.
   * clockAt gives the Mars clock at a distance, for the sun.
   */
  startWalk(route: Route, walker: number, speed: number, endDist: number, stops: number[], clockAt: (dist: number) => number) {
    const key = `${route.kind}-${walker}`
    if (!this.paths.has(key)) return
    this.mode = 'walk'
    this.setExag(1)
    this.cine = { key, s: 0, rate: speed, base: speed, paused: false, hold: 0, last: 0, endDist, stops, nextStop: 0, clockAt, pos: null, look: null, lookYaw: 0, lookPitch: 0, lookHold: 0 }
    this.styleRibbons(route.kind)
    this.invalidate()
  }
  /** Pauses or resumes; returns true when paused. */
  pauseWalk(): boolean {
    const c = this.cine
    if (!c) return false
    c.paused = !c.paused; c.last = 0; c.hold = 0
    this.invalidate()
    return c.paused
  }
  setWalkSpeed(mult: number) { if (this.cine) { this.cine.rate = this.cine.base * mult; this.invalidate() } }
  /** Jumps to a distance along the walk. */
  seekWalk(dist: number) {
    const c = this.cine
    if (!c) return
    c.s = clamp(dist, 0, c.endDist); c.hold = 0; c.pos = null; c.look = null
    c.nextStop = c.stops.findIndex((d) => d > c.s + 0.5); if (c.nextStop < 0) c.nextStop = c.stops.length
    this.invalidate()
  }
  get walkPaused() { return !!this.cine?.paused }
  stopWalk(exag: number) {
    this.cine = null
    this.mode = 'orbit'
    this.partner.visible = false
    for (const b of this.beacons) b.visible = !!b.userData.on
    this.camera.fov = 48; this.camera.updateProjectionMatrix()
    this.setExag(exag)
    this.applySun(this.departMin)
    this.styleRibbons(this.sel)
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir)
    const t = this.camera.position.clone().addScaledVector(dir, 220)
    t.y = this.ground(t.x, t.z)
    const off = this.camera.position.clone().sub(t)
    this.orbit = { target: t, dist: Math.max(120, off.length()), yaw: Math.atan2(off.x, off.z), pitch: clamp(Math.asin(clamp(off.y / off.length(), -1, 1)), 0.08, 1.48) }
    this.invalidate()
  }
  private stepWalk(now: number) {
    const c = this.cine!, sp = this.paths.get(c.key)!
    const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0
    c.last = now
    if (!c.paused) {
      if (c.hold > 0) c.hold -= dt
      else {
        c.s = Math.min(c.endDist, c.s + c.rate * dt)
        const stop = c.stops[c.nextStop]
        if (stop !== undefined && c.s >= stop) { c.s = stop; c.hold = this.reduce ? 0.8 : 2.4; this.onStopReached(c.nextStop); c.nextStop++ }
      }
    }
    const s = c.s, here = this.sample(sp, s), ahead = this.sample(sp, s + 14)
    const u = this.ribbons.get(c.key)!.material.uniforms
    u.clipA.value = s + 1.5; u.reveal.value = c.endDist
    // eye height 1.8 m; the camera follows the terrain smoothly rather than every bump
    const pos = new THREE.Vector3(here.x, this.height(here.x, here.z) + 1.8, here.z)
    const look = new THREE.Vector3(ahead.x, this.height(ahead.x, ahead.z) + 1.3, ahead.z)
    if (now - c.lookHold > 1800) { c.lookYaw *= 0.95; c.lookPitch *= 0.95 }
    this.camera.fov = 64; this.camera.updateProjectionMatrix()
    const k = this.reduce || !c.pos ? 1 : 1 - Math.pow(0.0015, dt || 0.016)
    c.pos = c.pos ? c.pos.lerp(pos, k) : pos
    c.look = c.look ? c.look.lerp(look, k * 0.7) : look
    this.camera.position.copy(c.pos)
    this.camera.lookAt(c.look)
    // a beacon you are standing in only blocks the view: hide those within 25 m
    for (const b of this.beacons) b.visible = !!b.userData.on && Math.hypot(b.position.x - c.pos.x, b.position.z - c.pos.z) > 25
    if (c.lookYaw || c.lookPitch) { this.camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), c.lookYaw); this.camera.rotateX(c.lookPitch) }
    const fwd = this.sample(sp, s + 6)
    const heading = ((Math.atan2(fwd.x - here.x, -(fwd.z - here.z)) * 180) / Math.PI + 360) % 360
    this.applySun(c.clockAt(s), new THREE.Vector3(here.x, this.height(here.x, here.z), here.z), 240)
    this.onCine({ dist: s, frac: c.endDist ? s / c.endDist : 1, heading, pos: c.pos, holding: c.hold > 0 })
    if (s >= c.endDist && c.hold <= 0 && !c.paused) { c.paused = true; this.onCineEnd() }
  }

  // ---------- render loop: only when something changed ----------
  invalidate() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.loop(t)) }
  private loop(now: number) {
    this.raf = 0
    let active = false
    if (this.tween) {
      const tw = this.tween, k = Math.min(1, (now - tw.t0) / tw.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      this.orbit.target.lerpVectors(tw.a.target, tw.b.target, e)
      this.orbit.dist = tw.a.dist * Math.pow(tw.b.dist / tw.a.dist, e)
      this.orbit.yaw = tw.a.yaw + (tw.b.yaw - tw.a.yaw) * e
      this.orbit.pitch = tw.a.pitch + (tw.b.pitch - tw.a.pitch) * e
      if (k >= 1) this.tween = null
      active = true
    }
    if (this.mode === 'orbit' && !this.tween && (Math.abs(this.vel.yaw) > 1e-4 || Math.abs(this.vel.pitch) > 1e-4) && !this.reduce) {
      this.vel.yaw *= 0.9; this.vel.pitch *= 0.9
      this.orbit.yaw += this.vel.yaw; this.orbit.pitch = clamp(this.orbit.pitch + this.vel.pitch, 0.08, 1.48)
      active = true
    }
    if (this.cine) { this.stepWalk(now); active = active || (!!this.cine && (!this.cine.paused || Math.abs(this.cine.lookYaw) > 1e-3 || Math.abs(this.cine.lookPitch) > 1e-3)) }
    if (this.reveal) {
      const k = Math.min(1, (now - this.reveal.t0) / this.reveal.ms)
      this.setReveal(1 - Math.pow(1 - k, 2))
      if (k >= 1) this.reveal = null
      active = true
    }
    if (this.mode === 'orbit') this.applyOrbit()
    this.sky.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
    this.onRender()
    if (active) { this.adapt(now); this.raf = requestAnimationFrame((t) => this.loop(t)) } else this.lastT = 0
  }
  // Lower the render resolution when frames get slow, raise it when there is room.
  private adapt(now: number) {
    if (this.lastT) { this.frames.push(now - this.lastT); if (this.frames.length > 40) this.frames.shift() }
    this.lastT = now
    if (this.frames.length < 40) return
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length
    if (avg > 26 && this.pixelRatio > 0.6) { this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.2); this.applyRatio() }
    else if (avg < 13 && this.pixelRatio < this.maxRatio) { this.pixelRatio = Math.min(this.maxRatio, this.pixelRatio + 0.2); this.applyRatio() }
  }
  private applyRatio() { this.frames = []; this.renderer.setPixelRatio(this.pixelRatio); this.resize() }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
// Dark violet to pale yellow, perceptually ordered (an inferno-like ramp).
function ramp(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [[0, 20, 11, 52], [0.3, 120, 28, 109], [0.55, 207, 68, 70], [0.78, 249, 142, 9], [1, 252, 238, 160]]
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i], f = (t - a[0]) / (b[0] - a[0])
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]
  }
  return [252, 238, 160]
}
