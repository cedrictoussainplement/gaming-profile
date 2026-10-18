// Format de la réponse de GET /api/stats, partagé entre le Worker et la page.

export interface GameStat {
  id: number;
  name: string;
  cover: string | null;
  minutes: number;
  /** Plateformes sur lesquelles le jeu a été joué (ids de profile.ts, ou "local"). */
  platforms: string[];
  lastPlayed: string | null;
}

export interface AccountStat {
  minutes: number;
  games: number;
  /** Dernière synchro réussie (ISO). */
  lastSync: string | null;
}

export interface Stats {
  generatedAt: string;
  /** Dernière synchro réussie, tous comptes confondus (ISO). */
  lastSync: string | null;
  /** Premier jour où des heures ont été enregistrées (AAAA-MM-JJ). */
  trackingSince: string | null;
  totalMinutes: number;
  gameCount: number;
  platforms: { platform: string; minutes: number }[];
  accounts: Record<string, AccountStat>;
  topGames: GameStat[];
  /** Minutes jouées par semaine (lundi), des plus anciennes aux plus récentes. */
  weekly: { weekStart: string; minutes: number }[];
  /** Résumé de la bibliothèque (détail : GET /api/library). */
  library: { owned: number; achievements: number; trophies: number; platinums: number };
}
