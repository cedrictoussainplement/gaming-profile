// Sources des stats de tracker, une fonction par API. Chacune renvoie le résumé affiché
// (format TrackerSummary de src/lib/trackers.ts) et la réponse brute, gardée en base
// pour refaire le résumé ou le corriger sans réinterroger l'API.
//
// Les erreurs ne recopient jamais l'URL ni les en-têtes : ils peuvent contenir une clé.

import { hours, num, percent, type TrackerStat, type TrackerSummary } from "../../src/lib/trackers";

export interface Fetched {
  summary: TrackerSummary;
  raw: unknown;
}

type Obj = Record<string, any>;

async function getJson(label: string, url: string, headers: HeadersInit = {}): Promise<Obj> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json", "user-agent": "gaming-profile (Cloudflare Worker)", ...headers } });
  } catch {
    throw new Error(`${label} : serveur injoignable`);
  }
  const text = await res.text();
  let body: Obj | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.error ?? body?.errors?.[0]?.message ?? body?.reason;
    throw new Error(`${label} : HTTP ${res.status}${typeof msg === "string" && msg ? ` (${msg.slice(0, 160)})` : ""}`);
  }
  if (!body) throw new Error(`${label} : réponse illisible`);
  return body;
}

const plural = (n: number, word: string) => `${num(n)} ${word}${n > 1 ? "s" : ""}`;
const stat = (label: string, value: string, hint?: string): TrackerStat => (hint ? { label, value, hint } : { label, value });
const ratio = (a: unknown, b: unknown, digits = 2) => (Number(b) > 0 ? num(Number(a) / Number(b), digits) : num(a));
const keep = (stats: (TrackerStat | null | false | undefined)[]) =>
  stats.filter((s): s is TrackerStat => Boolean(s) && (s as TrackerStat).value !== "—");

// ---------------------------------------------------------------- Battlefield (gametools.network, sans clé)

const bfGames = { bf2042: "Battlefield 2042", bfv: "Battlefield V", bf4: "Battlefield 4" } as const;
export type BfGame = keyof typeof bfGames;

export async function fetchBattlefield(game: BfGame, name: string, platform = "pc"): Promise<Fetched> {
  const params = new URLSearchParams({ name, platform, format_values: "false", skip_battlelog: "false" });
  const d = await getJson("gametools", `https://api.gametools.network/${game}/stats/?${params}`);
  if (!d.userName && d.kills === undefined) throw new Error(`gametools : ${name} introuvable sur ${bfGames[game]}`);
  // Profil privé ou jeu jamais lancé sur ce compte : gametools ne renvoie que la liste des armes, sans totaux.
  if (d.kills === undefined || (!Number(d.kills) && !Number(d.secondsPlayed ?? d.matchesPlayed)))
    throw new Error(`gametools : aucune stat publique pour ${name} sur ${bfGames[game]} (profil EA privé ou jamais joué sur ce compte)`);
  const seconds = d.secondsPlayed ?? d.timePlayedSeconds;
  const rank = d.rankName ?? (d.rank !== undefined && d.rank !== null ? `Rang ${num(d.rank)}` : undefined);
  const classes: Obj[] = Array.isArray(d.classes) ? d.classes : [];
  return {
    raw: d,
    summary: {
      headline: rank,
      image: d.rankImg || undefined,
      highlights: keep([
        stat("K/D", num(d.killDeath ?? d.infantryKillDeath, 2), `${num(d.kills)} kills · ${num(d.deaths)} morts`),
        stat("Kills / min", num(d.killsPerMinute, 2)),
        stat("Victoires", percent(d.winPercent), d.wins !== undefined ? `${num(d.wins)} gagnées · ${num(d.loses)} perdues` : undefined),
        stat("Temps de jeu", seconds ? hours(seconds) : typeof d.timePlayed === "string" ? d.timePlayed : "—"),
        stat("Précision", percent(d.accuracy)),
        stat("Headshots", percent(d.headshots)),
        game === "bf2042" ? stat("Parties", num(d.matchesPlayed)) : stat("Score / min", num(d.scorePerMinute)),
        d.bestClass && stat("Classe favorite", String(d.bestClass)),
      ]).slice(0, 6),
      groups: classes.length
        ? [
            {
              title: "Par classe",
              rows: classes
                .filter((c) => Number(c.kills) > 0)
                .sort((a, b) => Number(b.kills) - Number(a.kills))
                .map((c) => stat(String(c.className ?? c.characterName ?? "?"), `${num(c.kills)} kills · K/D ${num(c.killDeath, 2)}`)),
            },
          ]
        : undefined,
    },
  };
}

// ---------------------------------------------------------------- Apex Legends (apexlegendsapi.com)

export async function fetchApex(key: string, player: string, platform: "PC" | "PS4" | "X1"): Promise<Fetched> {
  const params = new URLSearchParams({ auth: key, player, platform });
  const d = await getJson("Apex Legends API", `https://api.mozambiquehe.re/bridge?${params}`);
  if (d.Error) throw new Error(`Apex Legends API : ${String(d.Error).slice(0, 160)}`);
  const g: Obj = d.global ?? {};
  const rank: Obj = g.rank ?? {};
  const legends: Obj = d.legends?.all ?? {};
  // Les « trackers » de légende : seuls ceux équipés dans le jeu sont visibles par l'API.
  const legendKills = Object.entries(legends)
    .map(([name, l]) => {
      const kills = (l as Obj)?.data?.find((t: Obj) => /kills/i.test(t.key ?? t.name) && !/season|arena/i.test(t.key ?? t.name));
      return { name, kills: Number(kills?.value ?? 0) };
    })
    .filter((l) => l.kills > 0)
    .sort((a, b) => b.kills - a.kills);
  const totalKills = d.total?.kills?.value ?? (legendKills.length ? legendKills.reduce((s, l) => s + l.kills, 0) : undefined);
  const rankName = rank.rankName ? `${rank.rankName}${rank.rankDiv ? ` ${rank.rankDiv}` : ""}` : undefined;
  return {
    raw: d,
    summary: {
      headline: rankName ? `${rankName} · niveau ${num(g.level)}` : `Niveau ${num(g.level)}`,
      image: rank.rankImg || undefined,
      highlights: keep([
        stat("Niveau", num(g.level), g.levelPrestige ? `prestige ${g.levelPrestige}` : undefined),
        stat("Classé", rankName ?? "—", rank.rankScore !== undefined ? `${num(rank.rankScore)} RP` : undefined),
        stat("Kills", num(totalKills), "selon les trackers équipés"),
        d.total?.kd?.value !== undefined && Number(d.total.kd.value) > 0 && stat("K/D", num(d.total.kd.value, 2)),
        stat("Légende du moment", d.realtime?.selectedLegend ?? d.legends?.selected?.LegendName ?? "—"),
        d.total?.damage?.value !== undefined && stat("Dégâts", num(d.total.damage.value)),
      ]),
      groups: legendKills.length ? [{ title: "Kills par légende", rows: legendKills.slice(0, 10).map((l) => stat(l.name, num(l.kills))) }] : undefined,
    },
  };
}

// ---------------------------------------------------------------- Fortnite (fortnite-api.com)

export async function fetchFortnite(key: string, name: string): Promise<Fetched> {
  const params = new URLSearchParams({ name, accountType: "epic", timeWindow: "lifetime" });
  let d: Obj;
  try {
    d = await getJson("fortnite-api", `https://fortnite-api.com/v2/stats/br/v2?${params}`, { authorization: key });
  } catch (e) {
    if (e instanceof Error && /HTTP 403/.test(e.message)) throw new Error("fortnite-api : stats privées, active « Afficher dans les classements publics » dans les réglages Fortnite");
    throw e;
  }
  const data: Obj = d.data ?? {};
  const all: Obj = data.stats?.all ?? {};
  const o: Obj = all.overall ?? {};
  const modes = [
    ["Solo", all.solo],
    ["Duo", all.duo],
    ["Trio", all.trio],
    ["Section", all.squad],
    ["Modes temporaires", all.ltm],
  ].filter(([, m]) => m && Number((m as Obj).matches) > 0) as [string, Obj][];
  return {
    raw: d,
    summary: {
      headline: data.battlePass?.level ? `Passe de combat niveau ${num(data.battlePass.level)}` : undefined,
      highlights: keep([
        stat("Victoires", num(o.wins), `${percent(o.winRate)} des parties`),
        stat("K/D", num(o.kd, 2), `${num(o.kills)} éliminations`),
        stat("Parties", num(o.matches)),
        stat("Joueurs survécus", num(o.playersOutlived)),
        stat("Temps de jeu", o.minutesPlayed ? hours(o.minutesPlayed * 60) : "—"),
        stat("Kills / partie", num(o.killsPerMatch, 2)),
      ]),
      groups: modes.length
        ? [{ title: "Par mode", rows: modes.map(([label, m]) => stat(label, `${num(m.wins)} victoires · K/D ${num(m.kd, 2)} · ${num(m.matches)} parties`)) }]
        : undefined,
    },
  };
}

// ---------------------------------------------------------------- Valorant (HenrikDev API)

const valorantRankIcon = (tier: unknown) =>
  Number(tier) > 0 ? `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${Number(tier)}/smallicon.png` : undefined;

export async function fetchValorant(key: string, riotId: string): Promise<Fetched> {
  const [name, tag] = riotId.split("#").map(encodeURIComponent);
  const H = "HenrikDev";
  const headers = { authorization: key };
  const account = (await getJson(H, `https://api.henrikdev.xyz/valorant/v2/account/${name}/${tag}`, headers)).data ?? {};
  const region = String(account.region ?? "eu");
  const [mmr, matches] = await Promise.all([
    getJson(H, `https://api.henrikdev.xyz/valorant/v3/mmr/${region}/pc/${name}/${tag}`, headers).then((r) => r.data ?? {}),
    getJson(H, `https://api.henrikdev.xyz/valorant/v1/stored-matches/${region}/${name}/${tag}?size=50`, headers)
      .then((r) => (Array.isArray(r.data) ? (r.data as Obj[]) : []))
      .catch(() => [] as Obj[]),
  ]);

  let kills = 0,
    deaths = 0,
    head = 0,
    shots = 0,
    wins = 0,
    decided = 0;
  const agents = new Map<string, number>();
  for (const m of matches) {
    const s: Obj = m.stats ?? {};
    kills += Number(s.kills ?? 0);
    deaths += Number(s.deaths ?? 0);
    head += Number(s.shots?.head ?? 0);
    shots += Number(s.shots?.head ?? 0) + Number(s.shots?.body ?? 0) + Number(s.shots?.leg ?? 0);
    const agent = s.character?.name;
    if (agent) agents.set(agent, (agents.get(agent) ?? 0) + 1);
    const team = String(s.team ?? "").toLowerCase();
    const mine = Number(m.teams?.[team]);
    const theirs = Number(m.teams?.[team === "red" ? "blue" : "red"]);
    if (Number.isFinite(mine) && Number.isFinite(theirs) && mine !== theirs) {
      decided++;
      if (mine > theirs) wins++;
    }
  }
  const current: Obj = mmr.current ?? {};
  const peak: Obj = mmr.peak ?? {};
  const seasons: Obj[] = Array.isArray(mmr.seasonal) ? mmr.seasonal : [];
  const n = matches.length;
  return {
    raw: { account, mmr, matches: n },
    summary: {
      headline: current.tier?.name && current.tier.name !== "Unrated" ? `${current.tier.name} · ${num(current.rr)} RR` : `Niveau ${num(account.account_level)}`,
      image: valorantRankIcon(current.tier?.id),
      highlights: keep([
        stat("Rang", current.tier?.name ?? "—", current.rr !== undefined ? `${num(current.rr)} RR` : undefined),
        stat("Meilleur rang", peak.tier?.name ?? "—", peak.season?.short ? `saison ${peak.season.short}` : undefined),
        stat("Niveau", num(account.account_level)),
        n > 0 && stat("K/D", ratio(kills, deaths), n > 1 ? `${n} dernières parties` : "dernière partie"),
        decided > 0 && stat("Victoires", percent((wins / decided) * 100, 0), `${wins} sur ${plural(decided, "partie")}`),
        shots > 0 && stat("Headshots", percent((head / shots) * 100, 0)),
      ]),
      groups: [
        ...(agents.size
          ? [{ title: "Agents joués", rows: [...agents].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([a, c]) => stat(a, plural(c, "partie"))) }]
          : []),
        ...(seasons.length
          ? [
              {
                title: "Saisons classées",
                rows: seasons
                  .filter((s) => Number(s.games) > 0)
                  .slice(-6)
                  .reverse()
                  .map((s) => stat(String(s.season?.short ?? "?"), `${s.end_tier?.name ?? "?"} · ${num(s.wins)} victoires sur ${num(s.games)}`)),
              },
            ]
          : []),
      ],
    },
  };
}

// ---------------------------------------------------------------- Counter-Strike 2 (Steam + Leetify)

export async function fetchCs2(steamKey: string | undefined, steamid: string): Promise<Fetched> {
  const [steam, leetify] = await Promise.all([
    steamKey
      ? getJson("Steam", `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?${new URLSearchParams({ key: steamKey, steamid, appid: "730" })}`)
          .then((r) => Object.fromEntries(((r.playerstats?.stats ?? []) as Obj[]).map((s) => [s.name, Number(s.value)])) as Record<string, number>)
          .catch((e: Error) => e)
      : Promise.resolve(new Error("Steam : secret STEAM_API_KEY manquant")),
    getJson("Leetify", `https://api-public.cs-prod.leetify.com/v3/profile?${new URLSearchParams({ steam64_id: steamid })}`).catch((e: Error) => e),
  ]);
  if (steam instanceof Error && leetify instanceof Error) throw new Error(`${steam.message} ; ${leetify.message}`);
  const s = steam instanceof Error ? {} : steam;
  const l: Obj = leetify instanceof Error ? {} : leetify;
  const premier = l.ranks?.premier;
  const winrate = l.winrate !== undefined ? Number(l.winrate) * (Number(l.winrate) <= 1 ? 100 : 1) : s.total_matches_played ? (s.total_matches_won / s.total_matches_played) * 100 : undefined;
  const rating: Obj = l.rating ?? {};
  const ratingRows = (
    [
      ["Visée", rating.aim],
      ["Placement", rating.positioning],
      ["Utilitaires", rating.utility],
      ["Clutch", rating.clutch],
      ["Duels d'ouverture", rating.opening],
    ] as [string, unknown][]
  ).filter(([, v]) => v !== undefined && v !== null);
  return {
    raw: { steam: steam instanceof Error ? steam.message : steam, leetify: leetify instanceof Error ? leetify.message : leetify },
    summary: {
      headline: premier ? `Premier ${num(premier)}` : l.ranks?.faceit ? `FACEIT niveau ${l.ranks.faceit}` : undefined,
      highlights: keep([
        premier && stat("Premier", num(premier)),
        stat("Victoires", percent(winrate, 0), l.total_matches ? `${num(l.total_matches)} parties (Leetify)` : s.total_matches_played ? `${num(s.total_matches_played)} parties` : undefined),
        s.total_kills !== undefined && stat("K/D", ratio(s.total_kills, s.total_deaths), `${num(s.total_kills)} kills`),
        s.total_kills ? stat("Headshots", percent((s.total_kills_headshot / s.total_kills) * 100, 0)) : null,
        s.total_shots_fired ? stat("Précision", percent((s.total_shots_hit / s.total_shots_fired) * 100, 0)) : null,
        s.total_time_played ? stat("Temps de jeu", hours(s.total_time_played), "compteur Steam") : null,
        rating.aim !== undefined && stat("Visée Leetify", num(rating.aim, 1)),
        s.total_mvps !== undefined && stat("MVP", num(s.total_mvps)),
      ]).slice(0, 6),
      groups: ratingRows.length ? [{ title: "Notes Leetify", rows: ratingRows.map(([k, v]) => stat(k, num(v, 1))) }] : undefined,
    },
  };
}

// ---------------------------------------------------------------- Clash of Clans (API officielle via le relais RoyaleAPI)

const clanRoles: Record<string, string> = { member: "membre", admin: "aîné", coLeader: "chef adjoint", leader: "chef" };

export async function fetchClash(key: string, tag: string): Promise<Fetched> {
  // L'API Supercell n'accepte une clé que depuis les IP déclarées ; le relais RoyaleAPI
  // sort toujours par 45.79.218.79, l'IP à déclarer sur la clé.
  const d = await getJson("Clash of Clans", `https://cocproxy.royaleapi.dev/v1/players/${encodeURIComponent(tag)}`, {
    authorization: `Bearer ${key}`,
  });
  const heroes: Obj[] = Array.isArray(d.heroes) ? d.heroes.filter((h: Obj) => h.village === "home") : [];
  return {
    raw: d,
    summary: {
      headline: d.league?.name && d.league.name !== "Unranked" ? d.league.name : `Hôtel de ville ${num(d.townHallLevel)}`,
      image: d.league?.iconUrls?.small || undefined,
      highlights: keep([
        stat("Hôtel de ville", num(d.townHallLevel)),
        stat("Trophées", num(d.trophies), `record ${num(d.bestTrophies)}`),
        stat("Niveau", num(d.expLevel)),
        stat("Étoiles de guerre", num(d.warStars)),
        stat("Attaques gagnées", num(d.attackWins), "cette saison"),
        d.clan?.name && stat("Clan", String(d.clan.name), clanRoles[d.role] ?? undefined),
      ]),
      groups: heroes.length ? [{ title: "Héros", rows: heroes.map((h) => stat(String(h.name), `niveau ${num(h.level)} / ${num(h.maxLevel)}`)) }] : undefined,
    },
  };
}

// ---------------------------------------------------------------- Rainbow Six Siege (R6Data, clé optionnelle)

/** Première valeur trouvée pour une de ces clés, en profondeur (le format de R6Data bouge). */
function find(obj: unknown, keys: string[], depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  for (const k of keys) if ((obj as Obj)[k] !== undefined && (obj as Obj)[k] !== null && typeof (obj as Obj)[k] !== "object") return (obj as Obj)[k];
  for (const v of Object.values(obj as Obj)) {
    const found = find(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export async function fetchSiege(key: string, name: string): Promise<Fetched> {
  const base = "https://public-api.arenyze.com/r6/api/v2";
  const headers = { "api-key": key };
  const q = (extra: Record<string, string> = {}) => new URLSearchParams({ nameOnPlatform: name, platformType: "uplay", ...extra });
  const [profile, full] = await Promise.all([
    getJson("R6Data", `${base}/profile?${q()}`, headers),
    getJson("R6Data", `${base}/fullstats?${q({ seasonYear: "all", modes: "ranked" })}`, headers).catch((e: Error) => ({ error: e.message })),
  ]);
  const rank = find(full, ["rank", "rank_name", "rankName"]) ?? find(profile, ["rank", "rank_name"]);
  const kills = find(full, ["kills"]);
  const deaths = find(full, ["deaths"]);
  const wins = find(full, ["wins"]);
  const losses = find(full, ["losses"]);
  return {
    raw: { profile, full },
    summary: {
      headline: typeof rank === "string" ? rank : undefined,
      highlights: keep([
        stat("Niveau", num(find(profile, ["level", "clearance_level"]))),
        typeof rank === "string" && stat("Rang", rank, find(full, ["rank_points"]) !== undefined ? `${num(find(full, ["rank_points"]))} RP` : undefined),
        typeof find(full, ["max_rank"]) === "string" && stat("Meilleur rang", String(find(full, ["max_rank"]))),
        kills !== undefined && stat("K/D", ratio(kills, deaths), `${num(kills)} kills`),
        wins !== undefined && stat("Victoires", percent((Number(wins) / (Number(wins) + Number(losses) || 1)) * 100, 0), `${num(wins)} gagnées · ${num(losses)} perdues`),
      ]),
    },
  };
}
