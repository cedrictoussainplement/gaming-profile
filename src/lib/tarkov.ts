// Format de la réponse de GET /api/tarkov, partagé entre le Worker et la page.
// Le Worker résume le JSON exporté depuis tarkov.dev à l'import ; la page n'affiche que ça.

export const tarkovModes = ["regular", "pve", "pvp-season", "arena"] as const;
export type TarkovMode = (typeof tarkovModes)[number];

export const tarkovModeLabel: Record<TarkovMode, string> = {
  regular: "PvP",
  pve: "PvE",
  "pvp-season": "PvP saison",
  arena: "Arena",
};

/** Compte de src/data/profile.ts qui reçoit les heures de chaque mode. */
export const tarkovAccountId: Record<TarkovMode, string> = {
  regular: "tarkov-regular",
  pve: "tarkov-pve",
  "pvp-season": "tarkov-season",
  arena: "tarkov-arena",
};

export interface RaidStats {
  raids: number;
  survived: number;
  runThrough: number;
  mia: number;
  kia: number;
  kills: number;
  killsPmc: number;
  winStreak: number;
}

export interface ArenaModeStats {
  mode: string;
  kills: number;
  deaths: number;
  maxKillstreak: number;
  roundMvp: number;
  matchMvp: number;
  winStreak: number;
}

export interface TarkovProfile {
  mode: TarkovMode;
  nickname: string;
  side: string | null;
  level: number | null;
  levelBadge: string | null;
  experience: number;
  prestige: { level: number; name: string | null; icon: string | null } | null;
  /** Temps de jeu du compte dans ce mode, en secondes. */
  playSeconds: number;
  /** Dernière activité vue dans le profil (ISO). */
  lastActive: string | null;
  /** Date de l'import (ISO). */
  importedAt: string;
  raids: { total: RaidStats; pmc: RaidStats; scav: RaidStats } | null;
  arena: {
    bestArp: number;
    maxKillstreak: number;
    winStreak: number;
    modes: ArenaModeStats[];
  } | null;
  achievements: {
    done: number;
    total: number | null;
    /** Les plus rares obtenus d'abord. */
    list: { name: string; image: string | null; rarity: string | null; percent: number | null; date: string }[];
  };
  skills: { name: string; image: string | null; level: number }[];
  mastering: { name: string; level: number }[];
}

export interface TarkovResponse {
  profiles: TarkovProfile[];
}
