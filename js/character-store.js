// Compatibility boundary: screens keep their form shape, persistence uses campaign IDs.
// Disabling the server switch returns every operation to the untouched legacy tables.
export function characterDraftKey() {
  if (!globalThis.window?.SUPABASE_CONFIG?.characterV2) return 'dice-forge.pj-markdown.v1';
  try {
    const room = JSON.parse(localStorage.getItem('diceforge_room'));
    return `dice-forge.pj-markdown.v2:${room?.userId || 'local'}:${room?.code || 'local'}`;
  } catch { return 'dice-forge.pj-markdown.v2:local'; }
}

export function campaignClient(client, roomProvider) {
  const resources = new Set(['personnages', 'pj_sheets', 'pj_inventory']);
  return new Proxy(client, {
    get(target, property) {
      if (property !== 'from') {
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return resource => {
        if (!resources.has(resource)) return target.from(resource);
        const steps = [];
        let filters = {}, operation = 'read', payload = null, single = false, maximum = null, sorting = null;
        const builder = {
          select(...args) { steps.push(['select', args]); return this; },
          eq(key, value) { filters[key] = value; steps.push(['eq', [key, value]]); return this; },
          order(key, options = {}) { sorting = { key, ...options }; steps.push(['order', [key, options]]); return this; },
          limit(value) { maximum = value; steps.push(['limit', [value]]); return this; },
          maybeSingle() { single = 'maybe'; steps.push(['maybeSingle', []]); return this; },
          single() { single = 'required'; steps.push(['single', []]); return this; },
          update(value) { operation = 'update'; payload = value; steps.push(['update', [value]]); return this; },
          insert(value) { operation = 'insert'; payload = value; steps.push(['insert', [value]]); return this; },
          upsert(value, options) { operation = 'upsert'; payload = value; steps.push(['upsert', [value, options]]); return this; },
          then(resolve, reject) { return this.execute().then(resolve, reject); },
          async execute() {
            const context = roomProvider() || {};
            if (payload?.sheet_data?.revision && !payload.expected_revision) {
              payload = { ...payload, expected_revision: payload.sheet_data.revision };
            }
            const result = await target.rpc('df_character_query', {
              p_resource: resource, p_operation: operation, p_filters: filters,
              p_payload: payload, p_room: filters.room_code || payload?.room_code || context.code || null
            });
            if (result.error) return result;
            if (result.data?.legacy) {
              let query = target.from(resource);
              for (const [method, args] of steps) {
                const legacyArgs = [...args];
                if (['insert', 'update', 'upsert'].includes(method)) {
                  const clean = value => {
                    const { expected_revision, ...legacyPayload } = value;
                    return legacyPayload;
                  };
                  legacyArgs[0] = Array.isArray(args[0]) ? args[0].map(clean) : clean(args[0]);
                }
                query = query[method](...legacyArgs);
              }
              return await query;
            }
            let rows = result.data?.rows || [];
            if (sorting) rows.sort((a, b) => {
              const direction = sorting.ascending === false ? -1 : 1;
              return direction * (a[sorting.key] < b[sorting.key] ? -1 : a[sorting.key] > b[sorting.key] ? 1 : 0);
            });
            if (maximum !== null) rows = rows.slice(0, maximum);
            if (single && (rows.length > 1 || (single === 'required' && !rows.length))) {
              return { data: null, error: { code: 'PGRST116', message: 'Plusieurs personnages correspondent : sélectionnez une fiche.' } };
            }
            return { data: single ? rows[0] || null : rows, error: null };
          }
        };
        return builder;
      };
    }
  });
}
