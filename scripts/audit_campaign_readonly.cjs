// Read-only campaign audit through the installed Obsidian plugin's protected session.
// No token or password is exported. Output must stay outside the Git checkout.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const vault = path.resolve(process.argv[2] || '');
const output = path.resolve(process.argv[3] || '');
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/audit_campaign_readonly.cjs <vault> <private-output-directory>');
const root = path.resolve(__dirname, '..');
if (output === root || output.startsWith(root + path.sep)) throw new Error('Keep private exports outside the repository.');
const obsidian = {
  Plugin: class {}, ItemView: class {}, MarkdownRenderChild: class {},
  PluginSettingTab: class {}, Setting: class {}, TFile: class {}, Notice: class {},
  normalizePath: value => value.replace(/\\/g, '/'),
  requestUrl: async options => {
    const response = await fetch(options.url, { method: options.method, headers: options.headers,
      body: options.body, signal: AbortSignal.timeout(30000) });
    return { status: response.status, json: await response.json() };
  }
};
const context = { module: { exports: {} }, require: name => name === 'obsidian' ? obsidian : require(name),
  process, URLSearchParams, console: { warn() {}, error() {} } };
const pluginDirectory = path.join(vault, '.obsidian/plugins/jdr-supabase-pj');
vm.runInNewContext(fs.readFileSync(path.join(pluginDirectory, 'main.js'), 'utf8'), context);
const plugin = new context.module.exports();
plugin.settings = JSON.parse(fs.readFileSync(path.join(pluginDirectory, 'data.json'), 'utf8'));
plugin.app = { vault: { adapter: { getBasePath: () => vault } } };
(async () => {
  plugin.restoreSession();
  const sheets = await plugin.fetchSheets();
  const allowed = new Set(sheets.map(row => row.character_id || row.user_id));
  const characters = (await plugin.fetchCharacters()).filter(row => allowed.has(row.character_id || row.user_id));
  const inventory = (await plugin.apiSelect('pj_inventory', {})).filter(row => allowed.has(row.character_id || row.user_id));
  const rooms = await plugin.apiSelect('rooms', { select: 'room_code,owner_id,owner_name,created_at', order: 'created_at.asc' });
  const links = [];
  for (const room of rooms) {
    const previous = plugin.settings.roomCode;
    try {
      plugin.settings.roomCode = room.room_code;
      const rows = await plugin.fetchSheets();
      const campaigns = [...new Set(rows.map(row => row.campaign_id).filter(Boolean))];
      links.push({ room_code: room.room_code, created_at: room.created_at, owner_id: room.owner_id, campaign_ids: campaigns, selected_sheets: rows.length, mapping_verified: campaigns.length > 0 });
    } finally { plugin.settings.roomCode = previous; }
  }
  const snapshot = { captured_at: new Date().toISOString(), room: plugin.settings.roomCode,
    source: 'live RPC, MJ protected session', rooms: links, personnages: characters, pj_sheets: sheets, pj_inventory: inventory };
  fs.mkdirSync(output, { recursive: true });
  const destination = path.join(output, 'campaign-live.json');
  if (fs.existsSync(destination)) throw new Error('Use a new output directory to preserve earlier evidence.');
  fs.writeFileSync(destination, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ file: destination, room: snapshot.room,
    characters: characters.length, sheets: sheets.length, inventory: inventory.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
