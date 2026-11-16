// The story: a scroll-driven introduction that ends inside the planner. AI-assisted (Claude Code).
// One page, one renderer. Chapters 0 and 1 draw a globe of Mars; from chapter 2 the camera is
// over the same terrain the planner uses, so the hand-off at the end has no cut.
import * as THREE from 'three'
import { NAME } from './brand'
import globeUrl from './data/globe.jpg'
import type { SiteData, Station } from './data'
import type { Pose, World } from './world'

export interface StoryHost {
  world: World
  data: SiteData
  routePose(): Pose
  /** switch the plan shown behind the story: the default solo walk or the pair plan */
  showPlan(which: 'solo' | 'pair'): void
  /** one line about the current plan, for the route chapter */
  summary(): string
  exit(): void
}

const GALE = { lon: 137.4, lat: -5.4 }
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const band = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))

interface Chapter { id: string; rail: string; eyebrow?: string; title: string; body: string; credit?: string; extra?: string }

export function createStory(host: StoryHost) {
  const W = host.world, D = host.data
  const named = (id: string) => D.stations.find((s) => s.id === id)
  const photo = (s: Station | undefined) => (s?.photo ? `<figure><img src="${s.photo.src}" alt="${s.name}, seen by Curiosity" loading="lazy"><figcaption>${s.name}<span>sol ${s.photo.sol}</span></figcaption></figure>` : '')
  const nStops = D.stations.length
  const chapters: Chapter[] = [
    { id: 'mars', rail: 'Mars', title: `${NAME}`, body: 'The first people on Mars will not need a map of the planet. They will need a map of the next five hundred metres.' },
    { id: 'gale', rail: 'Gale', eyebrow: '01', title: 'Gale crater', body: 'A crater 154 km across, just south of the Martian equator. NASA\'s Curiosity rover landed here in August 2012 and has been climbing the mountain in its middle ever since.', credit: 'Viking colour mosaic, NASA and USGS, via NASA Mars Trek' },
    { id: 'sharp', rail: 'Mount Sharp', eyebrow: '02', title: 'Mount Sharp', body: 'A mountain of layered rock about 5 km high. Its layers record how Mars changed from wet to dry, and Curiosity reads them as it climbs.', credit: 'Terrain: USGS 1 m model from MRO HiRISE and CTX and Mars Express HRSC. Image: CTX, Mars Reconnaissance Orbiter' },
    { id: 'boxwork', rail: 'Boxwork', eyebrow: '03', title: 'The boxwork', body: 'On the mountain\'s flank, low ridges cross like a honeycomb with hollows between them. Groundwater once ran through cracks here and left minerals behind. The ridges resisted erosion and the hollows did not. Finding out why is the science goal.', credit: 'Image: HiRISE, Mars Reconnaissance Orbiter, about 0.7 m per pixel' },
    { id: 'data', rail: 'Data', eyebrow: '04', title: 'Three missions, five kinds of data', body: 'Sub-metre images and a one-metre terrain model from Mars Reconnaissance Orbiter. Night-time temperature from Mars Odyssey. Weather, radiation and photographs from Curiosity. Sweeping across now: slope, then night surface temperature.', credit: 'Slope: derived from the terrain. Night temperature: THEMIS, Mars Odyssey' },
    { id: 'curiosity', rail: 'Curiosity', eyebrow: '05', title: 'Where Curiosity stopped', body: `${nStops} places in this 3 km area where Curiosity parked for three sols or more, from its own records. Each one is a place a person could walk to.`, credit: 'Navigation camera photos, NASA/JPL-Caltech',
      extra: `<div class="st-photos">${['c4560', 'c4687', 'c4711', 'c4893'].map((id) => photo(named(id))).join('')}</div>` },
    { id: 'route', rail: 'Route', eyebrow: '06', title: 'A route, and a call', body: `${NAME} finds a path across the ridges that stays under the slope limit, and times it for a walker in a suit. Then it weighs the walk against the daylight and the space weather and makes the call.`, extra: '<p class="st-call" id="st-call"></p>' },
    { id: 'pair', rail: 'Pairs', eyebrow: '07', title: 'Two astronauts', body: `Split the stops between two people. ${NAME} checks how far apart they get and whether they can still see each other over the ridges.` },
    { id: 'plan', rail: 'Plan', eyebrow: '08', title: 'Your turn', body: 'Pick the stops, read the call, then walk it at eye level.', extra: '<button class="btn primary go st-go" id="st-go">Plan a walk</button>' },
  ]
  const N = chapters.length

  // ---------------------------------------------------------------- page
  const root = document.createElement('div')
  root.id = 'story'
  root.innerHTML = `
    <div class="st-fade" id="st-fade"></div>
    <div class="st-grain"></div>
    <header class="st-top"><span class="wordmark">${NAME}</span><button class="btn st-skip" id="st-skip">Skip to the planner</button></header>
    <nav class="st-rail" aria-label="Chapters">${chapters.map((c, i) => `<button data-i="${i}" aria-label="${c.rail}"><i></i><span>${c.rail}</span></button>`).join('')}</nav>
    <div class="st-scroll" id="st-scroll" tabindex="0">
      ${chapters.map((c, i) => `<section class="st-ch ${i === 0 ? 'first' : ''} ${i === N - 1 ? 'last' : ''}" id="st-${c.id}">
        <div class="st-text">
          ${c.eyebrow ? `<span class="st-eye">${c.eyebrow}</span>` : ''}
          <h2>${c.title}</h2><p>${c.body}</p>${c.extra ?? ''}
          ${c.credit ? `<small>${c.credit}</small>` : ''}
          ${i === 0 ? '<span class="st-hint">Scroll to begin</span>' : ''}
        </div>
      </section>`).join('')}
    </div>`
  const scroll = () => root.querySelector<HTMLElement>('#st-scroll')!

  // ---------------------------------------------------------------- globe scene
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.01, 200)
  const globe = new THREE.Group(), tex = new THREE.TextureLoader().load(globeUrl, () => kick())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }))
  globe.add(planet)
  // atmosphere: a soft dusty limb, brighter on the lit side
  const sunDir = new THREE.Vector3(-1.6, 0.7, 1.1).normalize()
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { sun: { value: sunDir } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(position, 0.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vW;
      void main(){
        float rim = pow(clamp(0.72 + dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0);
        float lit = clamp(dot(vW, sun) * 0.8 + 0.35, 0.0, 1.0);
        vec3 c = mix(vec3(0.35, 0.45, 0.75), vec3(0.98, 0.66, 0.42), lit);
        gl_FragColor = vec4(c * rim * (0.25 + 0.9 * lit), 1.0);
      }`,
  }))
  scene.add(globe, atmo)
  const sun = new THREE.DirectionalLight(0xfff1df, 2.6); sun.position.copy(sunDir)
  scene.add(sun, new THREE.AmbientLight(0x6b4a3a, 0.12))
  // Gale crater marker
  const latR = (GALE.lat * Math.PI) / 180, phi = ((GALE.lon + 180) / 360) * Math.PI * 2
  const galeP = new THREE.Vector3(-Math.cos(phi) * Math.cos(latR), Math.sin(latR), Math.sin(phi) * Math.cos(latR))
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 48), new THREE.MeshBasicMaterial({ color: 0xf2662f, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
  marker.position.copy(galeP.clone().multiplyScalar(1.003)); marker.lookAt(galeP.clone().multiplyScalar(2))
  globe.add(marker)
  const galeYaw = Math.atan2(-galeP.x, galeP.z)
  // stars and drifting dust
  const stars = new THREE.BufferGeometry(), sp: number[] = []
  for (let i = 0; i < 1400; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60); sp.push(v.x, v.y, v.z) }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false })))
  const dustN = reduce ? 0 : W.low ? 1500 : 4000, dust = new THREE.BufferGeometry(), dp = new Float32Array(dustN * 3)
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 6; dp[i * 3 + 1] = (Math.random() - 0.5) * 4; dp[i * 3 + 2] = Math.random() * 5 - 1 }
  dust.setAttribute('position', new THREE.BufferAttribute(dp, 3))
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { t: { value: 0 }, fade: { value: 1 } },
    vertexShader: `uniform float t; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(t * 0.07 + position.y * 3.0) * 0.08 + t * 0.012; p.y += cos(t * 0.05 + position.x * 2.0) * 0.06;
        p.x = mod(p.x + 3.0, 6.0) - 3.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(9.0 / -mv.z, 0.5, 6.0);
        vA = smoothstep(6.0, 1.5, -mv.z) * 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'uniform float fade; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.72, 0.5) * vA * fade * smoothstep(0.5, 0.0, d), 1.0); }',
  })
  const dustPts = new THREE.Points(dust, dustMat)
  cam.add(dustPts); scene.add(cam)

  const drawGlobe = (r: THREE.WebGLRenderer, p: number, t: number) => {
    const c = r.domElement
    cam.aspect = c.clientWidth / Math.max(1, c.clientHeight); cam.updateProjectionMatrix()
    // chapter 0: the whole planet turning slowly; chapter 1: Gale turned to face us, closer
    const k = ease(band(p, 0.05, 1)), spin = reduce ? galeYaw - 1.4 : galeYaw - 1.4 + t * 0.03
    globe.rotation.y = spin + (galeYaw - spin) * k
    const dist = 4.0 * Math.pow(2.3 / 4.0, k) * (1 - 0.3 * band(p, 1, 1.8)) * Math.max(1, 0.8 / cam.aspect), tilt = -0.06 + (latR - 0.04 + 0.06) * k // tall screens step back
    // keep the globe right of centre on wide screens so the text has room
    const off = c.clientWidth > 900 ? 0.38 * (1 - k * 0.5) : 0
    cam.position.set(Math.sin(-off * 0.3) * dist, Math.sin(tilt) * dist, Math.cos(tilt) * dist)
    cam.lookAt(-off, 0, 0)
    marker.scale.setScalar(1 + 0.35 * Math.sin(t * 2.2)); (marker.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * k
    dustMat.uniforms.t.value = t; dustMat.uniforms.fade.value = 1 - band(p, 1.2, 1.8)
    r.setClearColor(0x050505, 1)
    r.render(scene, cam)
  }

  // ---------------------------------------------------------------- camera over the terrain
  // Mount Sharp's summit within the 30 km ring sets which way the camera looks in chapter 2
  const o = D.outer
  let best = 0
  for (let i = 1; i < o.h.length; i++) if (o.h[i] > o.h[best]) best = i
  const mx = ((best % o.n) + 0.5 - o.n / 2) * o.cell, mz = (Math.floor(best / o.n) + 0.5 - o.n / 2) * o.cell, ml = Math.hypot(mx, mz) || 1
  const m = { x: mx / ml, z: mz / ml }, away = Math.atan2(-m.x, -m.z)
  const at = (x: number, z: number) => new THREE.Vector3(x, W.ground(x, z), z)
  const poses = (): Pose[] => {
    const route = host.routePose(), tc = W.trackCentre
    return [
      route, route, // unused: chapters 0 and 1 are the globe
      { target: at(m.x * 4300, m.z * 4300), dist: 14500, yaw: away + 0.15, pitch: 0.3 },
      { target: at(0, 0), dist: 1500, yaw: away + 0.7, pitch: 0.5 },
      { target: at(0, 0), dist: 2700, yaw: away + 0.95, pitch: 1.05 },
      { target: at(tc.x, tc.z), dist: 2500, yaw: away + 1.15, pitch: 1.0 },
      route, route, route,
    ]
  }
  const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
    let dy = b.yaw - a.yaw
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    return { target: a.target.clone().lerp(b.target, k), dist: a.dist * Math.pow(b.dist / a.dist, k), yaw: a.yaw + dy * k, pitch: a.pitch + (b.pitch - a.pitch) * k }
  }

  // ---------------------------------------------------------------- scroll and frame loop
  let target = 0, cur = 0, raf = 0, on = false, plan: 'solo' | 'pair' = 'solo', t0 = performance.now()
  const progress = () => { const s = scroll(); return ((s.scrollTop / Math.max(1, s.scrollHeight - s.clientHeight)) * (N - 1)) }
  const kick = () => { if (on && !raf) raf = requestAnimationFrame(frame) }
  const frame = (now: number) => {
    raf = 0
    if (!on) return
    target = progress()
    cur = reduce ? target : cur + (target - cur) * 0.1
    if (Math.abs(target - cur) < 0.0005) cur = target
    const p = cur, t = (now - t0) / 1000
    // fade through dust between the globe and the terrain
    const fade = p < 1.8 ? band(p, 1.45, 1.8) : 1 - band(p, 1.8, 2.15)
    root.querySelector<HTMLElement>('#st-fade')!.style.opacity = fade.toFixed(3)
    if (p < 1.8) {
      W.external = (r) => drawGlobe(r, p, t)
      W.invalidate()
    } else {
      W.external = null
      const ps = poses(), i = Math.min(N - 2, Math.max(2, Math.floor(p))), k = ease(clamp01(p - i))
      W.setPose(p <= 2 ? ps[2] : lerpPose(ps[i], ps[i + 1], k))
      // effects, each tied to its chapter
      const contour = Math.min(band(p, 2.15, 2.7), 1 - band(p, 3.25, 3.55))
      const slope = p > 3.35 && p < 4.55 ? -1700 + 3400 * ease(band(p, 3.35, 3.95)) : null
      const therm = p > 3.95 && p < 4.7 ? -1700 + 3400 * ease(band(p, 3.95, 4.45)) : null
      W.storyFx({
        contour, contourR: 300 + 3200 * ease(band(p, 2.2, 3.2)),
        slopeScan: slope, thermScan: therm,
        fog: 0.000115 - 0.000095 * (1 - band(p, 2.3, 3.0)),
        track: p > 4.5 && p < 6.3 ? ease(band(p, 4.55, 5.1)) : 0,
        routes: p < 5.5 ? 0 : ease(band(p, 5.5, 6.05)),
      })
      if (slope === null) W.setLayer('slope', false)
      if (therm === null) W.setLayer('thermal', false)
      // chapter 7 shows the pair plan; around it, the default walk
      const want = p > 6.45 && p < 7.55 ? 'pair' : 'solo'
      if (want !== plan) { plan = want; host.showPlan(want) }
      document.body.classList.toggle('story-pins', p > 4.6 && p < 5.6)
      document.body.classList.toggle('story-tags', p > 5.8)
    }
    const ci = Math.round(target)
    root.querySelectorAll<HTMLElement>('.st-rail button').forEach((b, i) => b.setAttribute('aria-current', String(i === ci)))
    if (ci === 6) root.querySelector<HTMLElement>('#st-call')!.textContent = host.summary()
    // keep going while easing, and on the globe (it turns, the dust drifts)
    if (cur !== target || p < 1.8) raf = requestAnimationFrame(frame)
  }

  const onScroll = () => kick()
  const onKey = (e: KeyboardEvent) => { if (on && e.key === 'Escape') leave(true) }
  const leave = (toPlanner: boolean) => {
    if (!on) return
    on = false
    cancelAnimationFrame(raf); raf = 0
    W.external = null
    W.storyFx({ slopeScan: null, thermScan: null, contour: 0, fog: null, track: null, routes: null })
    W.setLayer('slope', false); W.setLayer('thermal', false); W.setLayer('track', false)
    if (plan !== 'solo') { plan = 'solo'; host.showPlan('solo') }
    document.body.classList.remove('story', 'story-pins', 'story-tags')
    root.remove()
    removeEventListener('keydown', onKey)
    try { localStorage.setItem('mw-story', 'seen') } catch { /* private mode */ }
    if (toPlanner) host.exit()
  }
  const enter = () => {
    if (on) return
    on = true; plan = 'solo'; t0 = performance.now()
    document.body.appendChild(root)
    document.body.classList.add('story')
    scroll().scrollTop = 0; cur = target = 0
    scroll().addEventListener('scroll', onScroll, { passive: true })
    addEventListener('keydown', onKey)
    root.querySelector<HTMLElement>('#st-skip')!.onclick = () => leave(true)
    root.querySelector<HTMLElement>('#st-go')!.onclick = () => leave(true)
    root.querySelectorAll<HTMLElement>('.st-rail button').forEach((b) => (b.onclick = () => {
      const s = scroll(), i = Number(b.dataset.i)
      s.scrollTo({ top: (i / (N - 1)) * (s.scrollHeight - s.clientHeight), behavior: reduce ? 'auto' : 'smooth' })
    }))
    scroll().focus({ preventScroll: true })
    kick()
  }
  return { enter, leave, get active() { return on } }
}
