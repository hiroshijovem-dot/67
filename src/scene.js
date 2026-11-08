// "Attempt 47" — a tiny blocky obby story, rendered entirely in code.
// Everything is a pure function of time t (seconds), so any frame can be
// rendered in any order: window.renderFrame(t) -> JPEG data URL.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const W = 1080, H = 1920, DURATION = 29.5;

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k * k * (3 - 2 * k);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeOutBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, k) => a.clone().lerp(b, k);
function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.id = 'gl';
document.body.appendChild(renderer.domElement);

const out = document.createElement('canvas');
out.width = W; out.height = H; out.id = 'out';
document.body.appendChild(out);
const ctx = out.getContext('2d');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 400);

// sky gradient
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#3d8bff'); grd.addColorStop(0.55, '#8cc8ff'); grd.addColorStop(1, '#dff1ff');
  g.fillStyle = grd; g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
scene.fog = new THREE.Fog(0xcfe8ff, 45, 140);

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a8a4a, 1.1));
const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
sun.position.set(-12, 30, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const lavaGlow = new THREE.PointLight(0xff6a00, 30, 22, 1.4);
lavaGlow.position.set(17, 1.2, 3);
scene.add(lavaGlow);

// ---------------------------------------------------------------- world
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });

function studTexture(base, line) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line; g.lineWidth = 4; g.strokeRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (const [x, y] of [[36, 36], [92, 36], [36, 92], [92, 92]]) { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// grass baseplate
{
  const tex = studTexture('#4caf3f', '#3f9634'); tex.repeat.set(100, 100);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
  scene.add(m);
}

// lava
const lavaMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+1.),f.x), f.y); }
    void main(){
      vec2 p = vUv * vec2(18., 9.);
      float n = noise(p + vec2(uTime*.35, uTime*.12)) + .5*noise(p*2.1 - uTime*.5) + .25*noise(p*4.3 + uTime*.9);
      n /= 1.75;
      vec3 c = mix(vec3(.75,.06,0.), vec3(1.,.42,0.), smoothstep(.3,.62,n));
      c = mix(c, vec3(1.,.88,.35), smoothstep(.68,.86,n));
      gl_FragColor = vec4(c, 1.);
    }`,
});
{
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(31, 14), lavaMat);
  lava.rotation.x = -Math.PI / 2; lava.position.set(18.5, 0.02, 0);
  scene.add(lava);
  // stone rim around the lava pit
  const rimMat = std(0x7b7f88);
  for (const [x, z, w, d] of [[18.5, 7.4, 31.8, 0.8], [18.5, -7.4, 31.8, 0.8], [2.6, 0, 0.8, 15.6], [34.4, 0, 0.8, 15.6]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), rimMat);
    r.position.set(x, 0.25, z); r.castShadow = r.receiveShadow = true; scene.add(r);
  }
}

// spawn pad
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa0aa'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e8ecf2'; g.lineWidth = 18; g.beginPath(); g.arc(128, 128, 80, 0, 7); g.stroke();
  g.fillStyle = '#e8ecf2'; g.beginPath(); g.moveTo(128, 70); g.lineTo(178, 150); g.lineTo(78, 150); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const side = std(0x7c828c);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 3), [side, side, top, side, side, side]);
  pad.position.set(0, 0.05, 0); pad.receiveShadow = true; scene.add(pad);
}

// obby platforms: [x, topY, size, color]
const PLATFORMS = [
  [6, 1, 2.2, 0xff4d6d], [10.5, 2, 2.2, 0xff9f1c], [15, 3, 2.2, 0xffd93d],
  [19.5, 4, 2.2, 0x4cd964], [24, 5, 3.2, 0x3fa7ff], [29, 6.5, 3.5, 0xa66bff],
];
for (const [x, top, s, color] of PLATFORMS) {
  const tex = studTexture('#ffffff', '#dddddd'); tex.repeat.set(s / 1.1, s / 1.1);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(s, 0.4, s, 2, 0.06), new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.55 }));
  cap.position.set(x, top - 0.2, 0); cap.castShadow = cap.receiveShadow = true; scene.add(cap);
  const pillarH = top - 0.4;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(s * 0.55, pillarH, s * 0.55), std(new THREE.Color(color).multiplyScalar(0.55)));
  pillar.position.set(x, pillarH / 2, 0); pillar.castShadow = pillar.receiveShadow = true; scene.add(pillar);
}

// trophy on a pedestal
const PEDESTAL = v3(29.7, 6.5, 0);
{
  const p = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.4, 0.7, 2, 0.05), std(0xffffff));
  p.position.copy(PEDESTAL).add(v3(0, 0.2, 0)); p.castShadow = true; scene.add(p);
}
const trophy = new THREE.Group();
{
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.85, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), gold); base.position.y = 0.06;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 12), gold); stem.position.y = 0.27;
  const pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector2(0.08 + 0.26 * Math.sin(k * Math.PI * 0.55), k * 0.5)); }
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), gold); cup.position.y = 0.42;
  cup.material = gold.clone(); cup.material.side = THREE.DoubleSide;
  const hL = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), gold); hL.position.set(-0.3, 0.68, 0);
  const hR = hL.clone(); hR.position.x = 0.3;
  trophy.add(base, stem, cup, hL, hR);
  trophy.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(trophy);
}
const trophyGlow = new THREE.PointLight(0xffd36b, 12, 6, 1.5);
scene.add(trophyGlow);

// blocky clouds
{
  const r = rng(7), mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35 });
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3 + r() * 4, 1.2 + r() * 1.2, 2 + r() * 2.5), mat);
      b.position.set(j * 2.4 - n, r() * 0.8, (r() - 0.5) * 1.5); g.add(b);
    }
    g.position.set(-30 + r() * 90, 18 + r() * 14, -50 - r() * 40);
    scene.add(g);
  }
}

// ---------------------------------------------------------------- characters
function faceTexture(kind, shades) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1a'; g.strokeStyle = '#1a1a1a'; g.lineCap = 'round'; g.lineWidth = 12;
  const eye = (x, y, w, h) => { g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill(); };
  if (shades) {
    g.beginPath(); g.roundRect(40, 78, 176, 52, 14); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(60, 88); g.lineTo(90, 88); g.lineTo(72, 118); g.lineTo(52, 118); g.fill();
    g.beginPath(); g.moveTo(148, 88); g.lineTo(178, 88); g.lineTo(160, 118); g.lineTo(140, 118); g.fill();
    g.fillStyle = '#1a1a1a';
  } else {
    const big = kind === 'shock' || kind === 'scream';
    eye(92, 104, big ? 16 : 13, big ? 24 : 20); eye(164, 104, big ? 16 : 13, big ? 24 : 20);
    if (kind === 'angry') { g.beginPath(); g.moveTo(64, 66); g.lineTo(112, 84); g.moveTo(192, 66); g.lineTo(144, 84); g.stroke(); }
    if (kind === 'sad') { g.beginPath(); g.moveTo(68, 82); g.lineTo(110, 68); g.moveTo(188, 82); g.lineTo(146, 68); g.stroke(); }
  }
  g.beginPath();
  switch (kind) {
    case 'smile': g.arc(128, 150, 42, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); break;
    case 'happy': g.moveTo(80, 150); g.quadraticCurveTo(128, 230, 176, 150); g.closePath(); g.fill(); break;
    case 'smirk': g.moveTo(96, 172); g.quadraticCurveTo(150, 186, 176, 152); g.stroke(); break;
    case 'sad': g.arc(128, 200, 36, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); break;
    case 'angry': g.moveTo(100, 176); g.lineTo(156, 172); g.stroke(); break;
    case 'shock': g.ellipse(128, 178, 18, 24, 0, 0, 7); g.fill(); break;
    case 'scream': g.ellipse(128, 182, 32, 40, 0, 0, 7); g.fill(); break;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function shirtTexture(color, accent, mark) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  if (mark === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 16 : 36, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); }
    g.fill();
  } else if (mark === 'bolt') {
    g.beginPath(); g.moveTo(74, 18); g.lineTo(42, 70); g.lineTo(62, 70); g.lineTo(52, 112); g.lineTo(88, 54); g.lineTo(66, 54); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FACES = ['smile', 'happy', 'smirk', 'sad', 'angry', 'shock', 'scream'];
function makeChar(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = std(cfg.skin), shirt = std(cfg.shirt), pants = std(cfg.pants);
  const box = (w, h, d, m) => { const me = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.04), m); me.castShadow = true; return me; };
  const limb = (x, y, m, len = 1) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const me = box(0.48, len, 0.48, m); me.position.y = -len / 2 + 0.02; pivot.add(me);
    body.add(pivot); return pivot;
  };
  const torso = box(1, 1, 0.5, shirt); torso.position.y = 1.5; body.add(torso);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: shirtTexture(cfg.shirtHex, cfg.accent, cfg.mark), roughness: 0.8 }));
  logo.position.set(0, 1.55, 0.252); body.add(logo);
  const legL = limb(0.25, 1.0, pants), legR = limb(-0.25, 1.0, pants);
  const armL = limb(0.75, 1.95, cfg.sleeves ? shirt : skin, 0.95), armR = limb(-0.75, 1.95, cfg.sleeves ? shirt : skin, 0.95);
  const head = new THREE.Group(); head.position.y = 2.02; body.add(head);
  const skull = box(0.72, 0.66, 0.66, skin); skull.position.y = 0.34; head.add(skull);
  const faceMats = Object.fromEntries(FACES.map(f => [f, new THREE.MeshBasicMaterial({ map: faceTexture(f, cfg.shades), transparent: true, depthWrite: false })]));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), faceMats.smile);
  face.position.set(0, 0.32, 0.335); head.add(face);
  if (cfg.hair) { const h = box(0.78, 0.2, 0.72, std(cfg.hair)); h.position.set(0, 0.7, -0.02); head.add(h); }
  if (cfg.cap) {
    const capMat = std(cfg.cap);
    const top = box(0.78, 0.22, 0.72, capMat); top.position.set(0, 0.72, 0); head.add(top);
    const brim = box(0.5, 0.06, 0.42, capMat); brim.position.set(0, 0.64, -0.5); head.add(brim);
  }
  scene.add(root);
  return { root, body, head, armL, armR, legL, legR, face, faceMats, parts: [] };
}

const tim = makeChar({ skin: 0xf2c79b, shirt: 0x3d8bff, shirtHex: '#3d8bff', accent: '#ffffff', mark: 'star', pants: 0x3a3f58, hair: 0x6b3e1e });
const pro = makeChar({ skin: 0xc68642, shirt: 0x1d1d22, shirtHex: '#1d1d22', accent: '#39ff88', mark: 'bolt', pants: 0x2b2b33, cap: 0x39ff88, shades: true, sleeves: true });

// ---------------------------------------------------------------- story tracks
// Segment types: idle, walk, jump, sink, hidden. Positions are feet positions.
const S = 0.1;        // spawn pad top
const RIGHT = Math.PI / 2, LEFT = -Math.PI / 2;
const P = (x, y) => v3(x, y, 0);

const TIM = [
  { k: 'idle', t0: 0, t1: 3, p: P(0, S), rot: 0, anim: 'wave', w0: 0.5, w1: 2.7 },
  { k: 'idle', t0: 3, t1: 5.5, p: P(0, S), rot: 0 },
  { k: 'jump', t0: 5.5, t1: 5.85, a: P(0, S), b: P(-0.5, S), h: 0.5, rot: 0.3, land: true },
  { k: 'idle', t0: 5.85, t1: 7.0, p: P(-0.5, S), rot: 0.6 },
  { k: 'idle', t0: 7.0, t1: 9.6, p: P(-0.5, S), rot: RIGHT },
  { k: 'walk', t0: 9.6, t1: 10.1, a: P(-0.5, S), b: P(2.5, S) },
  { k: 'jump', t0: 10.1, t1: 10.6, a: P(2.5, S), b: P(6, 1), h: 1.2, land: true },
  { k: 'idle', t0: 10.6, t1: 10.8, p: P(6, 1), rot: RIGHT },
  { k: 'jump', t0: 10.8, t1: 11.4, a: P(6, 1), b: P(8.6, 0), h: 1.0, fail: true },
  { k: 'sink', t0: 11.4, t1: 11.8, p: P(8.6, 0), rot: RIGHT },
  { k: 'hidden', t0: 11.8, t1: 12.0 },
  { k: 'idle', t0: 12.0, t1: 12.4, p: P(0, S), rot: 0, spawn: true },
  // montage of failures
  ...[[12.4, P(10.5, 2), P(12.9, 0)], [12.75, P(15, 3), P(17.3, 0)], [13.1, P(6, 1), P(8.4, 0)], [13.45, P(19.5, 4), P(21.8, 0)]]
    .flatMap(([t, a, b]) => [
      { k: 'jump', t0: t, t1: t + 0.27, a, b, h: 0.8, fail: true },
      { k: 'sink', t0: t + 0.27, t1: t + 0.35, p: b, rot: RIGHT },
    ]),
  { k: 'idle', t0: 13.8, t1: 15.0, p: P(0, S), rot: 0, spawn: true },
  { k: 'walk', t0: 15.0, t1: 15.4, a: P(0, S), b: P(2.5, S) },
  { k: 'jump', t0: 15.4, t1: 15.9, a: P(2.5, S), b: P(6, 1), h: 1.2, land: true },
  { k: 'idle', t0: 15.9, t1: 16.05, p: P(6, 1), rot: RIGHT },
  { k: 'jump', t0: 16.05, t1: 16.55, a: P(6, 1), b: P(10.5, 2), h: 1.2, land: true },
  { k: 'idle', t0: 16.55, t1: 16.7, p: P(10.5, 2), rot: RIGHT },
  { k: 'jump', t0: 16.7, t1: 17.2, a: P(10.5, 2), b: P(15, 3), h: 1.2, land: true },
  { k: 'idle', t0: 17.2, t1: 17.35, p: P(15, 3), rot: RIGHT },
  { k: 'jump', t0: 17.35, t1: 17.85, a: P(15, 3), b: P(19.5, 4), h: 1.2, land: true },
  { k: 'idle', t0: 17.85, t1: 18.0, p: P(19.5, 4), rot: RIGHT },
  { k: 'jump', t0: 18.0, t1: 18.5, a: P(19.5, 4), b: P(23.1, 5), h: 1.2, land: true },
  { k: 'idle', t0: 18.5, t1: 20.8, p: P(23.1, 5), rot: RIGHT },
  { k: 'jump', t0: 20.8, t1: 21.4, a: P(23.1, 5), b: P(28.0, 6.5), h: 1.6, land: true },
  { k: 'walk', t0: 21.4, t1: 21.7, a: P(28.0, 6.5), b: P(28.95, 6.5) },
  { k: 'idle', t0: 21.7, t1: 99, p: P(28.95, 6.5), rot: -0.3, rotFrom: RIGHT, anim: 'hold' },
];

const PRO = [
  { k: 'hidden', t0: 0, t1: 5.0 },
  { k: 'jump', t0: 5.0, t1: 5.5, a: P(1.6, 14), b: P(1.6, S), h: 0, rot: -0.6, land: true, drop: true },
  { k: 'idle', t0: 5.5, t1: 7.0, p: P(1.6, S), rot: -0.6, anim: 'cool' },
  { k: 'walk', t0: 7.0, t1: 7.3, a: P(1.6, S), b: P(2.5, S) },
  { k: 'jump', t0: 7.3, t1: 7.7, a: P(2.5, S), b: P(6, 1), h: 1.2, land: true },
  { k: 'jump', t0: 7.75, t1: 8.15, a: P(6, 1), b: P(10.5, 2), h: 1.2, land: true },
  { k: 'jump', t0: 8.2, t1: 8.6, a: P(10.5, 2), b: P(15, 3), h: 1.2, land: true },
  { k: 'jump', t0: 8.65, t1: 9.05, a: P(15, 3), b: P(19.5, 4), h: 1.2, land: true },
  { k: 'jump', t0: 9.1, t1: 9.5, a: P(19.5, 4), b: P(24.7, 5), h: 1.2, land: true },
  { k: 'idle', t0: 9.5, t1: 18.45, p: P(24.7, 5), rot: LEFT, anim: 'dance' },
  { k: 'idle', t0: 18.45, t1: 19.0, p: P(24.7, 5), rot: LEFT, anim: 'startle' },
  { k: 'walk', t0: 19.0, t1: 19.35, a: P(24.7, 5), b: P(25.75, 5), rot: LEFT, back: true },
  { k: 'jump', t0: 19.35, t1: 20.15, a: P(25.75, 5), b: P(26.4, 0), h: 0.35, rot: LEFT, fail: true, spin: true },
  { k: 'sink', t0: 20.15, t1: 20.55, p: P(26.4, 0), rot: LEFT },
  { k: 'hidden', t0: 20.55, t1: 24.9 },
  { k: 'idle', t0: 24.9, t1: 99, p: P(0, S), rot: 0.35, spawn: true, anim: 'slump' },
];

const TIM_FACE = [[0, 'smile'], [5.5, 'shock'], [6.2, 'smile'], [10.8, 'scream'], [12.0, 'sad'], [12.4, 'scream'], [13.8, 'angry'], [19.1, 'shock'], [19.7, 'happy']];
const PRO_FACE = [[0, 'smirk'], [18.45, 'shock'], [19.35, 'scream'], [24.9, 'sad']];
const faceAt = (list, t) => { let f = list[0][1]; for (const [t0, v] of list) if (t >= t0) f = v; return f; };

function segAt(track, t) {
  for (const s of track) if (t >= s.t0 && t < s.t1) return s;
  return track[track.length - 1];
}

function charState(track, t) {
  const s = segAt(track, t);
  const k = clamp((t - s.t0) / (s.t1 - s.t0));
  const st = { visible: true, pos: null, rot: 0, anim: 'idle', k, seg: s, spin: 0 };
  switch (s.k) {
    case 'hidden': st.visible = false; st.pos = v3(0, -50, 0); break;
    case 'idle':
      st.pos = s.p.clone();
      st.rot = s.rotFrom !== undefined ? lerp(s.rotFrom, s.rot, ease(clamp((t - s.t0) / 0.35))) : s.rot;
      st.anim = s.anim === 'wave' ? (t > s.w0 && t < s.w1 ? 'wave' : 'idle') : (s.anim || 'idle');
      if (s.spawn && t - s.t0 < 0.45) st.visible = Math.floor((t - s.t0) / 0.05) % 2 === 0;
      break;
    case 'walk':
      st.pos = lerpV(s.a, s.b, k);
      st.rot = s.rot !== undefined ? s.rot : Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
      st.anim = 'walk'; st.back = s.back;
      break;
    case 'jump': {
      const kk = s.drop ? k * k : k;
      st.pos = lerpV(s.a, s.b, s.drop ? 1 : kk);
      if (s.drop) st.pos.y = lerp(s.a.y, s.b.y, kk);
      else st.pos.y = lerp(s.a.y, s.b.y, k) + s.h * 4 * k * (1 - k) + (s.fail ? 0 : 0);
      st.rot = s.rot !== undefined ? s.rot : Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
      st.anim = s.fail && k > 0.45 ? 'flail' : 'jump';
      if (s.spin) st.spin = k * 2.2;
      break;
    }
    case 'sink':
      st.pos = s.p.clone(); st.pos.y -= 2.8 * easeOut(k); st.rot = s.rot; st.anim = 'flail';
      break;
  }
  return st;
}

function applyPose(ch, st, t, faceKind) {
  ch.root.visible = st.visible;
  ch.root.position.copy(st.pos);
  ch.root.rotation.set(0, st.rot, 0);
  ch.body.position.set(0, 0, 0);
  ch.body.rotation.set(0, 0, 0);
  ch.head.rotation.set(0, 0, 0);
  for (const l of [ch.armL, ch.armR, ch.legL, ch.legR]) l.rotation.set(0, 0, 0);
  const { armL, armR, legL, legR } = ch;
  switch (st.anim) {
    case 'idle': case 'cool': {
      const b = Math.sin(t * 2.5) * 0.04;
      armL.rotation.z = 0.06 + b; armR.rotation.z = -0.06 - b;
      if (st.anim === 'cool') { armL.rotation.z = 0.55; armL.rotation.x = -0.2; ch.head.rotation.z = 0.08; }
      break;
    }
    case 'wave':
      armR.rotation.z = -2.6 + 0.35 * Math.sin(t * 14);
      armL.rotation.z = 0.08;
      ch.head.rotation.z = 0.06 * Math.sin(t * 7);
      break;
    case 'walk': {
      const ph = t * 16 * (st.back ? -1 : 1);
      legL.rotation.x = 0.85 * Math.sin(ph); legR.rotation.x = -0.85 * Math.sin(ph);
      armL.rotation.x = -0.75 * Math.sin(ph); armR.rotation.x = 0.75 * Math.sin(ph);
      ch.body.position.y = 0.06 * Math.abs(Math.cos(ph));
      break;
    }
    case 'jump':
      armL.rotation.x = -2.7; armR.rotation.x = -2.7; armL.rotation.z = 0.2; armR.rotation.z = -0.2;
      legL.rotation.x = -0.7; legR.rotation.x = 0.3;
      break;
    case 'flail': {
      const f = Math.sin(t * 34);
      armL.rotation.z = 2.3 + 0.5 * f; armR.rotation.z = -2.3 + 0.5 * f;
      legL.rotation.x = 0.7 * f; legR.rotation.x = -0.7 * f;
      ch.body.rotation.z = st.spin; ch.body.rotation.x = -st.spin * 0.6;
      break;
    }
    case 'dance': {
      const ph = t * 9.4;
      ch.body.position.y = 0.1 * Math.abs(Math.sin(ph));
      ch.body.rotation.y = 0.35 * Math.sin(ph);
      armL.rotation.z = 0.5 + 0.9 * Math.max(0, Math.sin(ph));
      armR.rotation.z = -0.5 - 0.9 * Math.max(0, -Math.sin(ph));
      armL.rotation.x = -0.6 * Math.cos(ph); armR.rotation.x = 0.6 * Math.cos(ph);
      legL.rotation.z = 0.15 * Math.sin(ph); legR.rotation.z = 0.15 * Math.sin(ph);
      ch.head.rotation.z = 0.15 * Math.sin(ph * 2);
      break;
    }
    case 'startle':
      ch.body.position.y = 0.12 * Math.max(0, Math.sin((t - 18.45) * 14));
      armL.rotation.z = 1.2; armR.rotation.z = -1.2; armL.rotation.x = -0.6; armR.rotation.x = -0.6;
      break;
    case 'hold': {
      const k = ease(clamp((t - 21.7) / 0.25));
      armL.rotation.x = -3.0 * k; armR.rotation.x = -3.0 * k; armL.rotation.z = -0.25 * k; armR.rotation.z = 0.25 * k;
      ch.body.position.y = 0.1 * Math.abs(Math.sin((t - 21.7) * 7)) * k;
      break;
    }
    case 'slump':
      ch.head.rotation.x = 0.35; armL.rotation.z = 0.03; armR.rotation.z = -0.03;
      ch.body.rotation.x = 0.08;
      break;
  }
  ch.face.material = ch.faceMats[faceKind];
}

// ---------------------------------------------------------------- particles
const MAXP = 900;
const pGeo = new THREE.BoxGeometry(1, 1, 1);
const pMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
pMesh.frustumCulled = false; scene.add(pMesh);
const confGeo = new THREE.PlaneGeometry(0.14, 0.22);
const confMesh = new THREE.InstancedMesh(confGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), 420);
confMesh.frustumCulled = false; scene.add(confMesh);

const BURSTS = []; // {t, pos, kind}
for (const [track] of [[TIM], [PRO]]) {
  for (const s of track) {
    if (s.k === 'sink') BURSTS.push({ t: s.t0, pos: s.p, kind: 'splash' });
    if (s.k === 'jump' && s.land) BURSTS.push({ t: s.t1, pos: s.b, kind: s.drop ? 'bigdust' : 'dust' });
    if (s.spawn) BURSTS.push({ t: s.t0, pos: s.p, kind: 'sparkle' });
  }
}
const CONFETTI_T = 21.8;
const PALETTE = [0xff4d6d, 0xffd93d, 0x4cd964, 0x3fa7ff, 0xa66bff, 0xff9f1c, 0xffffff];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
function updateParticles(t) {
  let n = 0;
  const put = (x, y, z, size, color, rx = 0, ry = 0) => {
    if (n >= MAXP || size <= 0.001) return;
    _e.set(rx, ry, 0); _q.setFromEuler(_e); _s.set(size, size, size);
    _m.compose(v3(x, y, z), _q, _s); pMesh.setMatrixAt(n, _m); pMesh.setColorAt(n, _c.set(color)); n++;
  };
  for (const [bi, b] of BURSTS.entries()) {
    const dt = t - b.t;
    if (dt < 0 || dt > 1.2) continue;
    const r = rng(1000 + bi * 31);
    if (b.kind === 'splash') {
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2, sp = 1 + r() * 2.6, up = 4 + r() * 5, life = 0.6 + r() * 0.5;
        if (dt > life) continue;
        const y = up * dt - 9 * dt * dt;
        if (y < -0.1) continue;
        put(b.pos.x + Math.cos(a) * sp * dt, y + 0.05, b.pos.z + Math.sin(a) * sp * dt, 0.22 * (1 - dt / life) + 0.05,
          [0xff3b00, 0xff8a00, 0xffd34d][i % 3], dt * 5, dt * 3);
      }
    } else if (b.kind === 'dust' || b.kind === 'bigdust') {
      const big = b.kind === 'bigdust', cnt = big ? 30 : 12, life = big ? 0.7 : 0.4;
      if (dt > life) continue;
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + r(), sp = (big ? 3.5 : 1.8) * (0.6 + r() * 0.6);
        const kk = easeOut(dt / life);
        put(b.pos.x + Math.cos(a) * sp * kk * life, b.pos.y + 0.1 + r() * 0.2 * kk, b.pos.z + Math.sin(a) * sp * kk * life,
          (big ? 0.3 : 0.16) * (1 - dt / life), 0xeeeeee, a, a);
      }
    } else if (b.kind === 'sparkle') {
      if (dt > 0.9) continue;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 + dt * 4, rad = 0.9 + 0.3 * Math.sin(i * 7.1);
        const y = (i % 6) * 0.45 * (0.4 + dt) + dt * 2;
        put(b.pos.x + Math.cos(a) * rad, b.pos.y + y, b.pos.z + Math.sin(a) * rad, 0.14 * (1 - dt / 0.9), i % 2 ? 0x8ff7ff : 0xffffff, a, dt * 6);
      }
    }
  }
  for (let i = n; i < MAXP; i++) { _m.makeScale(0, 0, 0); pMesh.setMatrixAt(i, _m); }
  pMesh.count = MAXP;
  pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;

  // confetti
  const dt = t - CONFETTI_T, r = rng(424242);
  for (let i = 0; i < 420; i++) {
    const vx = (r() - 0.5) * 9, vz = (r() - 0.5) * 9, vy = 6 + r() * 7, delay = r() * 0.9, spin = 3 + r() * 8, col = PALETTE[Math.floor(r() * PALETTE.length)];
    const d = dt - delay;
    if (d < 0) { _m.makeScale(0, 0, 0); confMesh.setMatrixAt(i, _m); confMesh.setColorAt(i, _c.set(col)); continue; }
    // fast rise then gentle flutter down
    const rise = Math.min(d, 0.55);
    let x = 28.95 + vx * rise, z = vz * rise, y = 9.5 + vy * rise - 6 * rise * rise;
    const fall = Math.max(0, d - 0.55);
    y -= 1.6 * fall; x += Math.sin(fall * 3 + i) * 0.4 + vx * 0.08 * fall; z += Math.cos(fall * 2.5 + i) * 0.4;
    _e.set(d * spin, d * spin * 0.7, i); _q.setFromEuler(_e); _s.set(1, 1, 1);
    _m.compose(v3(x, y, z), _q, _s); confMesh.setMatrixAt(i, _m); confMesh.setColorAt(i, _c.set(col));
  }
  confMesh.instanceMatrix.needsUpdate = true; if (confMesh.instanceColor) confMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- camera
const head = (st) => st.pos.clone().add(v3(0, 1.3, 0));
const SHOTS = [
  { t0: 0, t1: 3, f: (t, k) => [lerpV(v3(4.2, 2.6, 7.5), v3(2.2, 2.2, 5.2), ease(k)), v3(0, 1.5, 0)] },
  { t0: 3, t1: 5, f: (t, k) => { const e = ease(k); return [lerpV(v3(1, 3, 9), v3(21, 9.5, 16), e), lerpV(v3(0, 1.5, 0), v3(29, 7.2, 0), e)]; } },
  { t0: 5, t1: 7, f: (t, k) => [lerpV(v3(3.2, 3.2, 9), v3(2.6, 2.8, 7.4), ease(k)), v3(0.6, 1.8, 0)] },
  { t0: 7, t1: 9.6, f: (t, k, s) => { const l = head(s.pro).add(v3(0, 0.9, 0)); return [l.clone().add(v3(-2.5, 1.6, 10.5)), l]; } },
  { t0: 9.6, t1: 11.95, f: (t, k, s) => { const l = head(s.tim); l.y = Math.max(l.y, 1.6); return [l.clone().add(v3(-1.6, 2.4, 8)), l]; } },
  { t0: 11.95, t1: 12.4, f: () => [v3(1.4, 2.0, 4.6), v3(0, 1.4, 0)] },
  { t0: 12.4, t1: 13.8, shake: 0.08, f: (t, k, s) => { const l = head(s.tim); l.y = Math.max(l.y, 1.2); return [l.clone().add(v3(-1.2, 2.0, 6)), l]; } },
  { t0: 13.8, t1: 15.0, f: (t, k) => [lerpV(v3(1.1, 2.4, 4.6), v3(0.45, 2.3, 3.3), easeOut(k)), v3(0, 2.0, 0)] },
  { t0: 15.0, t1: 18.6, f: (t, k, s) => { const l = head(s.tim).add(v3(2.2, 0.6, 0)); return [l.clone().add(v3(-1.5, 3, 11.5)), l]; } },
  { t0: 18.6, t1: 20.7, f: (t, k) => [lerpV(v3(27.6, 8.0, 11.0), v3(27.9, 6.8, 12.0), ease(k)), lerpV(v3(24.4, 5.6, 0), v3(25.4, 2.8, 0), ease(clamp((k - 0.3) / 0.6)))] },
  { t0: 20.7, t1: 24.7, f: (t, k, s) => {
      const l = head(s.tim).add(v3(0, 0.6, 0));
      const a = -0.32 + 0.35 * ease(clamp((t - 21.7) / 3)), d = lerp(8, 6.2, ease(clamp((t - 21.7) / 3)));
      return [l.clone().add(v3(Math.sin(a) * d, 1.4, Math.cos(a) * d)), l];
    } },
  { t0: 24.7, t1: 26.7, f: (t, k) => [lerpV(v3(2.6, 2.4, 6.2), v3(2.0, 2.2, 5.0), ease(k)), v3(0, 1.3, 0)] },
  { t0: 26.7, t1: 99, f: (t, k) => { const e = ease(clamp((t - 26.7) / 2.4)); return [lerpV(v3(2.0, 2.2, 5.0), v3(8, 14, 30), e), lerpV(v3(0, 1.3, 0), v3(15, 4.5, 0), e)]; } },
];
function setCamera(t, states) {
  const sh = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const k = clamp((t - sh.t0) / (sh.t1 - sh.t0));
  const [pos, look] = sh.f(t, k, states);
  // gentle handheld drift + optional shake
  const amp = 0.04 + (sh.shake || 0);
  pos.add(v3(Math.sin(t * 1.3) * amp, Math.sin(t * 1.7 + 1) * amp, 0));
  if (sh.shake) look.add(v3(Math.sin(t * 41) * sh.shake, Math.cos(t * 37) * sh.shake, 0));
  camera.position.copy(pos); camera.lookAt(look);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- 2D overlay
const FONT = (px, w = 900) => `${w} ${px}px "Inter", "Inter Display", sans-serif`;
const BUBBLES = [
  { who: 'tim', t0: 0.6, t1: 2.7, text: 'hi guys!! my first obby' },
  { who: 'pro', t0: 5.8, t1: 7.0, text: 'watch and learn, noob' },
  { who: 'tim', t0: 10.85, t1: 11.55, text: 'AAAAAA', shout: true },
  { who: 'tim', t0: 14.05, t1: 15.0, text: 'ok. one more try.' },
  { who: 'pro', t0: 16.4, t1: 17.9, text: "lol ur never making it" },
  { who: 'pro', t0: 18.55, t1: 19.35, text: 'wait WHAT', shout: true },
  { who: 'pro', t0: 19.4, t1: 20.5, text: 'NOOOOO', shout: true },
  { who: 'pro', t0: 25.25, t1: 26.7, text: '...attempt 2' },
];
const CAPTIONS = [
  { t0: 0.15, t1: 2.9, text: 'POV: your first obby' },
  { t0: 3.1, t1: 4.95, text: 'reach the trophy = WIN' },
];
const COUNTERS = [
  { t0: 11.45, t1: 12.4, n: 1 }, { t0: 12.4, t1: 12.75, n: 7 }, { t0: 12.75, t1: 13.1, n: 18 },
  { t0: 13.1, t1: 13.45, n: 31 }, { t0: 13.45, t1: 13.8, n: 46 }, { t0: 13.8, t1: 15.0, n: 47, big: true },
];

function wrapLines(text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; }
  lines.push(cur); return lines;
}
function popScale(t, t0, t1) {
  const a = clamp((t - t0) / 0.2), b = clamp((t1 - t) / 0.12);
  return { s: easeOutBack(a) * (0.6 + 0.4 * b), alpha: Math.min(1, a * 3) * b };
}
function strokeText(text, x, y, px, fill = '#fff', stroke = '#111', sw = 0.16) {
  ctx.font = FONT(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = px * sw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function project(p) { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 }; }

function drawBubble(b, t, states) {
  const { s, alpha } = popScale(t, b.t0, b.t1);
  if (alpha <= 0) return;
  const st = states[b.who];
  const anchor = project(st.pos.clone().add(v3(0, 3.0, 0)));
  const px = b.shout ? 76 : 54;
  ctx.font = FONT(px, b.shout ? 900 : 800);
  const lines = wrapLines(b.text, 700);
  const lw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bw = lw + 70, bh = lines.length * px * 1.15 + 44;
  let cx = clamp(anchor.x, bw / 2 + 40, W - bw / 2 - 40);
  let cy = clamp(anchor.y - bh / 2 - 60, bh / 2 + 470, H - bh / 2 - 380);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(anchor.x, anchor.y); ctx.scale(s, s); ctx.translate(-anchor.x, -anchor.y);
  const col = b.who === 'pro' ? '#1d1d22' : '#ffffff', txt = b.who === 'pro' ? '#39ff88' : '#14161c';
  ctx.fillStyle = col; ctx.strokeStyle = b.who === 'pro' ? '#39ff88' : '#14161c'; ctx.lineWidth = 7;
  // tail
  const tx = clamp(anchor.x, cx - bw / 2 + 50, cx + bw / 2 - 50);
  ctx.beginPath(); ctx.moveTo(tx - 26, cy + bh / 2 - 4); ctx.lineTo(anchor.x, Math.max(anchor.y - 8, cy + bh / 2 + 20)); ctx.lineTo(tx + 26, cy + bh / 2 - 4); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 34); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx - 22, cy + bh / 2 - 3.5); ctx.lineTo(tx + 22, cy + bh / 2 - 3.5); ctx.lineWidth = 9; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = txt; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const jitter = b.shout ? Math.sin(t * 60) * 4 : 0;
  lines.forEach((l, i) => ctx.fillText(l, cx + jitter, cy - (lines.length - 1) * px * 0.575 + i * px * 1.15));
  ctx.restore();
}

function drawTrophyIcon(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#ffc928'; ctx.strokeStyle = '#111'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-40, -50); ctx.lineTo(40, -50); ctx.quadraticCurveTo(40, 10, 0, 18); ctx.quadraticCurveTo(-40, 10, -40, -50); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-44, -28, 16, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(44, -28, 16, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
  ctx.fillRect(-8, 16, 16, 20); ctx.strokeRect(-8, 16, 16, 20);
  ctx.fillRect(-28, 36, 56, 14); ctx.strokeRect(-28, 36, 56, 14);
  ctx.restore();
}

function drawOverlay(t, states) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(renderer.domElement, 0, 0);

  // subtle vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // red pulse during failure montage
  if (t > 11.4 && t < 13.8) {
    const a = 0.18 + 0.12 * Math.sin(t * 25);
    const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
    rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, `rgba(220,0,0,${a})`);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  for (const c of CAPTIONS) {
    const { s, alpha } = popScale(t, c.t0, c.t1); if (alpha <= 0) continue;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, 330); ctx.scale(s, s);
    ctx.font = FONT(88); const lines = wrapLines(c.text, 900);
    lines.forEach((l, i) => strokeText(l, 0, (i - (lines.length - 1) / 2) * 100, 88));
    if (c.text.includes('trophy')) drawTrophyIcon(0, 150, 1.1);
    ctx.restore();
  }

  for (const c of COUNTERS) {
    if (t < c.t0 || t >= c.t1) continue;
    const k = clamp((t - c.t0) / 0.15), sc = (c.big ? 1.35 : 1) * (1.6 - 0.6 * easeOut(k));
    ctx.save(); ctx.translate(W / 2 + (c.big ? 0 : Math.sin(t * 50) * 6), c.big ? 300 : 360); ctx.scale(sc, sc); ctx.rotate(c.big ? -0.04 : 0.03 * Math.sin(c.n));
    strokeText('ATTEMPT', 0, -62, 54, '#ffffff');
    strokeText(String(c.n), 0, 22, 120, c.big ? '#ffd93d' : '#ff4d4d', '#111', 0.14);
    ctx.restore();
  }

  for (const b of BUBBLES) drawBubble(b, t, states);

  // YOU WIN banner
  if (t > 21.9 && t < 24.6) {
    const { s, alpha } = popScale(t, 21.9, 24.6);
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, 1380); ctx.scale(s * (1 + 0.04 * Math.sin(t * 9)), s * (1 + 0.04 * Math.sin(t * 9))); ctx.rotate(-0.05);
    ctx.font = FONT(170);
    const g = ctx.createLinearGradient(0, -90, 0, 90); g.addColorStop(0, '#fff6a8'); g.addColorStop(0.5, '#ffc928'); g.addColorStop(1, '#ff8a00');
    strokeText('YOU WIN!', 0, 0, 170, g, '#3a1d00', 0.14);
    ctx.restore();
  }

  // end card
  if (t > 26.9) {
    const k = clamp((t - 26.9) / 0.4);
    ctx.fillStyle = `rgba(10,12,30,${0.45 * k})`; ctx.fillRect(0, 0, W, H);
    const a = popScale(t, 26.95, 99), b = popScale(t, 27.6, 99), c = popScale(t, 28.2, 99);
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.translate(W / 2, 760); ctx.scale(a.s, a.s); ctx.rotate(-0.04);
    strokeText('NEVER', 0, -95, 150, '#ffffff'); strokeText('GIVE UP', 0, 70, 150, '#ffd93d');
    ctx.restore();
    ctx.save(); ctx.globalAlpha = b.alpha; ctx.translate(W / 2, 1090); ctx.scale(b.s, b.s);
    strokeText('part 2?', 0, 0, 92, '#39ff88');
    ctx.restore();
    ctx.save(); ctx.globalAlpha = c.alpha; ctx.translate(W / 2, 1230 + 10 * Math.sin(t * 6)); ctx.scale(c.s, c.s);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(40, -30); ctx.lineTo(40, 0); ctx.lineTo(70, 0); ctx.lineTo(0, 60); ctx.lineTo(-70, 0); ctx.lineTo(-40, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // white flash on hard cuts / respawns
  for (const ft of [5.0, 11.95, 13.8, 24.7]) {
    const d = t - ft; if (d >= 0 && d < 0.18) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - d / 0.18)})`; ctx.fillRect(0, 0, W, H); }
  }
}

// ---------------------------------------------------------------- frame
window.renderFrame = (t) => {
  const states = { tim: charState(TIM, t), pro: charState(PRO, t) };
  applyPose(tim, states.tim, t, faceAt(TIM_FACE, t));
  applyPose(pro, states.pro, t, faceAt(PRO_FACE, t));

  // trophy: on pedestal, then lifted above Tim's head
  if (t < 21.7) {
    trophy.position.copy(PEDESTAL).add(v3(0, 0.45 + 0.1 * Math.sin(t * 3), 0));
    trophy.rotation.set(0, t * 1.5, 0);
  } else {
    tim.root.updateMatrixWorld(true);
    const hands = tim.root.localToWorld(v3(0, 3.05 + tim.body.position.y, 0.1));
    const k = ease(clamp((t - 21.7) / 0.25));
    trophy.position.copy(lerpV(PEDESTAL.clone().add(v3(0, 0.45, 0)), hands, k));
    trophy.rotation.set(0, lerp(21.7 * 1.5, -0.3 + Math.PI * 4, k) + (t - 21.95) * 0.5 * k, 0);
    trophy.scale.setScalar(lerp(1, 1.3, k));
  }
  trophyGlow.position.copy(trophy.position).add(v3(0, 0.6, 0.6));

  lavaMat.uniforms.uTime.value = t;
  updateParticles(t);
  // keep the shadow camera centred on the action
  const focus = t < 9.6 && t > 7 ? states.pro.pos : states.tim.pos.y > -10 ? states.tim.pos : v3(0, 0, 0);
  sun.target.position.set(clamp(focus.x, 0, 28), 0, 0); sun.position.copy(sun.target.position).add(v3(-12, 30, 18));

  setCamera(t, states);
  renderer.render(scene, camera);
  drawOverlay(t, states);
  return out.toDataURL('image/jpeg', 0.93);
};

// timeline events for the sound track
window.getEvents = () => {
  const ev = [];
  for (const [who, track] of [['tim', TIM], ['pro', PRO]]) {
    for (const s of track) {
      if (s.k === 'jump' && !s.drop) ev.push({ t: s.t0, type: 'jump', who });
      if (s.k === 'jump' && s.land) ev.push({ t: s.t1, type: s.drop ? 'thud' : 'land', who });
      if (s.k === 'jump' && s.drop) ev.push({ t: s.t0, type: 'fallwhistle', who, dur: s.t1 - s.t0 });
      if (s.k === 'sink') ev.push({ t: s.t0, type: 'splash', who });
      if (s.spawn) ev.push({ t: s.t0, type: 'respawn', who });
      if (s.k === 'walk') ev.push({ t: s.t0, type: 'steps', who, dur: s.t1 - s.t0 });
    }
  }
  for (const b of BUBBLES) ev.push({ t: b.t0, type: 'voice', who: b.who, dur: b.t1 - b.t0 - 0.1, shout: !!b.shout, text: b.text });
  for (const c of COUNTERS) ev.push({ t: c.t0, type: c.big ? 'counterbig' : 'counter' });
  for (const c of CAPTIONS) ev.push({ t: c.t0, type: 'pop' });
  ev.push({ t: 3.0, type: 'whoosh' }, { t: 18.6, type: 'whoosh' });
  ev.push({ t: 21.7, type: 'pickup' }, { t: CONFETTI_T, type: 'confetti' }, { t: 21.9, type: 'win' });
  ev.push({ t: 26.95, type: 'sting' }, { t: 27.6, type: 'pop' }, { t: 28.2, type: 'pop' });
  return ev.sort((a, b) => a.t - b.t);
};

window.DURATION = DURATION;
document.fonts.load(FONT(40)).then(() => { window.READY = true; });
