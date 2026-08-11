import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

let sharedClient = null;
let sharedConfigKey = '';

export function supabaseConfiguration() {
  const url = String(window.SUPABASE_CONFIG?.url || '').trim();
  const anonKey = String(window.SUPABASE_CONFIG?.anonKey || '').trim();
  const configured = Boolean(
    url
    && anonKey
    && !url.includes('VOTRE_PROJET')
    && !anonKey.includes('VOTRE_CLE')
  );
  return { url, anonKey, configured };
}

export function getSupabaseClient({ optional = false } = {}) {
  const config = supabaseConfiguration();
  if (!config.configured) {
    if (optional) return null;
    throw new Error('Supabase n’est pas configuré.');
  }

  const configKey = `${config.url}\n${config.anonKey}`;
  if (!sharedClient || sharedConfigKey !== configKey) {
    sharedClient = createClient(config.url, config.anonKey);
    sharedConfigKey = configKey;
  }
  return sharedClient;
}
