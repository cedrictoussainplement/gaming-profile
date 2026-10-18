// Format de GET /api/library et GET /api/game, partagé entre le Worker et les pages.

export interface TrophyCounts {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface LibraryGame {
  id: number;
  name: string;
  cover: string | null;
  /** Minutes, tous comptes confondus. */
  minutes: number;
  lastPlayed: string | null;
  /** Plateformes (ids de profile.ts, ou "local"). */
  platforms: string[];
  /** Comptes qui possèdent ou ont joué le jeu. */
  accounts: string[];
  /** Meilleure progression de succès / trophées parmi les comptes, null si le jeu n'en a pas (ou pas encore chargés). */
  achievements: { earned: number; total: number } | null;
  /** Platine PSN obtenu. */
  platinum: boolean;
}

export interface RareTrophy {
  gameId: number;
  game: string;
  name: string;
  icon: string | null;
  grade: string | null;
  platform: string;
  rarity: number;
  earnedAt: string | null;
}

export interface Library {
  generatedAt: string;
  totals: {
    owned: number;
    played: number;
    minutes: number;
    /** Succès Steam débloqués, tous comptes. */
    steamAchievements: number;
    /** Trophées PSN obtenus par type, tous comptes. */
    psnTrophies: TrophyCounts;
    /** Jeux terminés à 100 % (au moins un compte). */
    completed: number;
    /** Jeux dont le détail des succès est encore en cours de chargement. */
    pendingTrophies: number;
  };
  games: LibraryGame[];
  rarest: RareTrophy[];
}

export interface Trophy {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  grade: string | null;
  hidden: boolean;
  earnedAt: string | null;
  rarity: number | null;
}

export interface GameDetail {
  id: number;
  name: string;
  cover: string | null;
  minutes: number;
  lastPlayed: string | null;
  platforms: string[];
  accounts: { id: string; platform: string; minutes: number; lastPlayed: string | null }[];
  /** Un bloc par liste de succès (Steam ou PSN), main et smurf réunis. */
  sets: {
    platform: string;
    /** Union des comptes : un succès compte dès qu'un compte l'a. */
    earned: number | null;
    total: number | null;
    grades: { earned: TrophyCounts; defined: TrophyCounts } | null;
    lastEarned: string | null;
    /** Détail pas encore téléchargé (ou à rafraîchir) sur au moins un compte. */
    pending: boolean;
    /** Progression de chaque compte séparément. */
    accounts: { accountId: string; earned: number | null; total: number | null; platinum: boolean; pending: boolean }[];
    trophies: CombinedTrophy[];
  }[];
}

export interface CombinedTrophy extends Trophy {
  /** Comptes qui l'ont débloqué, avec la date (earnedAt : la première). */
  earnedBy: { accountId: string; earnedAt: string }[];
}

/** Date valide pour l'affichage (Steam et PSN mettent 1970 quand ils n'ont pas la date). */
export const realDate = (iso: string | null) => (iso && iso >= "2000" ? iso : null);
