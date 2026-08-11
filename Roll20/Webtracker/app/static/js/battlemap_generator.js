// Générateur procédural de cartes raster pour la Battle Map Dice Forge.
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const dialog = $('map-generator');
    const canvas = $('generator-canvas');
    if (!dialog || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    const controls = {
        cols: $('generator-cols'), rows: $('generator-rows'), cell: $('generator-cell'),
        density: $('generator-density'), seed: $('generator-seed'), grid: $('generator-grid'),
    };
    let theme = 'dungeon';
    let hasGenerated = false;

    const themeNames = { dungeon: 'Donjon', forest: 'Forêt', cavern: 'Caverne', ruins: 'Ruines' };
    const palettes = {
        dungeon: { void: '#111413', floor: '#5b5b54', floor2: '#66665e', line: '#373a36', wall: '#272b28', edge: '#aaa28d' },
        forest: { ground: '#51613b', light: '#65744a', dark: '#34442d', path: '#8a7757', path2: '#a08c68', tree: '#243b27', leaf: '#3b5c34' },
        cavern: { void: '#151618', floor: '#555148', floor2: '#625d52', wall: '#292b2b', water: '#284654', glow: '#70a4a0' },
        ruins: { ground: '#6f674d', light: '#81775a', wall: '#4e4a3b', edge: '#b1a27b', rubble: '#383a32', moss: '#46543a' },
    };

    function hashSeed(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function randomFactory(seedText) {
        let a = hashSeed(seedText) || 1;
        return () => {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const pick = (rng, values) => values[Math.floor(rng() * values.length)];
    const between = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
    const clampInt = (element, min, max) => Math.max(min, Math.min(max, Number.parseInt(element.value, 10) || min));

    function fillNoise(rng, base, fleck, amount, width, height) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < amount; i += 1) {
            const radius = between(rng, 2, 14);
            ctx.fillStyle = fleck;
            ctx.beginPath();
            ctx.arc(rng() * width, rng() * height, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawGrid(cols, rows, cell, color = 'rgba(20,20,18,.28)') {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, cell / 45);
        ctx.beginPath();
        for (let x = 0; x <= cols; x += 1) { ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, rows * cell); }
        for (let y = 0; y <= rows; y += 1) { ctx.moveTo(0, y * cell); ctx.lineTo(cols * cell, y * cell); }
        ctx.stroke();
        ctx.restore();
    }

    function renderDungeon(rng, cols, rows, cell, density) {
        const p = palettes.dungeon;
        fillNoise(rng, p.void, '#353a35', Math.floor(cols * rows * 1.6), cols * cell, rows * cell);
        const tiles = Array.from({ length: rows }, () => Array(cols).fill(0));
        const rooms = [];
        const target = Math.round(4 + density * 8);

        for (let attempt = 0; attempt < target * 18 && rooms.length < target; attempt += 1) {
            const w = between(rng, 4, Math.min(10, cols - 4));
            const h = between(rng, 4, Math.min(9, rows - 4));
            const x = between(rng, 2, Math.max(2, cols - w - 2));
            const y = between(rng, 2, Math.max(2, rows - h - 2));
            if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
            rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
            for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) tiles[yy][xx] = 1;
        }
        rooms.sort((a, b) => a.cx - b.cx);
        for (let i = 1; i < rooms.length; i += 1) {
            let x = rooms[i - 1].cx; let y = rooms[i - 1].cy;
            const end = rooms[i];
            const horizontalFirst = rng() > 0.5;
            const carveX = () => { while (x !== end.cx) { tiles[y][x] = 1; x += Math.sign(end.cx - x); tiles[y][x] = 1; } };
            const carveY = () => { while (y !== end.cy) { tiles[y][x] = 1; y += Math.sign(end.cy - y); tiles[y][x] = 1; } };
            if (horizontalFirst) { carveX(); carveY(); } else { carveY(); carveX(); }
        }

        for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
            if (!tiles[y][x]) continue;
            ctx.fillStyle = (x + y) % 3 ? p.floor : p.floor2;
            ctx.fillRect(x * cell, y * cell, cell, cell);
            ctx.strokeStyle = p.line; ctx.lineWidth = 1;
            ctx.strokeRect(x * cell + .5, y * cell + .5, cell - 1, cell - 1);
        }
        ctx.lineWidth = Math.max(5, cell * .13); ctx.strokeStyle = p.wall; ctx.lineCap = 'square';
        for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
            if (!tiles[y][x]) continue;
            const left = x === 0 || !tiles[y][x - 1], right = x === cols - 1 || !tiles[y][x + 1];
            const top = y === 0 || !tiles[y - 1][x], bottom = y === rows - 1 || !tiles[y + 1][x];
            ctx.beginPath();
            if (top) { ctx.moveTo(x * cell, y * cell); ctx.lineTo((x + 1) * cell, y * cell); }
            if (right) { ctx.moveTo((x + 1) * cell, y * cell); ctx.lineTo((x + 1) * cell, (y + 1) * cell); }
            if (bottom) { ctx.moveTo((x + 1) * cell, (y + 1) * cell); ctx.lineTo(x * cell, (y + 1) * cell); }
            if (left) { ctx.moveTo(x * cell, (y + 1) * cell); ctx.lineTo(x * cell, y * cell); }
            ctx.stroke();
        }
        ctx.lineWidth = 2; ctx.strokeStyle = p.edge;
        rooms.forEach((r) => ctx.strokeRect(r.x * cell + 5, r.y * cell + 5, r.w * cell - 10, r.h * cell - 10));
        rooms.slice(1).forEach((r) => {
            if (rng() > .55) return;
            ctx.fillStyle = '#56392b'; ctx.fillRect((r.cx - .28) * cell, (r.y + .12) * cell, cell * .56, cell * .18);
            ctx.strokeStyle = '#b78b50'; ctx.strokeRect((r.cx - .28) * cell, (r.y + .12) * cell, cell * .56, cell * .18);
        });
    }

    function renderForest(rng, cols, rows, cell, density) {
        const p = palettes.forest; const width = cols * cell; const height = rows * cell;
        fillNoise(rng, p.ground, p.light, Math.floor(cols * rows * 5), width, height);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const path = new Path2D();
        path.moveTo(-cell, height * (.25 + rng() * .5));
        const points = [];
        for (let x = -cell; x <= width + cell; x += cell * 3) points.push([x, height * (.2 + rng() * .6)]);
        points.forEach(([x, y]) => path.lineTo(x, y));
        ctx.strokeStyle = p.path; ctx.lineWidth = cell * 2.1; ctx.stroke(path);
        ctx.strokeStyle = p.path2; ctx.lineWidth = cell * 1.55; ctx.stroke(path);

        const count = Math.floor(cols * rows * (.08 + density * .2));
        for (let i = 0; i < count; i += 1) {
            const x = rng() * width; const y = rng() * height;
            if (ctx.isPointInStroke(path, x, y)) continue;
            const radius = cell * (.22 + rng() * .25);
            ctx.fillStyle = '#352c20'; ctx.beginPath(); ctx.arc(x + radius * .12, y + radius * .18, radius * .42, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = rng() > .45 ? p.tree : p.leaf;
            for (let n = 0; n < 5; n += 1) { const a = n * 1.256 + rng() * .4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * radius * .35, y + Math.sin(a) * radius * .35, radius * .7, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = '#607342'; ctx.beginPath(); ctx.arc(x - radius * .22, y - radius * .25, radius * .34, 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < Math.floor(cols * rows * .018); i += 1) {
            const x = rng() * width; const y = rng() * height; const r = cell * (.12 + rng() * .18);
            ctx.fillStyle = '#77766b'; ctx.beginPath(); ctx.ellipse(x, y, r, r * .65, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
    }

    function renderCavern(rng, cols, rows, cell, density) {
        const p = palettes.cavern; const width = cols * cell; const height = rows * cell;
        const cave = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => x < 2 || y < 2 || x > cols - 3 || y > rows - 3 || rng() < .37 + density * .16 ? 1 : 0));
        for (let step = 0; step < 5; step += 1) {
            const next = cave.map((row) => [...row]);
            for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) {
                let walls = 0;
                for (let yy = -1; yy <= 1; yy += 1) for (let xx = -1; xx <= 1; xx += 1) if ((xx || yy) && cave[y + yy][x + xx]) walls += 1;
                next[y][x] = walls >= 5 ? 1 : 0;
            }
            for (let y = 0; y < rows; y += 1) cave[y] = next[y];
        }
        fillNoise(rng, p.void, '#303337', cols * rows, width, height);
        for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) if (!cave[y][x]) {
            ctx.fillStyle = rng() > .2 ? p.floor : p.floor2; ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
        }
        ctx.strokeStyle = p.wall; ctx.lineWidth = cell * .18;
        for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) if (!cave[y][x]) {
            if (cave[y - 1][x]) { ctx.beginPath(); ctx.moveTo(x * cell, y * cell); ctx.lineTo((x + 1) * cell, y * cell); ctx.stroke(); }
            if (cave[y][x - 1]) { ctx.beginPath(); ctx.moveTo(x * cell, y * cell); ctx.lineTo(x * cell, (y + 1) * cell); ctx.stroke(); }
        }
        for (let i = 0; i < Math.floor(cols * rows * .016); i += 1) {
            const x = between(rng, 2, cols - 3), y = between(rng, 2, rows - 3);
            if (cave[y][x]) continue;
            const r = cell * (.3 + rng() * .7); ctx.fillStyle = p.water; ctx.beginPath(); ctx.ellipse(x * cell, y * cell, r * 1.8, r, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = p.glow; ctx.globalAlpha = .35; ctx.stroke(); ctx.globalAlpha = 1;
        }
    }

    function renderRuins(rng, cols, rows, cell, density) {
        const p = palettes.ruins; const width = cols * cell; const height = rows * cell;
        fillNoise(rng, p.ground, p.light, cols * rows * 3, width, height);
        const buildings = [];
        const count = Math.round(4 + density * 7);
        for (let i = 0; i < count; i += 1) {
            const w = between(rng, 4, 9), h = between(rng, 4, 8), x = between(rng, 1, Math.max(1, cols - w - 1)), y = between(rng, 1, Math.max(1, rows - h - 1));
            if (buildings.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
            buildings.push({ x, y, w, h });
        }
        buildings.forEach((r) => {
            ctx.fillStyle = '#777057'; ctx.fillRect(r.x * cell, r.y * cell, r.w * cell, r.h * cell);
            ctx.strokeStyle = p.wall; ctx.lineWidth = cell * .2; ctx.setLineDash([cell * (1 + rng()), cell * (.15 + rng() * .6)]);
            ctx.strokeRect(r.x * cell, r.y * cell, r.w * cell, r.h * cell); ctx.setLineDash([]);
            ctx.strokeStyle = p.edge; ctx.lineWidth = 2; ctx.strokeRect(r.x * cell + cell * .12, r.y * cell + cell * .12, r.w * cell - cell * .24, r.h * cell - cell * .24);
            const rubble = Math.round((r.w + r.h) * density);
            for (let n = 0; n < rubble; n += 1) {
                const x = (r.x + rng() * r.w) * cell, y = (r.y + rng() * r.h) * cell, s = cell * (.07 + rng() * .13);
                ctx.fillStyle = pick(rng, [p.rubble, p.wall, p.moss]); ctx.fillRect(x, y, s, s * (.5 + rng()));
            }
        });
        ctx.strokeStyle = '#917e58'; ctx.lineWidth = cell * .55; ctx.setLineDash([cell * .25, cell * .12]);
        ctx.beginPath(); ctx.moveTo(0, height * .75); ctx.bezierCurveTo(width * .25, height * .55, width * .65, height * .85, width, height * .45); ctx.stroke(); ctx.setLineDash([]);
    }

    function getOptions() {
        return {
            cols: clampInt(controls.cols, 16, 60), rows: clampInt(controls.rows, 12, 50),
            cell: clampInt(controls.cell, 30, 80), density: clampInt(controls.density, 20, 90) / 100,
            seed: controls.seed.value.trim() || 'forge-001', grid: controls.grid.checked,
        };
    }

    function setStatus(message, type = '') {
        const status = $('generator-status'); status.textContent = message; status.className = type;
    }

    function generate() {
        const o = getOptions(); const width = o.cols * o.cell; const height = o.rows * o.cell;
        if (width > 4096 || height > 4096) {
            setStatus('Réduisez les dimensions : la résolution maximale est de 4096 px par côté.', 'error'); return;
        }
        canvas.width = width; canvas.height = height;
        const rng = randomFactory(`${o.seed}:${theme}:${o.cols}x${o.rows}:${o.density}`);
        if (theme === 'dungeon') renderDungeon(rng, o.cols, o.rows, o.cell, o.density);
        else if (theme === 'forest') renderForest(rng, o.cols, o.rows, o.cell, o.density);
        else if (theme === 'cavern') renderCavern(rng, o.cols, o.rows, o.cell, o.density);
        else renderRuins(rng, o.cols, o.rows, o.cell, o.density);
        if (o.grid) drawGrid(o.cols, o.rows, o.cell, theme === 'cavern' ? 'rgba(225,230,220,.16)' : 'rgba(20,20,18,.25)');
        $('generator-map-name').textContent = `${themeNames[theme]} · ${o.seed}`;
        $('generator-resolution').textContent = `${width} × ${height} px · ${o.cols} × ${o.rows} cases`;
        $('generator-empty').hidden = true; hasGenerated = true;
        setStatus('Aperçu généré — la même graine recréera cette carte.');
    }

    function canvasBlob() {
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Export PNG impossible.')), 'image/png'));
    }

    async function uploadGeneratedMap() {
        if (!hasGenerated) generate();
        if (!hasGenerated) return;
        const button = $('use-map-btn'); button.disabled = true; setStatus('Envoi de la carte au webtracker…');
        try {
            const blob = await canvasBlob(); const form = new FormData();
            form.append('map', blob, `battlemap-${theme}-${getOptions().seed.replace(/[^a-z0-9_-]+/gi, '-')}.png`);
            const response = await fetch('/api/battlemap/map', { method: 'POST', body: form });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Import impossible.');
            const toolbarStatus = $('map-upload-status');
            if (toolbarStatus) { toolbarStatus.textContent = 'Carte générée et synchronisée.'; toolbarStatus.className = 'success'; }
            setStatus('Carte active et synchronisée avec la vue OBS.', 'success');
            window.setTimeout(() => dialog.close(), 650);
        } catch (error) { setStatus(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    $('open-generator-btn').addEventListener('click', () => { dialog.showModal(); if (!hasGenerated) window.requestAnimationFrame(generate); });
    $('close-generator-btn').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    $('generator-themes').addEventListener('click', (event) => {
        const card = event.target.closest('[data-theme]'); if (!card) return;
        theme = card.dataset.theme; document.querySelectorAll('.theme-card').forEach((item) => item.classList.toggle('active', item === card)); generate();
    });
    controls.cell.addEventListener('input', () => { $('generator-cell-output').textContent = `${controls.cell.value} px`; });
    controls.density.addEventListener('input', () => { $('generator-density-output').textContent = `${controls.density.value} %`; });
    $('random-seed-btn').addEventListener('click', () => { controls.seed.value = `forge-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6)}`; generate(); });
    $('generate-map-btn').addEventListener('click', generate);
    $('download-map-btn').addEventListener('click', async () => {
        if (!hasGenerated) generate(); if (!hasGenerated) return;
        const blob = await canvasBlob(); const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = `battlemap-${theme}-${getOptions().seed}.png`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    $('use-map-btn').addEventListener('click', uploadGeneratedMap);
})();
