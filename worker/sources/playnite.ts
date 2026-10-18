import { playniteAccountFor } from "../accounts";
import type { PlaytimeItem } from "../db";
import type { FetchedTrophy } from "../trophies";

/** Ce qu'envoie le script Playnite (playnite/ProfilGamer). */
export interface PlaynitePayload {
  games: {
    /** GameId de Playnite (id du jeu chez le launcher), sinon son Id interne. */
    id: string;
    name: string;
    /** Nom de la bibliothèque Playnite : "EA app", "Epic", "Ubisoft Connect"… */
    source?: string | null;
    /** Temps de jeu cumulé, en secondes. */
    playtime: number;
    lastActivity?: string | null;
    /** Succès lus dans l'extension Playnite Achievements (Epic, EA, Ubisoft…). */
    achievements?: {
      id: string;
      name: string;
      description?: string | null;
      icon?: string | null;
      hidden?: boolean;
      /** Date de déblocage (ISO), absente si pas encore obtenu. */
      unlockedAt?: string | null;
      /** % des joueurs qui l'ont. */
      rarity?: number | null;
    }[];
  }[];
}

export interface PlayniteAchievements {
  externalId: string;
  name: string;
  list: FetchedTrophy[];
}

const MAX_GAMES = 5000;
const MAX_ACHIEVEMENTS = 2000;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

function parseAchievements(list: unknown): FetchedTrophy[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ACHIEVEMENTS).flatMap((a): FetchedTrophy[] => {
    const id = str(a?.id, 200);
    const name = str(a?.name, 300);
    if (!id || !name) return [];
    const icon = str(a.icon, 500);
    return [
      {
        id,
        name,
        description: str(a.description, 1000),
        // Les icônes en cache local de Playnite ne sont pas accessibles depuis le site.
        icon: icon && /^https:\/\//.test(icon) ? icon : null,
        grade: null,
        hidden: Boolean(a.hidden),
        earnedAt: str(a.unlockedAt, 40),
        rarity: typeof a.rarity === "number" && Number.isFinite(a.rarity) ? Math.min(100, Math.max(0, a.rarity)) : null,
      },
    ];
  });
}

/** Valide le corps reçu et répartit les jeux (et leurs succès) par compte. */
export function parsePlaynite(body: unknown) {
  const games = (body as PlaynitePayload | null)?.games;
  if (!Array.isArray(games)) throw new Error("Corps attendu : { games: [...] }");
  if (games.length > MAX_GAMES) throw new Error(`Trop de jeux (max ${MAX_GAMES})`);

  const byAccount = new Map<string, PlaytimeItem[]>();
  const achievements = new Map<string, PlayniteAchievements[]>();
  for (const g of games) {
    if (!g || typeof g.name !== "string" || typeof g.id !== "string" || typeof g.playtime !== "number") continue;
    const accountId = playniteAccountFor(g.source);
    if (!accountId) continue;
    const list = byAccount.get(accountId) ?? [];
    const externalId = `${(g.source ?? "local").toLowerCase()}:${g.id}`.slice(0, 200);
    const name = g.name.slice(0, 200);
    const found = parseAchievements(g.achievements);
    if (found.length) achievements.set(accountId, [...(achievements.get(accountId) ?? []), { externalId, name, list: found }]);
    list.push({
      externalId,
      name,
      minutes: Math.floor(Math.max(0, g.playtime) / 60),
      lastPlayed: typeof g.lastActivity === "string" ? g.lastActivity.slice(0, 40) : null,
    });
    byAccount.set(accountId, list);
  }
  return { byAccount, achievements };
}
