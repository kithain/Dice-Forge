// Production par défaut, y compris dans le cockpit local.
// En local uniquement, ?environment=test active la recette pour cet onglet.
(() => {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
  const requested = new URLSearchParams(window.location.search).get('environment');
  let test = false;
  if (local) {
    try {
      if (requested === 'test' || requested === 'production') {
        sessionStorage.setItem('diceforge.environment', requested);
      }
      test = sessionStorage.getItem('diceforge.environment') === 'test';
    } catch {
      test = requested === 'test';
    }
  }
  window.SUPABASE_CONFIG = test ? {
    environmentName: 'base test',
    characterV2: true,
    url: 'https://edmojqwjfyzeyewhkeah.supabase.co',
    anonKey: 'sb_publishable_0HuoQkBao3jODyPfPCOqjA_GVB7bpjy'
  } : {
    characterV2: true,
    url: 'https://bwrylcvkplonkfhnegvm.supabase.co',
    anonKey: 'sb_publishable_kbh44y1DNbegyIesbosYHw_x8Apqlyt'
  };
})();
