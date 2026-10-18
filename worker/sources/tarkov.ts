// Escape from Tarkov : import du JSON téléchargé sur tarkov.dev (bouton « Download » d'un profil).
// tarkov.dev lit ces profils sur player.tarkov.dev, protégé par Cloudflare Turnstile : un jeton
// n'est délivré qu'à un navigateur sur tarkov.dev, donc pas de récupération auto possible ici.
// Les noms (succès, compétences, niveaux) viennent de l'API publique api.tarkov.dev.

import { tarkovModes, type ArenaModeStats, type RaidStats, type TarkovMode, type TarkovProfile } from "../../src/lib/tarkov";

/** Seul profil accepté à l'import (reask0ner). */
export const TARKOV_AID = 12491174;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

interface Handbook {
  playerLevels: { level: number; exp: number; levelBadgeImageLink: string | null }[];
  skills: { id: string; name: string; imageLink: string | null }[];
  achievements: { id: string; name: string; rarity: string | null; imageLink: string | null; adjustedPlayersCompletedPercent: number | null; playersCompletedPercent: number }[];
  mastering: { id: string; level2: number | null; level3: number | null; weapons: { shortName: string | null }[] }[];
  prestige: { prestigeLevel: number; name: string | null; iconLink: string | null }[];
}

const HANDBOOK_QUERY = `query ($gameMode: GameMode) {
  playerLevels { level exp levelBadgeImageLink }
  skills(lang: fr) { id name imageLink }
  achievements(lang: fr) { id name rarity imageLink adjustedPlayersCompletedPercent playersCompletedPercent }
  mastering(lang: fr) { id level2 level3 weapons { shortName } }
  prestige(lang: fr, gameMode: $gameMode) { prestigeLevel name iconLink }
}`;

async function fetchHandbook(mode: TarkovMode): Promise<Partial<Handbook>> {
  const res = await fetch("https://api.tarkov.dev/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: HANDBOOK_QUERY, variables: { gameMode: mode === "pve" ? "pve" : "regular" } }),
  });
  if (!res.ok) throw new Error(`api.tarkov.dev : HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Partial<Handbook> };
  return body.data ?? {};
}

export function guessMode(raw: Raw): TarkovMode | null {
  return raw?.stat?.arenaOverAllCounters ? "arena" : null;
}

export function isMode(value: unknown): value is TarkovMode {
  return tarkovModes.includes(value as TarkovMode);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Même lecture des compteurs que la page joueur de tarkov.dev. */
function raidStats(counters: Raw): RaidStats {
  const items: { Key: string[]; Value: number }[] = Array.isArray(counters?.Items) ? counters.Items : [];
  const get = (...key: string[]) => num(items.find((s) => Array.isArray(s.Key) && key.every((k) => s.Key.includes(k)))?.Value);
  return {
    raids: get("Sessions"),
    survived: get("ExitStatus", "Survived"),
    runThrough: get("ExitStatus", "Runner"),
    mia: get("ExitStatus", "Left"),
    kia: get("ExitStatus", "Killed"),
    kills: get("Kills"),
    killsPmc: get("KilledPmc"),
    winStreak: get("LongestWinStreak"),
  };
}

function sumRaids(a: RaidStats, b: RaidStats): RaidStats {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof RaidStats)[]) out[k] = k === "winStreak" ? Math.max(a[k], b[k]) : a[k] + b[k];
  return out;
}

const arenaModes: Record<string, string> = {
  UnrankedTeamFight: "Team Fight",
  UnrankedLastHero: "Last Hero",
  UnrankedCheckPoint: "Checkpoint",
  UnrankedBlastGang: "Blast Gang",
};

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Vérifie le JSON, puis le résume avec les noms français d'api.tarkov.dev. */
export async function summarizeTarkov(raw: Raw, mode: TarkovMode): Promise<{ profile: TarkovProfile; warning: string | null }> {
  if (!raw || typeof raw !== "object" || !raw.info) throw new Error("Ce fichier ne ressemble pas à un profil tarkov.dev");
  if (Number(raw.aid) !== TARKOV_AID) throw new Error(`Profil ${raw.aid} refusé : seul le compte ${TARKOV_AID} est accepté`);

  let hb: Partial<Handbook> = {};
  let warning: string | null = null;
  try {
    hb = await fetchHandbook(mode);
  } catch (e) {
    warning = `Noms et niveaux indisponibles (${e instanceof Error ? e.message : e}), réimporte plus tard pour les avoir`;
  }

  const experience = num(raw.info.experience);
  let level: number | null = null;
  let levelBadge: string | null = null;
  if (hb.playerLevels?.length && experience > 0) {
    let total = 0;
    for (const l of hb.playerLevels) {
      total += l.exp;
      if (total > experience) break;
      level = l.level;
      levelBadge = l.levelBadgeImageLink;
    }
  }

  const prestigeLevel = num(raw.info.prestigeLevel);
  const prestigeInfo = hb.prestige?.find((p) => p.prestigeLevel === prestigeLevel);
  const prestige = prestigeLevel > 0 ? { level: prestigeLevel, name: prestigeInfo?.name ?? null, icon: prestigeInfo?.iconLink ?? null } : null;

  const common: { Id: string; Progress: number; LastAccess: number }[] = Array.isArray(raw.skills?.Common) ? raw.skills.Common : [];
  const unlocked: Record<string, number> = raw.achievements && typeof raw.achievements === "object" ? raw.achievements : {};

  let latest = 0;
  for (const s of common) latest = Math.max(latest, num(s.LastAccess));
  for (const t of Object.values(unlocked)) latest = Math.max(latest, num(t));

  const skills = common
    .filter((s) => num(s.Progress) > 0 && num(s.LastAccess) > 0)
    .map((s) => {
      const info = hb.skills?.find((k) => k.id === s.Id);
      return { name: info?.name ?? s.Id, image: info?.imageLink ?? null, level: Math.floor(num(s.Progress) / 100) };
    })
    .filter((s) => s.level > 0)
    .sort((a, b) => b.level - a.level)
    .slice(0, 12);

  const masteringRaw: { Id: string | number; Progress: number }[] = Array.isArray(raw.skills?.Mastering) ? raw.skills.Mastering : [];
  const mastering = masteringRaw
    .map((m) => {
      const info = hb.mastering?.find((x) => x.id === String(m.Id));
      const p = num(m.Progress);
      const level = info?.level3 != null && p > info.level3 ? 3 : info?.level2 != null && p > info.level2 ? 2 : 1;
      return { name: info?.weapons?.[0]?.shortName ?? String(m.Id), level, progress: p };
    })
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 8)
    .map(({ name, level }) => ({ name, level }));

  const achievementList = Object.entries(unlocked)
    .map(([id, date]) => {
      const info = hb.achievements?.find((a) => a.id === id);
      return {
        name: info?.name ?? id,
        image: info?.imageLink ?? null,
        rarity: info?.rarity ?? null,
        percent: info ? (info.adjustedPlayersCompletedPercent ?? info.playersCompletedPercent) : null,
        date: iso(num(date)),
      };
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  let raids: TarkovProfile["raids"] = null;
  if (raw.pmcStats?.eft) {
    const pmc = raidStats(raw.pmcStats.eft.overAllCounters);
    const scav = raidStats(raw.scavStats?.eft?.overAllCounters);
    raids = { total: sumRaids(pmc, scav), pmc, scav };
  }

  let arena: TarkovProfile["arena"] = null;
  const arenaCounters = raw.stat?.arenaOverAllCounters;
  if (arenaCounters) {
    const overall = arenaCounters.UnrankedOverall?.Counters ?? {};
    const modes: ArenaModeStats[] = [];
    for (const [key, label] of Object.entries(arenaModes)) {
      const c = arenaCounters[key]?.Counters;
      if (!c) continue;
      modes.push({
        mode: label,
        kills: num(c.Kills),
        deaths: num(c.Deaths),
        maxKillstreak: num(c.MaxKillsWithoutDeaths),
        roundMvp: num(c.RoundMvpCount),
        matchMvp: num(c.MatchMvpCount),
        winStreak: num(c.LongestWinStreak),
      });
    }
    arena = { bestArp: num(overall.BestArp), maxKillstreak: num(overall.MaxKillsWithoutDeaths), winStreak: num(overall.LongestWinStreak), modes };
  }

  return {
    warning,
    profile: {
      mode,
      nickname: String(raw.info.nickname ?? ""),
      side: typeof raw.info.side === "string" ? raw.info.side : null,
      level,
      levelBadge,
      experience,
      prestige,
      playSeconds: num(raw.pmcStats?.eft?.totalInGameTime ?? raw.stat?.totalInGameTime),
      lastActive: latest > 0 ? iso(latest) : null,
      importedAt: new Date().toISOString(),
      raids,
      arena,
      achievements: { done: achievementList.length, total: hb.achievements?.length ?? null, list: achievementList },
      skills,
      mastering,
    },
  };
}
