import { createClient } from '@supabase/supabase-js';
import * as D3D from './dice3d-box.js?v=20260725-low-latency-obs';

const params = new URLSearchParams(window.location.search);
const room = (params.get('room') || params.get('code') || '').trim().toUpperCase();
const preview = params.get('bg') === '1' || params.get('preview') === '1';
const testMode = params.get('test') === '1';
const holdDuration = clampInt(params.get('hold'), 0, 10000, 400);

let supabase = null;
let subscription = null;
let animationActive = false;
const animationQueue = [];

if (preview) document.body.classList.add('preview');
boot();

async function boot() {
  await D3D.preload();
  if (testMode) {
    enqueueGroups([
      { type: 20, rolls: [{ val: 17, finalVal: 17 }] },
      { type: 6, rolls: [{ val: 4, finalVal: 4 }, { val: 6, finalVal: 6 }] }
    ]);
  }
  if (!room) return;

  const config = window.SUPABASE_CONFIG || {};
  if (!config.url || !config.anonKey || config.url.includes('VOTRE_PROJET')) {
    console.error('Supabase non configuré pour l’animation OBS.');
    return;
  }

  supabase = createClient(config.url, config.anonKey);
  subscription = supabase.channel(`obs-dice:${room}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'obs_rolls', filter: `room_code=eq.${room}` },
      payload => animateRoll(payload.new)
    )
    .subscribe();
}

function animateRoll(roll) {
  if (!roll || roll.is_hidden || isRoomCreation(roll)) return;
  const groups = groupsFromRoll(roll);
  if (groups.length) enqueueGroups(groups);
}

function groupsFromRoll(roll) {
  const expression = String(roll.expression || '');
  const values = Array.from(String(roll.rolls_detail || '').matchAll(/\[([^\]]+)\]/g))
    .flatMap(match => match[1].split(','))
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite);
  const definitions = Array.from(expression.matchAll(/(\d+)\s*d\s*(100|20|12|10|8|6|4)\b/gi))
    .map(match => ({ count: Math.max(1, Number.parseInt(match[1], 10)), type: Number.parseInt(match[2], 10) }));

  if (!definitions.length) {
    if (!values.length) return [];
    const percentile = values[0] === 0 ? 100 : Math.max(1, Math.min(100, values[0]));
    return [{ type: 100, rolls: [{ val: percentile, finalVal: percentile }] }];
  }

  let valueIndex = 0;
  const groups = [];
  for (const definition of definitions) {
    const rolls = [];
    for (let index = 0; index < definition.count; index += 1) {
      if (!Number.isFinite(values[valueIndex])) return [];
      const maximum = definition.type;
      const rawValue = values[valueIndex] === 0 && maximum === 100 ? 100 : values[valueIndex];
      const value = Math.max(1, Math.min(maximum, rawValue));
      rolls.push({ val: value, finalVal: value });
      valueIndex += 1;
    }
    groups.push({ type: definition.type, rolls });
  }
  return groups;
}

function enqueueGroups(groups) {
  animationQueue.push(groups);
  playNext();
}

function playNext() {
  if (animationActive || !animationQueue.length) return;
  animationActive = true;
  const groups = animationQueue.shift();
  D3D.roll(groups, 1800, () => {
    window.setTimeout(() => {
      D3D.hide();
      animationActive = false;
      playNext();
    }, holdDuration);
  });
}

function isRoomCreation(roll) {
  return roll?.expression === '— Partie créée —'
    || /Partie cr.+e/i.test(String(roll?.expression || ''));
}

function clampInt(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

window.addEventListener('beforeunload', () => {
  if (subscription) subscription.unsubscribe();
  D3D.dispose();
});
