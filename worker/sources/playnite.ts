import { playniteAccountFor } from "../accounts";
import type { PlaytimeItem } from "../db";

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
  }[];
}

const MAX_GAMES = 5000;

/** Valide le corps reçu et répartit les jeux par compte. */
export function parsePlaynite(body: unknown): Map<string, PlaytimeItem[]> {
  const games = (body as PlaynitePayload | null)?.games;
  if (!Array.isArray(games)) throw new Error("Corps attendu : { games: [...] }");
  if (games.length > MAX_GAMES) throw new Error(`Trop de jeux (max ${MAX_GAMES})`);

  const byAccount = new Map<string, PlaytimeItem[]>();
  for (const g of games) {
    if (!g || typeof g.name !== "string" || typeof g.id !== "string" || typeof g.playtime !== "number") continue;
    const accountId = playniteAccountFor(g.source);
    if (!accountId) continue;
    const list = byAccount.get(accountId) ?? [];
    list.push({
      externalId: `${(g.source ?? "local").toLowerCase()}:${g.id}`.slice(0, 200),
      name: g.name.slice(0, 200),
      minutes: Math.floor(Math.max(0, g.playtime) / 60),
      lastPlayed: typeof g.lastActivity === "string" ? g.lastActivity.slice(0, 40) : null,
    });
    byAccount.set(accountId, list);
  }
  return byAccount;
}
