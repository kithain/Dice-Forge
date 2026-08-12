# Dice Forge V2

Nouvelle base autonome de Dice Forge, écrite en TypeScript côté client et serveur.

## Principes

- aucune dépendance à Flask ou Python ;
- aucun outil chargé dans une iframe ;
- une seule source de vérité pour la session joueur/room ;
- contrats TypeScript partagés entre l'interface, l'API et le temps réel ;
- migration automatique et non destructive des données locales V1 ;
- Supabase/PostgreSQL reste la source officielle des données distantes.

## Développement

```powershell
npm.cmd install
npm.cmd run dev
```

Interface Vite : `http://127.0.0.1:5173`

API et WebSocket : `http://127.0.0.1:5000`

## Production locale

```powershell
npm.cmd run check
npm.cmd start
```

L'application compilée est accessible sur `http://127.0.0.1:5000`.

## État de la migration

- cockpit natif : opérationnel ;
- état de session centralisé : opérationnel ;
- diagnostic local : opérationnel ;
- canal WebSocket avec reconnexion : opérationnel ;
- dés avec animation 3D locale, rooms et historique Supabase : opérationnels ;
- tracker, rencontres et import Obsidian : opérationnels ;
- Battle Map et overlays : opérationnels ;
- personnages, fiche complète, inventaire et compte : opérationnels ;
- références BRP-ORC : servies en lecture seule sans scripts historiques.
