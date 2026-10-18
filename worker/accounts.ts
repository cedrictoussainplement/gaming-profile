// Quels comptes de src/data/profile.ts sont synchronisés, et comment.
// Uniquement des infos publiques : les jetons sont des secrets Cloudflare,
// référencés ici par leur nom.

import { profile } from "../src/data/profile";

export interface SteamAccount {
  id: string;
  /** SteamID64 si connu, sinon le pseudo de l'URL /id/... */
  steamId?: string;
  vanity?: string;
}

export interface PsnAccount {
  id: string;
  /** Nom du secret Cloudflare qui contient le NPSSO de ce compte. */
  npssoSecret: string;
}

export const steamAccounts: SteamAccount[] = [
  { id: "steam-ogreask", vanity: "ogreask" },
  { id: "steam-reask_oner", steamId: "76561199388154157" },
];

export const psnAccounts: PsnAccount[] = [
  { id: "psn-fr__eask_", npssoSecret: "PSN_NPSSO_FR__EASK_" },
  { id: "psn-fr_reask", npssoSecret: "PSN_NPSSO_FR_REASK" },
];

/** Compte qui reçoit les jeux Playnite sans launcher reconnu (jeux locaux, émulateurs…). */
export const LOCAL_ACCOUNT = { id: "pc-local", platform: "local", handle: "Autres jeux PC", role: "main" } as const;

/**
 * Launcher Playnite → compte qui reçoit les heures. Playnite ne voit que le compte
 * connecté sur le PC, donc tout va sur le main.
 * Steam et PlayStation sont ignorés : leurs API donnent déjà les heures.
 */
const playniteSources: { match: RegExp; accountId: string | null }[] = [
  { match: /steam/i, accountId: null },
  { match: /playstation|psn/i, accountId: null },
  { match: /epic/i, accountId: "epic-ogreask" },
  { match: /\bea\b|origin/i, accountId: "ea-reask_oner" },
  { match: /ubisoft|uplay/i, accountId: "ubisoft-reask_oner" },
  { match: /riot/i, accountId: "riot-reask" },
  { match: /battle\.?net|blizzard/i, accountId: "battlenet-reask" },
  { match: /rockstar/i, accountId: "rockstar-fr_reask" },
];

/** `null` = source à ignorer. */
export function playniteAccountFor(source: string | null | undefined): string | null {
  if (!source) return LOCAL_ACCOUNT.id;
  const hit = playniteSources.find((s) => s.match.test(source));
  return hit ? hit.accountId : LOCAL_ACCOUNT.id;
}

export function allAccounts() {
  const rows: { id: string; platform: string; handle: string; role: string }[] = profile.platforms.flatMap((p) =>
    p.accounts.map((a) => ({ id: a.id, platform: p.id, handle: a.handle, role: a.role })),
  );
  rows.push({ ...LOCAL_ACCOUNT });
  return rows;
}
