export function renderReferences(workspace: HTMLElement): void {
  const references = [
    ['playerBook', 'Livret joueur', 'Règles essentielles et création'],
    ['equipment', 'Équipement', 'Armes, armures et matériel'],
    ['gmScreen', 'Écran MJ', 'Tables de référence du meneur'],
    ['playerScreen', 'Écran joueur', 'Tables utiles aux joueurs'],
    ['rules', 'Règles complètes', 'Traduction BRP-ORC'],
    ['help', 'Aide', 'Guide d’utilisation'],
  ];
  workspace.innerHTML = `<section class="tool-header"><div><p class="eyebrow">Bibliothèque</p><h1>Références BRP-ORC</h1><p>Documents conservés en lecture seule, sans exécuter l’ancien code applicatif.</p></div></section><section class="reference-grid">${references.map(([id, title, detail]) => `<a href="/references/${id}" target="_blank" rel="noopener"><strong>${title}</strong><span>${detail}</span></a>`).join('')}</section>`;
}
