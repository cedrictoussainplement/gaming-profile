# gaming-profile

Page profil gaming de **reask** : tous les comptes (Steam, PlayStation, Epic, Riot…), les trackers de stats par jeu et les liens communauté, au même endroit.

## V1

- Next.js 15 + TypeScript, export statique (`output: "export"`).
- Toutes les données sont dans [`src/data/profile.ts`](src/data/profile.ts). Plusieurs comptes par plateforme sont gérés (rôle `main` / `smurf`).
- Uniquement des infos publiques : pas d'identifiant de connexion, d'e-mail ni de jeton dans le dépôt.

## Lancer en local

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # génère le site statique dans out/
```

## Déployer sur Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git, puis choisir ce dépôt.
2. Preset : **Next.js (Static HTML Export)**. Commande de build : `npm run build`. Dossier de sortie : `out`.
3. Variable d'environnement `NODE_VERSION` = `22`.

## V2 (à venir)

Heures synchronisées automatiquement (Steam Web API, PSN, Playnite) : le champ `hours` des comptes est déjà prévu dans les types.
