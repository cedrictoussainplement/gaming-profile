import type { SteamAccount } from "../accounts";
import type { PlaytimeItem } from "../db";

const API = "https://api.steampowered.com";

// Les erreurs ne recopient jamais l'URL : elle contient la clé.
async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Steam ${path} : HTTP ${res.status}`);
  return res.json<T>();
}

async function resolveSteamId(key: string, account: SteamAccount) {
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
    response: { game_count?: number; games?: { appid: number; name: string; playtime_forever: number; rtime_last_played?: number }[] };
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
  }));
}
