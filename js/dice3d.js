// 3D dice rendering (Three.js).
import * as THREE from 'three';

let scene, cam, rend, canvas, container;
let dice = [];
let rafId = null;
let onDone = null;
let ready = false;

const STYLE_BY_TYPE = {
  4: { base: '#100d20', mid: '#302342', high: '#7d6637', accent: '#c9a227', text: '#fff0c2', material: 0x2b2140, emissive: 0x261634 },
  6: { base: '#0e1224', mid: '#24364d', high: '#5f728a', accent: '#d8b95e', text: '#fff4c8', material: 0x1f2c42, emissive: 0x101d32 },
  8: { base: '#100d2a', mid: '#392263', high: '#7753a8', accent: '#c084fc', text: '#f4ddff', material: 0x34205c, emissive: 0x261046 },
  10: { base: '#111027', mid: '#30265b', high: '#6c4f93', accent: '#a855f7', text: '#f2ddff', material: 0x33225a, emissive: 0x250e46 },
  12: { base: '#11121e', mid: '#333045', high: '#8d7040', accent: '#e1bd62', text: '#fff0c2', material: 0x343047, emissive: 0x2a1f28 },
  20: { base: '#0b1021', mid: '#2e294d', high: '#8a6e36', accent: '#f0c766', text: '#fff0bd', material: 0x30284a, emissive: 0x2f2114 },
  100: { base: '#111027', mid: '#30265b', high: '#6c4f93', accent: '#a855f7', text: '#f2ddff', material: 0x33225a, emissive: 0x250e46 }
};

function init() {
  if (ready) return;
  ready = true;

  container = document.getElementById('dice-3d-container');
  canvas = document.getElementById('dice-3d-canvas');
  scene = new THREE.Scene();

  cam = new THREE.PerspectiveCamera(38, 2, 0.1, 100);
  cam.position.set(0, 6.5, 10.5);
  cam.lookAt(0, 0, 0);

  rend = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  rend.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rend.outputColorSpace = THREE.SRGBColorSpace;
  rend.toneMapping = THREE.ACESFilmicToneMapping;
  rend.toneMappingExposure = 1.2;

  scene.add(new THREE.HemisphereLight(0xffefd2, 0x080518, 0.55));

  const key = new THREE.DirectionalLight(0xfff2cf, 1.4);
  key.position.set(5.5, 10, 7);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa855f7, 0.82);
  fill.position.set(-7, 4, -5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x7dd3fc, 0.45);
  rim.position.set(0, 5, -9);
  scene.add(rim);

  const goldGlow = new THREE.PointLight(0xf0c766, 1.4, 18);
  goldGlow.position.set(0, 3.2, 4.2);
  scene.add(goldGlow);

  const purpleGlow = new THREE.PointLight(0x8b5cf6, 1.1, 16);
  purpleGlow.position.set(-4.5, 1.8, 2);
  scene.add(purpleGlow);
}

function styleFor(type) {
  return STYLE_BY_TYPE[type] || STYLE_BY_TYPE[20];
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function faceLabel(num, type) {
  if (type === 100) return num === 100 ? '00' : String(num).padStart(2, '0');
  return String(num);
}

function drawTextureNoise(x, rng, count, w, h) {
  for (let i = 0; i < count; i++) {
    const px = rng() * w;
    const py = rng() * h;
    const r = 0.6 + rng() * 1.8;
    const light = rng() > 0.55 ? 255 : 0;
    x.fillStyle = `rgba(${light},${light},${light},${0.018 + rng() * 0.045})`;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
}

function drawRunes(x, style) {
  x.save();
  x.translate(256, 256);
  x.strokeStyle = style.accent;
  x.fillStyle = style.accent;
  x.globalAlpha = 0.38;
  x.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    x.rotate(Math.PI / 4);
    x.beginPath();
    x.moveTo(0, -188);
    x.lineTo(8, -174);
    x.lineTo(-8, -174);
    x.closePath();
    x.stroke();
    x.fillRect(-2, -214, 4, 18);
  }
  x.restore();
}

function faceTex(num, type, faceIndex = 0) {
  const style = styleFor(type);
  const label = faceLabel(num, type);
  const rng = makeRng(type * 997 + faceIndex * 53 + num * 17);

  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');

  const base = x.createLinearGradient(0, 0, 512, 512);
  base.addColorStop(0, style.high);
  base.addColorStop(0.32, style.mid);
  base.addColorStop(1, style.base);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);

  const glow = x.createRadialGradient(150, 110, 20, 240, 230, 410);
  glow.addColorStop(0, 'rgba(255,255,255,0.26)');
  glow.addColorStop(0.46, 'rgba(255,255,255,0.06)');
  glow.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = glow;
  x.fillRect(0, 0, 512, 512);

  drawTextureNoise(x, rng, 260, 512, 512);

  x.strokeStyle = 'rgba(255,246,210,0.2)';
  x.lineWidth = 8;
  x.strokeRect(24, 24, 464, 464);
  x.strokeStyle = style.accent;
  x.globalAlpha = 0.46;
  x.lineWidth = 3;
  x.strokeRect(42, 42, 428, 428);
  x.globalAlpha = 1;

  x.save();
  x.strokeStyle = 'rgba(255,246,210,0.12)';
  x.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const sx = 60 + rng() * 390;
    const sy = 60 + rng() * 390;
    x.beginPath();
    x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + rng() * 42 - 21, sy + rng() * 52 - 26, sx + rng() * 90 - 45, sy + rng() * 90 - 45);
    x.stroke();
  }
  x.restore();

  drawRunes(x, style);

  const fs = label.length >= 3 ? 142 : label.length >= 2 ? 178 : 214;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `900 ${fs}px Cinzel, Georgia, serif`;
  x.lineJoin = 'round';
  x.shadowColor = 'rgba(0,0,0,0.75)';
  x.shadowBlur = 18;
  x.shadowOffsetY = 10;
  x.strokeStyle = 'rgba(0,0,0,0.78)';
  x.lineWidth = 20;
  x.strokeText(label, 256, 276);
  x.shadowBlur = 0;
  x.shadowOffsetY = 0;
  x.strokeStyle = style.accent;
  x.lineWidth = 8;
  x.strokeText(label, 256, 276);
  x.fillStyle = style.text;
  x.fillText(label, 256, 276);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.font = `900 ${Math.floor(fs * 0.96)}px Cinzel, Georgia, serif`;
  x.fillText(label, 254, 268);

  const b = document.createElement('canvas');
  b.width = b.height = 512;
  const bx = b.getContext('2d');
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, 512, 512);
  drawTextureNoise(bx, makeRng(type * 661 + faceIndex * 31), 340, 512, 512);
  bx.strokeStyle = '#b5b5b5';
  bx.lineWidth = 9;
  bx.strokeRect(24, 24, 464, 464);
  bx.font = `900 ${fs}px Cinzel, Georgia, serif`;
  bx.textAlign = 'center';
  bx.textBaseline = 'middle';
  bx.strokeStyle = '#303030';
  bx.lineWidth = 18;
  bx.strokeText(label, 256, 276);
  bx.fillStyle = '#1f1f1f';
  bx.fillText(label, 256, 276);

  const color = new THREE.CanvasTexture(c);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 8;

  const bump = new THREE.CanvasTexture(b);
  bump.anisotropy = 4;

  return { color, bump };
}

function trapezo(n = 5) {
  const g = new THREE.BufferGeometry();

  const tipY = 1.15;    // hauteur des pointes
  const beltY = 0.32;   // hauteur des anneaux centraux
  const radius = 1.0;   // largeur du dé

  const pos = [[0, tipY, 0]];

  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    pos.push([Math.cos(a) * radius, beltY, Math.sin(a) * radius]);
  }

  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    pos.push([Math.cos(a) * radius, -beltY, Math.sin(a) * radius]);
  }

  pos.push([0, -tipY, 0]);

  const idx = [];
  for (let i = 0; i < n; i++) {
    const ui = 1 + i;
    const ui2 = 1 + (i + 1) % n;
    const li = 1 + n + i;
    const li2 = 1 + n + (i + 1) % n;
    idx.push(0, li, ui, 0, ui2, li);
    idx.push(2 * n + 1, li, ui2, 2 * n + 1, ui2, li2);
    g.addGroup(i * 12, 6, i);
    g.addGroup(i * 12 + 6, 6, n + i);
  }

  const uv = pos.map(([x, y, z]) => [0.5 + x * 0.42, 0.5 - z * 0.42]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function makeGeo(type) {
  const r = 1;
  if (type === 4) return new THREE.TetrahedronGeometry(r * 1.2, 0);
  if (type === 6) return new THREE.BoxGeometry(r * 1.5, r * 1.5, r * 1.5);
  if (type === 8) return new THREE.OctahedronGeometry(r * 1.1, 0);
  if (type === 10 || type === 100) return trapezo(5);
  if (type === 12) return new THREE.DodecahedronGeometry(r, 0);
  if (type === 20) return new THREE.IcosahedronGeometry(r, 0);
  return new THREE.BoxGeometry(r, r, r);
}

function ensureUv(geo) {
  if (geo.attributes.uv) return geo;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const yRange = Math.max(0.001, box.max.y - box.min.y);
  const pos = geo.attributes.position;
  const uv = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = 0.5 + Math.atan2(z, x) / (Math.PI * 2);
    const v = (y - box.min.y) / yRange;
    uv.push(u, v);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function faceInfo(geo) {
  const pos = geo.attributes.position;
  const faces = [];
  if (geo.index && geo.groups.length) {
    const ind = geo.index;
    for (const group of geo.groups) {
      const a = ind.getX(group.start);
      const b = ind.getX(group.start + 1);
      const c = ind.getX(group.start + 2);
      const va = new THREE.Vector3().fromBufferAttribute(pos, a);
      const vb = new THREE.Vector3().fromBufferAttribute(pos, b);
      const vc = new THREE.Vector3().fromBufferAttribute(pos, c);
      const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
      faces.push({ normal: n, matIdx: group.materialIndex });
    }
  } else {
    const triCount = Math.floor(pos.count / 3);
    for (let i = 0; i < triCount; i++) {
      const va = new THREE.Vector3().fromBufferAttribute(pos, i * 3);
      const vb = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1);
      const vc = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2);
      const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
      faces.push({ normal: n, matIdx: i });
      geo.addGroup(i * 3, 3, i);
    }
  }
  return faces;
}

function valueForFace(type, index, faceCount) {
  if (type === 100) return ((index % 10) + 1) * 10;
  if (type === 12 && faceCount > 12) {
    return Math.floor(index / Math.max(1, Math.round(faceCount / 12))) % 12 + 1;
  }
  return index % type + 1;
}

function valueForTarget(type, value) {
  if (type === 100) return Math.min(100, Math.max(10, Math.ceil(value / 10) * 10));
  return value;
}

function disposeMaterial(material) {
  if (!material) return;
  ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'].forEach((key) => {
    if (material[key]) material[key].dispose();
  });
  material.dispose();
}

function disposeDie(die) {
  scene.remove(die);
  die.geometry.dispose();
  if (Array.isArray(die.material)) die.material.forEach(disposeMaterial);
  else disposeMaterial(die.material);
}

function makeDie(type) {
  const geo = ensureUv(makeGeo(type));
  const fi = faceInfo(geo);
  const nF = fi.length;
  const mats = [];
  const vals = [];
  const style = styleFor(type);

  for (let i = 0; i < nF; i++) {
    const v = valueForFace(type, i, nF);
    vals.push(v);
    const tex = faceTex(v, type, i);
    mats.push(new THREE.MeshStandardMaterial({
      map: tex.color,
      bumpMap: tex.bump,
      bumpScale: 0.055,
      color: 0xffffff,
      emissive: style.emissive,
      emissiveIntensity: 0.22,
      metalness: 0.28,
      roughness: 0.36,
      flatShading: true
    }));
  }

  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  m.userData = { type, faceInfo: fi, faceVals: vals, glowBase: type === 8 || type === 10 || type === 100 ? 0.16 : 0.1 };
  return m;
}

function targetQuat(die, value) {
  const { type, faceInfo, faceVals } = die.userData;
  const targetValue = valueForTarget(type, value);
  let idx = faceVals.indexOf(targetValue);
  if (idx < 0) idx = Math.abs((value || 1) - 1) % faceInfo.length;
  const fn = faceInfo[idx].normal.clone();
  const camDir = new THREE.Vector3(0, 0.78, 0.64).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(fn, camDir);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(camDir, (Math.random() - 0.5) * 0.48));
  return q;
}

export function roll(groups, duration, callback) {
  init();
  dice.forEach(disposeDie);
  dice = [];
  onDone = callback;

  let count = 0;
  groups.forEach(g => count += g.rolls.length);
  const sp = Math.min(2.8, 18 / Math.max(count, 1));
  let di = 0;

  groups.forEach(g => {
    g.rolls.forEach(r => {
      const m = makeDie(g.type);
      m.position.set((di - (count - 1) / 2) * sp, 0, 0);
      m.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      m.userData.avel = new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25);
      m.userData.targetVal = r.finalVal !== undefined ? r.finalVal : r.val;
      m.userData.sQ = null;
      m.userData.tQ = null;
      scene.add(m);
      dice.push(m);
      di++;
    });
  });

  const width = Math.max(count * sp + 2, 8);
  cam.position.set(0, 6.5, Math.max(10.5, width * 0.88));
  cam.lookAt(0, 0, 0);
  container.style.display = 'flex';
  const w = container.clientWidth || 600;
  const h = container.clientHeight || 280;
  rend.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  const start = performance.now();
  loop(start, duration);
}

function pulseMaterials(die, elapsed) {
  const pulse = die.userData.glowBase + Math.sin(elapsed * 0.006 + die.id) * 0.035;
  if (Array.isArray(die.material)) {
    die.material.forEach((m) => { m.emissiveIntensity = pulse; });
  }
}

function loop(start, dur) {
  const elapsed = performance.now() - start;
  const t = Math.min(elapsed / dur, 1);

  if (t >= 1) {
    dice.forEach(d => {
      d.position.y = 0;
      pulseMaterials(d, elapsed);
    });
    rend.render(scene, cam);
    rafId = null;
    if (onDone) {
      const cb = onDone;
      onDone = null;
      cb();
    }
    return;
  }

  rafId = requestAnimationFrame(() => loop(start, dur));
  if (t < 0.7) {
    const decay = 1 - Math.pow(t / 0.7, 1.5);
    dice.forEach(d => {
      const av = d.userData.avel;
      d.rotation.x += av.x * 0.016 * decay;
      d.rotation.y += av.y * 0.016 * decay;
      d.rotation.z += av.z * 0.016 * decay;
      d.position.y = Math.abs(Math.sin(elapsed * 0.008 + d.id)) * 0.72 * decay;
      pulseMaterials(d, elapsed);
    });
  } else {
    const st = (t - 0.7) / 0.3;
    const ease = 1 - Math.pow(1 - st, 3);
    dice.forEach(d => {
      if (!d.userData.tQ) {
        d.userData.sQ = d.quaternion.clone();
        d.userData.tQ = targetQuat(d, d.userData.targetVal);
      }
      d.quaternion.slerpQuaternions(d.userData.sQ, d.userData.tQ, ease);
      d.position.y *= (1 - ease);
      pulseMaterials(d, elapsed);
    });
  }

  rend.render(scene, cam);
}

export function hide() {
  if (container) container.style.display = 'none';
}

export function dispose() {
  if (rafId) cancelAnimationFrame(rafId);
  dice.forEach(disposeDie);
  dice = [];
}

export function isReady() {
  return ready;
}

window.addEventListener('resize', () => {
  if (!ready || !container || container.style.display === 'none') return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  rend.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
});
