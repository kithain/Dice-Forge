// ——— 2D SVG dice shapes + rendering ———

export const SHAPES = {
  4: {
    stroke: '#c9a227', outline: '50,8 90,85 10,85',
    faces: [{ pts: '50,8 90,85 10,85', shade: 0.55 }],
    edges: ['50,8 50,85'], center: { x: 50, y: 60 }
  },
  6: {
    stroke: '#c9a227', outline: '50,8 78,24 78,66 50,82 22,66 22,24',
    faces: [
      { pts: '50,8 78,24 50,40 22,24', shade: 0.95 },
      { pts: '22,24 50,40 50,82 22,66', shade: 0.55 },
      { pts: '78,24 50,40 50,82 78,66', shade: 0.3 },
    ],
    edges: [], center: { x: 50, y: 52 }
  },
  8: {
    stroke: '#a855f7', outline: '50,5 95,50 50,95 5,50',
    faces: [
      { pts: '50,5 95,50 5,50', shade: 0.75 },
      { pts: '50,95 95,50 5,50', shade: 0.4 },
    ],
    edges: ['50,5 50,95'], center: { x: 50, y: 54 }
  },
  10: {
    stroke: '#a855f7', outline: '50,6 89,41 74,90 26,90 11,41',
    faces: [
      { pts: '50,6 89,41 50,48 11,41', shade: 0.75 },
      { pts: '89,41 74,90 50,48', shade: 0.5 },
      { pts: '74,90 26,90 50,48', shade: 0.3 },
      { pts: '26,90 11,41 50,48', shade: 0.5 },
    ],
    edges: [], center: { x: 50, y: 52 }
  },
  12: {
    stroke: '#c9a227', outline: '50,5 93,36 76,87 24,87 7,36',
    faces: [
      { pts: '50,5 93,36 50,50 7,36', shade: 0.75 },
      { pts: '93,36 76,87 50,50', shade: 0.5 },
      { pts: '76,87 24,87 50,50', shade: 0.3 },
      { pts: '24,87 7,36 50,50', shade: 0.5 },
    ],
    edges: [], center: { x: 50, y: 52 }
  },
  20: {
    stroke: '#c9a227', outline: '50,5 95,82 5,82',
    faces: [
      { pts: '50,5 72,44 50,56', shade: 0.7 },
      { pts: '50,5 50,56 28,44', shade: 0.8 },
      { pts: '72,44 95,82 50,82', shade: 0.45 },
      { pts: '28,44 5,82 50,82', shade: 0.55 },
      { pts: '72,44 50,82 50,56', shade: 0.5 },
      { pts: '28,44 50,56 50,82', shade: 0.4 },
    ],
    edges: [], center: { x: 50, y: 54 }
  },
};
// D100 shares the same decahedron silhouette as D10
SHAPES[100] = SHAPES[10];

let svgIdCt = 0;

function shadeFill(shade, state) {
  let r, g, b;
  if (state === 's-crit') { r = Math.round(25 + shade * 35); g = Math.round(18 + shade * 28); b = Math.round(8 + shade * 15); }
  else if (state === 's-fail') { r = Math.round(28 + shade * 30); g = Math.round(10 + shade * 12); b = Math.round(12 + shade * 18); }
  else if (state === 'rolling') { r = Math.round(15 + shade * 18); g = Math.round(10 + shade * 14); b = Math.round(35 + shade * 50); }
  else { r = Math.round(10 + shade * 20); g = Math.round(10 + shade * 20); b = Math.round(35 + shade * 55); }
  return `rgb(${r},${g},${b})`;
}

export function makeSVG(type, val, state, size) {
  const s = SHAPES[type];
  let stroke = s.stroke;
  if (state === 'rolling') stroke = '#a855f7';
  if (state === 's-crit') stroke = '#fbbf24';
  if (state === 's-fail') stroke = '#dc2626';
  const gid = 'dg' + (++svgIdCt);

  let faces = '';
  s.faces.forEach(f => {
    faces += `<polygon points="${f.pts}" fill="${shadeFill(f.shade, state)}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>`;
  });

  let edges = '';
  (s.edges || []).forEach(e => {
    const p = e.match(/\d+/g);
    edges += `<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="${stroke}" stroke-width=".8" opacity=".35"/>`;
  });

  let outline = '';
  if (s.outline)
    outline = `<polygon points="${s.outline}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>`;

  const dispVal = val === null ? '' : (type === 100 && val === 100 ? '00' : type === 100 && val < 10 ? '0' + val : val);
  const fs = String(dispVal).length >= 3 ? 18 : String(dispVal).length >= 2 ? 24 : 28;
  let tc = '#ede0c8';
  if (state === 's-crit') tc = '#fbbf24';
  if (state === 's-fail') tc = '#ef4444';
  if (state === 'rolling') tc = '#c084fc';
  const c = s.center || { x: 50, y: 54 };

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="${gid}" cx="36%" cy="20%" r="58%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient></defs>
    ${faces}${edges}${outline}
    <rect x="0" y="0" width="100" height="100" fill="url(#${gid})" pointer-events="none"/>
    <text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="middle"
      font-family="Cinzel,serif" font-size="${fs}" font-weight="700"
      fill="${tc}">${dispVal}</text>
  </svg>`;
}
