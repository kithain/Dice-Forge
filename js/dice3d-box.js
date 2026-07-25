// Adapter for @3d-dice/dice-box-threejs — real physics 3D dice.
// Same interface as dice3d.js: roll(groups, duration, callback), hide(), dispose(), isReady().
// Uses dynamic import so CDN failure doesn't break the rest of the app.

let box = null;
let container = null;
let ready = false;
let initPromise = null;
let pendingCallback = null;
let fallbackTimer = null;

function forcedNotation(groups) {
  const diceParts = [];
  const forcedValues = [];

  groups.forEach(group => {
    if (group.type === 100) {
      // D100 = one tens die (10..90,00) plus one units die (1..9,0).
      const tensValues = [];
      const unitsValues = [];
      group.rolls.forEach(r => {
        const value = r.finalVal !== undefined ? r.finalVal : r.val;
        const v = Math.max(1, Math.min(100, value || 1));
        const tens = v === 100 ? 0 : Math.floor(v / 10) * 10;
        const units = v % 10;
        tensValues.push(tens);
        unitsValues.push(units);
      });
      diceParts.push(`${group.rolls.length}d100`, `${group.rolls.length}d10`);
      forcedValues.push(...tensValues, ...unitsValues);
    } else {
      const type = group.type;
      diceParts.push(`${group.rolls.length}d${type}`);
      group.rolls.forEach(r => {
        const value = r.finalVal !== undefined ? r.finalVal : r.val;
        forcedValues.push(Math.max(1, Math.min(type, value || 1)));
      });
    }
  });

  return `${diceParts.join('+')}@${forcedValues.join(',')}`;
}

async function init() {
  container = document.getElementById('dice-3d-container');
  if (!container) throw new Error('Conteneur #dice-3d-container introuvable');

  container.style.display = 'flex';

  if (ready) return;
  if (initPromise) {
    await initPromise;
    container.style.display = 'flex';
    return;
  }

  initPromise = (async () => {
    container.innerHTML = '';

    const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');

    box = new DiceBox('#dice-3d-container', {
      assetPath: 'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/public/',
      sounds: false,
      shadows: true,
      theme_surface: 'default',
      theme_material: 'glass',
      theme_colorset: 'white',
      gravity_multiplier: 400,
      light_intensity: 0.9,
      baseScale: 100,
      strength: 1,
      onRollComplete: () => {
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
        if (pendingCallback) {
          const cb = pendingCallback;
          pendingCallback = null;
          cb();
        }
      }
    });

    if (typeof box.initialize === 'function') {
      await box.initialize();
    }
    ready = true;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function roll(groups, duration, callback) {
  try {
    await init();
  } catch (err) {
    console.error('DiceBox init failed:', err);
    if (callback) callback();
    return;
  }

  const notation = forcedNotation(groups);
  console.log('[DiceBox] notation:', notation);

  pendingCallback = callback || null;

  // Fallback: si la physique ne se termine pas dans les temps, on déclenche le callback
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => {
    if (pendingCallback) {
      console.warn('[DiceBox] fallback timer triggered');
      const cb = pendingCallback;
      pendingCallback = null;
      cb();
    }
  }, Math.max((duration || 1800) + 400, 2200));

  try {
    box.roll(notation);
  } catch (err) {
    console.error('DiceBox roll error:', err);
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (pendingCallback) {
      const cb = pendingCallback;
      pendingCallback = null;
      cb();
    }
  }
}

export function hide() {
  if (container) container.style.display = 'none';
}

export async function preload() {
  try {
    await init();
    hide();
    return true;
  } catch (error) {
    console.error('DiceBox preload failed:', error);
    return false;
  }
}

export function dispose() {
  if (container) container.innerHTML = '';
  box = null;
  ready = false;
  initPromise = null;
}

export function isReady() {
  return ready;
}
