// A procedural astronaut for the partner in a pair walk. AI-assisted (Claude Code).
// About 1.9 m tall, faces +z, built from a few hundred primitives' worth of triangles so it
// costs nothing next to the terrain. The suit is white with coloured bands that say who it is
// (orange A, blue B), as real EVA suits carry stripes to tell crew members apart.
import * as THREE from 'three'

export interface Astronaut {
  group: THREE.Group
  setColor(c: number): void
  /** phase in radians of the stride; amount 0 standing to 1 full stride */
  pose(phase: number, amount: number): void
}

/** A small Mars-sky environment so the visor and helmet shell have something to reflect. */
function marsEnv(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene()
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 ground = vec3(0.18, 0.11, 0.07), horizon = vec3(0.86, 0.66, 0.48), zenith = vec3(0.55, 0.42, 0.33);
          vec3 c = h < 0.0 ? mix(horizon * 0.55, ground, smoothstep(0.0, -0.5, h)) : mix(horizon, zenith, smoothstep(0.0, 0.7, h));
          // a bright sun patch gives the visor its highlight
          c += vec3(1.6, 1.4, 1.1) * pow(max(dot(vP, normalize(vec3(0.5, 0.6, 0.4))), 0.0), 64.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  )
  scene.add(sky)
  const pm = new THREE.PMREMGenerator(renderer)
  const tex = pm.fromScene(scene, 0.02).texture
  pm.dispose(); sky.geometry.dispose(); (sky.material as THREE.Material).dispose()
  return tex
}

export function buildAstronaut(renderer: THREE.WebGLRenderer, color: number): Astronaut {
  const env = marsEnv(renderer)
  const suit = new THREE.MeshStandardMaterial({ color: 0xece8e1, roughness: 0.82, metalness: 0, envMap: env, envMapIntensity: 0.6 })
  const soft = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.9, envMap: env, envMapIntensity: 0.4 }) // fabric folds at the joints
  const hard = new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 1 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.55, metalness: 0.4, envMap: env, envMapIntensity: 0.8 })
  const band = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.18 })
  const visor = new THREE.MeshPhysicalMaterial({ color: 0xc9962e, metalness: 1, roughness: 0.08, envMap: env, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05 })

  const g = new THREE.Group()
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m
  }
  const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14)
  const ring = (r: number, t: number) => new THREE.TorusGeometry(r, t, 8, 24).rotateX(Math.PI / 2)

  // torso: the hard upper torso is wider than deep
  const torso = add(g, cap(0.2, 0.34), suit, 0, 1.2, 0); torso.scale.set(1.25, 1, 0.82)
  add(g, ring(0.2, 0.035), soft, 0, 0.98, 0).scale.set(1.15, 1, 0.85) // waist bearing
  const hips = add(g, cap(0.17, 0.08), suit, 0, 0.9, 0); hips.scale.set(1.3, 1, 0.85)
  // chest display and control module
  add(g, new THREE.BoxGeometry(0.26, 0.13, 0.09), dark, 0, 1.22, 0.19).rotation.x = -0.25
  add(g, new THREE.BoxGeometry(0.06, 0.03, 0.02), band, -0.07, 1.25, 0.235).rotation.x = -0.25
  // life support backpack with a top unit and side cylinders
  add(g, new THREE.BoxGeometry(0.46, 0.6, 0.22), hard, 0, 1.24, -0.27)
  add(g, new THREE.BoxGeometry(0.38, 0.12, 0.18), hard, 0, 1.6, -0.25)
  for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12), dark, sx * 0.25, 1.22, -0.3)
  add(g, new THREE.BoxGeometry(0.3, 0.04, 0.012), band, 0, 1.42, -0.385)

  // helmet: neck ring, white shell, gold visor on the front, lamps on the sides
  add(g, ring(0.15, 0.03), dark, 0, 1.48, 0.02)
  add(g, new THREE.SphereGeometry(0.19, 32, 20), hard, 0, 1.66, 0.02)
  // a partial sphere centred on +z: the front
  add(g, new THREE.SphereGeometry(0.197, 32, 20, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.42), visor, 0, 1.66, 0.025)
  for (const sx of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12).rotateX(Math.PI / 2), dark, sx * 0.17, 1.74, 0.06)
    add(g, new THREE.CircleGeometry(0.026, 12), new THREE.MeshBasicMaterial({ color: 0xfff4dc }), sx * 0.17, 1.74, 0.097)
  }

  // limbs hang from pivots so they can swing
  const limb = (x: number, y: number) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p }
  const arms = [-1, 1].map((sx) => {
    const sh = limb(sx * 0.29, 1.36)
    add(sh, new THREE.SphereGeometry(0.095, 16, 12), soft) // shoulder bearing
    add(sh, cap(0.075, 0.2), suit, 0, -0.17, 0)
    add(sh, ring(0.082, 0.018), band, 0, -0.12, 0)
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el)
    add(el, new THREE.SphereGeometry(0.07, 12, 10), soft)
    add(el, cap(0.066, 0.18), suit, 0, -0.14, 0)
    add(el, ring(0.07, 0.02), dark, 0, -0.25, 0) // wrist disconnect
    add(el, new THREE.SphereGeometry(0.062, 12, 10), dark, 0, -0.31, 0.01).scale.set(0.9, 1.2, 0.8) // glove
    sh.rotation.z = sx * 0.12
    return { sh, el }
  })
  const legs = [-1, 1].map((sx) => {
    const hip = limb(sx * 0.12, 0.86)
    add(hip, cap(0.095, 0.26), suit, 0, -0.2, 0)
    add(hip, ring(0.1, 0.02), band, 0, -0.12, 0)
    const kn = new THREE.Group(); kn.position.y = -0.4; hip.add(kn)
    add(kn, new THREE.SphereGeometry(0.088, 12, 10), soft)
    add(kn, cap(0.082, 0.24), suit, 0, -0.18, 0)
    add(kn, new THREE.BoxGeometry(0.15, 0.1, 0.27), dark, 0, -0.39, 0.04)
    add(kn, new THREE.BoxGeometry(0.16, 0.025, 0.29), soft, 0, -0.44, 0.045) // sole
    return { hip, kn }
  })
  g.traverse((o) => { o.castShadow = true })
  g.visible = false

  return {
    group: g,
    setColor(c) { band.color.set(c); band.emissive.set(c) },
    pose(phase, amount) {
      // a low-gravity lope: long stride, little arm swing, a small bob
      const s = Math.sin(phase) * amount
      legs[0].hip.rotation.x = s * 0.5; legs[1].hip.rotation.x = -s * 0.5
      legs[0].kn.rotation.x = Math.max(0, -Math.sin(phase + 0.6)) * 0.7 * amount
      legs[1].kn.rotation.x = Math.max(0, Math.sin(phase + 0.6)) * 0.7 * amount
      arms[0].sh.rotation.x = -s * 0.3; arms[1].sh.rotation.x = s * 0.3
      arms[0].el.rotation.x = arms[1].el.rotation.x = -0.35
    },
  }
}
