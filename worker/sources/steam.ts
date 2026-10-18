import type { SteamAccount } from "../accounts";
import type { PlaytimeItem } from "../db";
import type { FetchedTrophy } from "../trophies";

const API = "https://api.steampowered.com";

// Les erreurs ne recopient jamais l'URL : elle contient la clé.
async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Steam ${path} : HTTP ${res.status}`);
  return res.json<T>();
}

export async function resolveSteamId(key: string, account: SteamAccount) {
  if (account.steamId) return account.steamId;
  const data = await getJson<{ response: { success: number; steamid?: string } }>("/ISteamUser/ResolveVanityURL/v1/", {
    key,
    vanityurl: account.vanity ?? "",
  });
  if (data.response.success !== 1 || !data.response.steamid) throw new Error(`Steam : pseudo « ${account.vanity} » introuvable`);
  return data.response.steamid;
}

export async function fetchSteam(key: string, account: SteamAccount): Promise<PlaytimeItem[]> {
  const steamid = await resolveSteamId(key, account);
  const data = await getJson<{
    response: {
      game_count?: number;
      games?: { appid: number; name: string; playtime_forever: number; rtime_last_played?: number; has_community_visible_stats?: boolean }[];
    };
  }>("/IPlayerService/GetOwnedGames/v1/", {
    key,
    steamid,
    include_appinfo: "1",
    include_played_free_games: "1",
    format: "json",
  });
  // Réponse vide = profil ou « Détails des jeux » en privé : on n'écrit rien plutôt que des zéros.
  if (!data.response.games) throw new Error("Steam : aucun jeu renvoyé, le profil ou les détails des jeux sont sans doute privés");
  return data.response.games.map((g) => ({
    externalId: String(g.appid),
    name: g.name,
    minutes: g.playtime_forever,
    lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
    cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
    hasAchievements: Boolean(g.has_community_visible_stats),
  }));
}

/**
 * Succès d'un jeu pour un compte : déblocages du joueur, noms et icônes en français,
 * rareté mondiale. Jusqu'à 3 appels (1 seul si le jeu n'a pas de succès).
 */
export async function fetchSteamAchievements(key: string, steamid: string, appid: string): Promise<FetchedTrophy[]> {
  const res = await fetch(`${API}/ISteamUserStats/GetPlayerAchievements/v1/?${new URLSearchParams({ key, steamid, appid })}`);
  const body = await res
    .json<{ playerstats?: { success?: boolean; error?: string; achievements?: { apiname: string; achieved: number; unlocktime: number }[] } }>()
    .catch(() => null);
  const stats = body?.playerstats;
  if (!res.ok || !stats?.success) {
    const message = stats?.error ?? `HTTP ${res.status}`;
    if (/no stats/i.test(message)) return [];
    throw new Error(`Steam succès : ${message}`);
  }
  const player = stats.achievements ?? [];
  if (!player.length) return [];

  const [schema, global] = await Promise.all([
    getJson<{
      game?: {
        availableGameStats?: {
          achievements?: { name: string; displayName: string; description?: string; hidden: number; icon: string; icongray: string }[];
        };
      };
    }>("/ISteamUserStats/GetSchemaForGame/v2/", { key, appid, l: "french" }),
    getJson<{ achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } }>(
      "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
      { gameid: appid },
    ).catch(() => null),
  ]);
  const defs = new Map((schema.game?.availableGameStats?.achievements ?? []).map((a) => [a.name, a]));
  const rarity = new Map((global?.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)]));

  return player.map((p) => {
    const def = defs.get(p.apiname);
    const earned = p.achieved === 1;
    const r = rarity.get(p.apiname);
    return {
      id: p.apiname,
      name: def?.displayName || p.apiname,
      description: def?.description ?? null,
      icon: (earned ? def?.icon : def?.icongray) ?? def?.icon ?? null,
      grade: null,
      hidden: def?.hidden === 1,
      earnedAt: earned && p.unlocktime ? new Date(p.unlocktime * 1000).toISOString() : earned ? "1970-01-01T00:00:00.000Z" : null,
      rarity: r !== undefined && Number.isFinite(r) ? r : null,
    };
  });
}
