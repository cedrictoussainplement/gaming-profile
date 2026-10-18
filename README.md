# gaming-profile

Page profil gaming de **reask** : tous les comptes (Steam, PlayStation, Epic, Riot…), le temps de jeu, les trackers de stats par jeu et les liens communauté, au même endroit.

## Comment c'est fait

- **Page** : Next.js 15 + TypeScript, export statique (`out/`). Les comptes, trackers et liens sont dans [`src/data/profile.ts`](src/data/profile.ts). Plusieurs comptes par plateforme sont gérés (rôle `main` / `smurf`).
- **Worker Cloudflare** ([`worker/`](worker)) : un seul Worker sert le site, l'API et la synchro.
  - `GET /api/stats` : heures agrégées lues par la page (total, par compte, par plateforme, top jeux, heures par semaine).
  - Cron chaque nuit à 4 h UTC : Steam Web API (`GetOwnedGames`) pour les 2 comptes Steam, PSN (`psn-api`, `getUserPlayedGames`) pour les 2 comptes PlayStation.
  - `POST /api/playnite` : reçoit les heures envoyées par Playnite (EA, Epic, Ubisoft, Riot, Battle.net, jeux locaux). Protégé par la clé `INGEST_KEY`.
  - `POST /api/sync` : lance la synchro Steam + PSN tout de suite (même clé).
  - `GET /api/tarkov` / `POST /api/tarkov?mode=…` : profils Escape from Tarkov, voir plus bas.
- **Base D1** ([`worker/migrations`](worker/migrations)) : `accounts`, `games`, `game_aliases`, `playtime_snapshots` (historique, une ligne seulement quand les heures changent) et `sync_runs` (journal des synchros).
- Les jeux sont fusionnés entre comptes et plateformes par nom normalisé (« Battlefield™ 2042 (PS5) » = « Battlefield 2042 »). Fusion manuelle possible, voir plus bas.
- Aucun secret dans le dépôt : la clé Steam, les NPSSO PlayStation et `INGEST_KEY` sont des secrets Cloudflare.

## Lancer en local

```bash
npm install
npm run dev       # page seule sur http://localhost:3000 (heures à « — », pas d'API)
npm run preview   # page + API + base D1 locale sur http://localhost:8787
```

Pour `preview`, mets les secrets de test dans un fichier `.dev.vars` (ignoré par git) : `INGEST_KEY=...`, `STEAM_API_KEY=...`, etc.

## Mettre en ligne sur Cloudflare

Le site passe de Cloudflare Pages à un **Worker** (Pages ne sait pas lancer de cron).

1. **Base D1** : déjà créée (`gaming-profile`), son id est dans [`wrangler.jsonc`](wrangler.jsonc). Pour repartir d'un autre compte : Storage & Databases → D1 → Create, puis remplacer `database_id`.
2. **Brancher le dépôt** : Workers & Pages → Create → Import a repository → ce dépôt.
   - Build command : `npm run build`
   - Deploy command : `npx wrangler d1 migrations apply gaming-profile --remote && npx wrangler deploy`
   - Variable de build `NODE_VERSION` = `22`.
   Chaque push sur `main` redéploie et applique les nouvelles migrations.
3. **Ajouter les secrets** : Worker `gaming-profile` → Settings → Variables and Secrets → Add, type **Secret** :

   | Nom | Valeur |
   |---|---|
   | `STEAM_API_KEY` | ta clé sur https://steamcommunity.com/dev/apikey (n'importe quel nom de domaine convient) |
   | `PSN_NPSSO_FR__EASK_` | le NPSSO du compte fr__eask_ |
   | `PSN_NPSSO_FR_REASK` | le NPSSO du compte fr_reask |
   | `INGEST_KEY` | une longue valeur au hasard (ex. `openssl rand -hex 32`), utilisée par Playnite et `/api/sync` |

   Ne colle jamais ces valeurs dans un chat, un fichier du dépôt ou une issue. Un NPSSO vaut un mot de passe.
4. **Première synchro** sans attendre la nuit (PowerShell) :
   ```powershell
   Invoke-RestMethod -Method Post -Uri https://gaming-profile.<ton-sous-domaine>.workers.dev/api/sync -Headers @{ Authorization = "Bearer <INGEST_KEY>" }
   ```
   La réponse dit, compte par compte, combien de jeux sont arrivés ou quelle erreur bloque.

### Prérequis Steam

Sur les deux comptes : Modifier le profil → Confidentialité → **Profil** et **Détails des jeux** en *Public*. Sinon Steam ne renvoie aucun jeu et la synchro du compte échoue (sans effacer les heures déjà enregistrées).

### Récupérer un NPSSO PlayStation

1. Connecte-toi sur https://www.playstation.com avec le compte voulu.
2. Dans le même navigateur, ouvre https://ca.account.sony.com/api/v1/ssocookie et copie la valeur de `npsso`.
3. Colle-la directement dans le secret Cloudflare du compte.
4. Recommence pour l'autre compte (déconnexion, connexion avec l'autre, étape 2).

Un NPSSO expire au bout de deux mois environ. Quand la synchro PSN échoue (la date de synchro du compte arrête d'avancer), refais ces étapes.

## Playnite

Le dossier [`playnite/ProfilGamer`](playnite/ProfilGamer) est une extension script Playnite. Elle envoie les heures au démarrage de Playnite, après chaque partie, et via le menu *Extensions → Profil gamer → Envoyer mes heures au profil*.

1. Copie le dossier `ProfilGamer` dans `%AppData%\Playnite\Extensions\` (ou `Extensions\` à côté de `Playnite.DesktopApp.exe` en version portable).
2. Dans ce dossier, copie `config.example.json` en `config.json` et remplis l'URL du Worker et la valeur de `INGEST_KEY`.
3. Redémarre Playnite.

Les jeux Steam et PlayStation sont ignorés (leurs API donnent déjà les heures). Les autres launchers vont sur le compte main de la plateforme ; un jeu sans launcher reconnu va dans « Autres jeux PC ». La correspondance est dans [`worker/accounts.ts`](worker/accounts.ts).

## Corriger les jeux à la main

Avec `npx wrangler d1 execute gaming-profile --remote --command "..."`, ou dans la console D1 du tableau de bord :

```sql
-- Voir les jeux et leurs alias
SELECT g.id, g.name, a.source, a.name AS nom_source FROM games g JOIN game_aliases a ON a.game_id = g.id ORDER BY g.name;

-- Fusionner le jeu 42 dans le jeu 7 (l'historique suit)
UPDATE game_aliases SET game_id = 7, manual = 1 WHERE game_id = 42;

-- Cacher un jeu (serveur de test, outil…)
UPDATE games SET hidden = 1 WHERE id = 42;

-- Renommer un jeu
UPDATE games SET name = 'Rainbow Six Siege' WHERE id = 12;
```

## Escape from Tarkov

La section Tarkov affiche niveau, raids, survie, K/D, compétences, armes maîtrisées, succès et stats Arena, sans renvoyer vers tarkov.dev.

Pas de récupération automatique : tarkov.dev lit les profils sur `player.tarkov.dev`, protégé par Cloudflare Turnstile (jeton délivré seulement à un navigateur sur tarkov.dev). On importe donc le JSON que tarkov.dev propose au téléchargement :

1. Sur tarkov.dev, ouvrir le profil dans chaque mode (PvP, PvE, PvP saison, Arena) et cliquer sur le bouton de téléchargement à côté du pseudo.
2. Ouvrir `/import-tarkov` sur le site, coller `INGEST_KEY`, mettre chaque fichier dans la bonne case, Importer.

Le Worker résume le profil (table `tarkov_profiles`, JSON d'origine gardé), prend les noms français des succès, compétences et niveaux sur l'API publique `api.tarkov.dev`, et ajoute le temps de jeu du mode aux heures du profil. Seul le compte 12491174 est accepté. Refaire l'import pour rafraîchir.

## Pas encore synchronisé

Clash of Clans et Game Center restent des liens. WARDOGS est un lien vers wardogs.tools.
