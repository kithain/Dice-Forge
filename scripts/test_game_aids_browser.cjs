// Local rendering regression. All remote requests are blocked; no campaign writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.argv[3];
const pages = ['aides-jeu.html', 'livret_joueur.html', 'livret_reference.html',
  'ecran_joueur_BRP_ORC.html', 'ecran_MJ_BRP_ORC.html', 'inventaire.html', 'help.html', 'BRP_ORC_traduction_FR_complete.html'];
const server = http.createServer((req, res) => {
  const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const type = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
  fs.readFile(filename, (error, body) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': type[path.extname(filename)] || 'application/octet-stream' });
    res.end(error ? 'Not found' : body);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath: process.env.DF_TEST_BROWSER_EXECUTABLE }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/js/auth-guard.js') return route.fulfill({ contentType: 'application/javascript', body: 'document.documentElement.classList.remove("auth-pending");' });
      if (url.pathname === '/js/supabase-client.js') return route.fulfill({ contentType: 'application/javascript', body: 'export function getSupabaseClient(){return null;}' });
      if (url.pathname === '/js/dice3d-box.js') return route.fulfill({ contentType: 'application/javascript', body: 'export function init(){}' });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const name of pages) {
      await page.goto(base + '/' + name, { waitUntil: 'networkidle' });
      await page.locator('.aid-controls').waitFor();
      const links = await page.locator('.aid-outline a').evaluateAll(nodes => nodes.map(a => a.hash));
      assert(links.length > 1, `${name}: outline available`);
      assert(await page.evaluate(ids => ids.every(id => document.getElementById(decodeURIComponent(id.slice(1)))), links), `${name}: anchors resolve`);
      // A search must retain the whole printable document.
      const before = await page.locator('[data-aid-content]').innerText();
      await page.locator('#aid-query').fill('zzzz-no-match');
      await page.waitForTimeout(200);
      assert.match(await page.locator('.aid-search-results').innerText(), /0 rubrique/);
      assert.equal(await page.locator('[data-aid-content]').innerText(), before);
      await page.locator('#aid-query').fill('');
      if (name === 'livret_reference.html') {
        await page.locator('#aid-query').fill('alchIMie');
        await page.waitForTimeout(200);
        assert(await page.locator('.aid-search-results li').count() > 0);
        await page.locator('#aid-query').fill('');
      }
      if (output && name !== 'BRP_ORC_traduction_FR_complete.html') {
        await page.screenshot({ path: path.join(output, name.replace('.html', '.png')), fullPage: name === 'aides-jeu.html' });
        const closed = await page.locator('[data-aid-content] details:not([open])').count();
        await page.pdf({ path: path.join(output, name.replace('.html', '.pdf')), preferCSSPageSize: true, printBackground: true });
        assert.equal(await page.locator('[data-aid-content] details:not([open])').count(), closed, 'Restore collapsed details after print');
      }
      if (output && name === 'BRP_ORC_traduction_FR_complete.html' && process.env.DF_TEST_RULES_PDF) {
        await page.pdf({ path: path.join(output, 'regles-annexe-verification.pdf'), pageRanges: '1-12', preferCSSPageSize: true, printBackground: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.right > innerWidth + 2 && r.width > 0 && !['TD','TH','TR','TBODY','THEAD'].includes(e.tagName);
      }).slice(0, 8).map(e => `${e.tagName}.${e.className}: ${Math.round(e.getBoundingClientRect().right)}`));
      const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth,
        elements: [...document.querySelectorAll('[data-aid-content] *')].filter(e => e.scrollWidth > e.clientWidth + 5 && getComputedStyle(e).overflowX === 'visible').slice(0,8).map(e => `${e.tagName}.${e.className} ${e.scrollWidth}/${e.clientWidth}`) }));
      assert(width.page <= width.viewport + 2, `${name}: mobile overflow ${JSON.stringify(width)} ${overflow.join(', ')}`);
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    // Exercise the actual sheet-to-preview export rather than only an artificial payload.
    await page.goto(base + '/pj.html', { waitUntil: 'networkidle' });
    await page.locator('[data-field="name"]').fill('Élaria · exemple');
    await page.evaluate(() => {
      document.querySelectorAll('[data-stat]').forEach(input => { input.value = '13'; });
      document.querySelector('[data-field="profession"]').value = 'Sorcier';
      document.querySelector('[data-field="player"]').value = 'Joueur exemple';
      document.querySelector('[data-field="race"]').value = 'Humain';
    });
    await page.locator('[data-field="notes"]').fill('NOTE-DE-FIN\nUne fiche de démonstration pour vérifier la pagination.');
    await page.evaluate(() => localStorage.setItem('dice-forge.inventory.v1:local', JSON.stringify({ characterName: 'Élaria', wallet: { po: 12, pa: 0, pc: 4 }, equipment: [{ name: 'Corde', description: '15 mètres' }], potions: [{ name: 'Soin', carried: 2, stock: 3, effect: 'EFFET-POTION', backlash: 'CONTRECOUP-POTION' }] })));
    await page.locator('#pj-pdf').click();
    await page.waitForURL('**/pj-print.html');
    await page.locator('.print-page').first().waitFor();
    assert.equal(await page.locator('#print-pdf').isEnabled(), true);
    assert.match(await page.locator('#print-sheet').innerText(), /EFFET-POTION/);
    assert.match(await page.locator('#print-sheet').innerText(), /CONTRECOUP-POTION/);
    assert.match(await page.locator('#print-sheet').innerText(), /NOTE-DE-FIN/);
    const snapshot = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dice-forge.pj-print.v1')));
    assert.equal(snapshot.printVersion, 2);
    const savedDraft = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('dice-forge.pj-markdown.'))
      .map(key => JSON.parse(localStorage.getItem(key))).find(data => data.fields?.name === 'Élaria · exemple'));
    assert.match(savedDraft.fields.notes, /NOTE-DE-FIN/, 'Export preserves the latest local draft');
    assert(snapshot.skillGroups.reduce((count, group) => count + group.skills.length, 0) > 30);
    snapshot.creation = { phase: 'play' };
    snapshot.spells = Array.from({ length: 11 }, (_, index) => ({ name: `Sort ${index + 1}`, points: 32, checked: index === 10, allocation: { base: 0, score: 32, xp_points: 3 } }));
    snapshot.fields.origin = '<img src=x onerror="window.__injected=true">';
    snapshot.stats.apparence = '';
    await page.evaluate(value => sessionStorage.setItem('dice-forge.pj-print.v1', JSON.stringify(value)), snapshot);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('img').count(), 0, 'Escape character text');
    assert.match(await page.locator('#print-sheet').innerText(), /Sort 11/);
    assert.match(await page.locator('#print-sheet').innerText(), /35 %/);
    assert.equal(await page.locator('.print-page').count(), 4);
    const sameName = structuredClone(snapshot);
    sameName.printVersion = 2;
    sameName.spells[0].name = 'Vol';
    await page.evaluate(value => sessionStorage.setItem('dice-forge.pj-print.v1', JSON.stringify(value)), sameName);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('td:first-child').filter({ hasText: /^Vol$/ }).count(), 2, 'A spell name cannot hide a skill with the same name');
    await page.evaluate(value => sessionStorage.setItem('dice-forge.pj-print.v1', JSON.stringify(value)), { ...snapshot, printVersion: 2 });
    await page.reload({ waitUntil: 'networkidle' });
    if (output) {
      await page.screenshot({ path: path.join(output, 'fiche-exemple.png'), fullPage: true });
      await page.pdf({ path: path.join(output, 'fiche-exemple.pdf'), preferCSSPageSize: true, printBackground: true });
    }
    // Long notes and inventory rows must flow to extra pages, without truncation.
    const long = structuredClone(snapshot);
    long.fields.notes = ('Une longue note de campagne.\n').repeat(150) + 'FIN-NOTES-LONGUES';
    long.printInventory.equipment = Array.from({ length: 70 }, (_, index) => ({ name: `Objet ${index + 1}`, description: 'Description longue à conserver sur le PDF.' }));
    long.printInventory.potions[0].backlash = ('Un contrecoup détaillé à conserver.\n').repeat(80) + 'FIN-CONTRECOUP-LONG';
    await page.evaluate(value => sessionStorage.setItem('dice-forge.pj-print.v1', JSON.stringify(value)), long);
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('#print-sheet').innerText(), /FIN-NOTES-LONGUES/);
    assert.match(await page.locator('#print-sheet').innerText(), /FIN-CONTRECOUP-LONG/);
    if (output) await page.pdf({ path: path.join(output, 'fiche-longue-verification.pdf'), preferCSSPageSize: true, printBackground: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Preview mobile overflow');
    await page.evaluate(() => sessionStorage.setItem('dice-forge.pj-print.v1', 'broken'));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#print-pdf').isDisabled(), true, 'Broken snapshot cannot be printed');
    assert.match(await page.locator('.print-empty').innerText(), /illisible/);
    assert.deepEqual(errors, []);
    console.log('Aides et PDF : navigation, recherche, mobile, export réel, inventaire, sorts et données invalides vérifiés.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
