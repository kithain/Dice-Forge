// ——— 3D dice rendering (Three.js) ———
import * as THREE from 'three';

let scene, cam, rend, canvas, container;
let dice = []; let rafId = null; let onDone = null; let ready = false;

function init() {
  if (ready) return; ready = true;
  container = document.getElementById('dice-3d-container');
  canvas = document.getElementById('dice-3d-canvas');
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  cam.position.set(0, 7, 11); cam.lookAt(0, 0, 0);
  rend = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  rend.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.add(new THREE.AmbientLight(0x555577, 0.7));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(5, 12, 8); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xa855f7, 0.5); d2.position.set(-6, 4, -5); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xc9a227, 0.3); d3.position.set(0, -5, 5); scene.add(d3);
}

function faceTex(num, type) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#0d0d28'; x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(90, 70, 10, 128, 128, 200);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(201,162,39,0.25)'; x.lineWidth = 3; x.strokeRect(10, 10, 236, 236);
  const dn = type === 100 && num === 100 ? '00' : type === 100 && num < 10 ? '0' + num : '' + num;
  const fs = dn.length >= 3 ? 80 : dn.length >= 2 ? 110 : 130;
  x.font = `bold ${fs}px Cinzel,serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ede0c8'; x.fillText(dn, 128, 140);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

function trapezo(n = 5) {
  const g = new THREE.BufferGeometry();
  const pos = [[0, 1.3, 0]];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pos.push([Math.cos(a) * .85, .35, Math.sin(a) * .85]); }
  for (let i = 0; i < n; i++) { const a = (i + .5) / n * Math.PI * 2; pos.push([Math.cos(a) * .85, -.35, Math.sin(a) * .85]); }
  pos.push([0, -1.3, 0]);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const ui = 1 + i, ui2 = 1 + (i + 1) % n, li = 1 + n + i, li2 = 1 + n + (i + 1) % n;
    idx.push(0, li, ui, 0, ui2, li);
    idx.push(2 * n + 1, li, ui2, 2 * n + 1, ui2, li2);
    g.addGroup(i * 12, 6, i);
    g.addGroup(i * 12 + 6, 6, n + i);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
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

function faceInfo(geo) {
  const pos = geo.attributes.position, faces = [];
  if (geo.index && geo.groups.length) {
    const ind = geo.index;
    for (const g of geo.groups) {
      const a = ind.getX(g.start), b = ind.getX(g.start + 1), c = ind.getX(g.start + 2);
      const va = new THREE.Vector3().fromBufferAttribute(pos, a);
      const vb = new THREE.Vector3().fromBufferAttribute(pos, b);
      const vc = new THREE.Vector3().fromBufferAttribute(pos, c);
      const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
      faces.push({ normal: n, matIdx: g.materialIndex });
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

function makeDie(type) {
  const geo = makeGeo(type), fi = faceInfo(geo), nF = fi.length, mats = [], vals = [];
  for (let i = 0; i < nF; i++) {
    const v = i + 1; vals.push(v);
    mats.push(new THREE.MeshStandardMaterial({
      map: faceTex(v, type), color: 0x1a1a3f, metalness: 0.35, roughness: 0.45, flatShading: true
    }));
  }
  const m = new THREE.Mesh(geo, mats);
  m.userData = { type, faceInfo: fi, faceVals: vals };
  return m;
}

function targetQuat(die, value) {
  const { faceInfo, faceVals } = die.userData;
  const idx = faceVals.indexOf(value);
  if (idx < 0) return new THREE.Quaternion();
  const fn = faceInfo[idx].normal.clone();
  const camDir = new THREE.Vector3(0, 0.8, 0.6).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(fn, camDir);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(camDir, (Math.random() - 0.5) * 0.6));
  return q;
}

export function roll(groups, duration, callback) {
  init();
  dice.forEach(d => {
    scene.remove(d); d.geometry.dispose();
    if (Array.isArray(d.material)) d.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
  dice = []; onDone = callback;
  let count = 0; groups.forEach(g => count += g.rolls.length);
  const sp = Math.min(2.8, 18 / Math.max(count, 1));
  let di = 0;
  groups.forEach(g => {
    g.rolls.forEach(r => {
      const m = makeDie(g.type);
      m.position.set((di - (count - 1) / 2) * sp, 0, 0);
      m.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      m.userData.avel = new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25);
      m.userData.targetVal = r.finalVal !== undefined ? r.finalVal : r.val;
      m.userData.sQ = null; m.userData.tQ = null;
      scene.add(m); dice.push(m); di++;
    });
  });
  const width = Math.max(count * sp + 2, 8);
  cam.position.set(0, 7, Math.max(11, width * 0.9)); cam.lookAt(0, 0, 0);
  container.style.display = 'flex';
  const w = container.clientWidth || 600, h = container.clientHeight || 280;
  rend.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  const start = performance.now();
  loop(start, duration);
}

function loop(start, dur) {
  const el = performance.now() - start, t = Math.min(el / dur, 1);
  if (t >= 1) {
    dice.forEach(d => { d.position.y = 0; });
    rend.render(scene, cam);
    rafId = null; if (onDone) { const cb = onDone; onDone = null; cb(); } return;
  }
  rafId = requestAnimationFrame(() => loop(start, dur));
  if (t < 0.7) {
    const decay = 1 - Math.pow(t / 0.7, 1.5);
    dice.forEach(d => {
      const av = d.userData.avel;
      d.rotation.x += av.x * 0.016 * decay;
      d.rotation.y += av.y * 0.016 * decay;
      d.rotation.z += av.z * 0.016 * decay;
      d.position.y = Math.abs(Math.sin(el * 0.008 + d.id)) * 0.6 * decay;
    });
  } else if (t < 1) {
    const st = (t - 0.7) / 0.3, ease = 1 - Math.pow(1 - st, 3);
    dice.forEach(d => {
      if (!d.userData.tQ) {
        d.userData.sQ = d.quaternion.clone();
        d.userData.tQ = targetQuat(d, d.userData.targetVal);
      }
      d.quaternion.slerpQuaternions(d.userData.sQ, d.userData.tQ, ease);
      d.position.y *= (1 - ease);
    });
  }
  rend.render(scene, cam);
}

export function hide() { if (container) container.style.display = 'none'; }

export function dispose() {
  if (rafId) cancelAnimationFrame(rafId);
  dice.forEach(d => {
    scene.remove(d); d.geometry.dispose();
    if (Array.isArray(d.material)) d.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
  dice = [];
}

export function isReady() { return ready; }

window.addEventListener('resize', () => {
  if (!ready || !container || container.style.display === 'none') return;
  const w = container.clientWidth, h = container.clientHeight;
  rend.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
});
