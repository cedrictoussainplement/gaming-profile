// Lecture de la bibliothèque (GET /api/library) et de la fiche d'un jeu (GET /api/game).

import type { CombinedTrophy, GameDetail, Library, LibraryGame, RareTrophy, TrophyCounts } from "../src/lib/library";
import { parseGrades, readCombined, zero } from "./combined";

const LATEST_PLAYTIME =
  "SELECT s.account_id, a.platform, al.game_id, s.alias_id, s.minutes, s.last_played FROM playtime_snapshots s " +
  "JOIN accounts a ON a.id = s.account_id JOIN game_aliases al ON al.id = s.alias_id " +
  "WHERE s.taken_on = (SELECT MAX(taken_on) FROM playtime_snapshots WHERE account_id = s.account_id AND alias_id = s.alias_id)";

type PlayRow = { account_id: string; platform: string; game_id: number; alias_id: number; minutes: number; last_played: string | null };
const later = (a: string | null, b: string | null) => (b && (!a || b > a) ? b : a);

export async function readLibrary(db: D1Database): Promise<Library> {
  const sets = await readCombined(db);
  const [games, owned, played, rarest] = await db.batch([
    db.prepare("SELECT id, name, cover_url FROM games WHERE hidden = 0"),
    db.prepare(
      "SELECT l.account_id, a.platform, al.game_id FROM library l JOIN accounts a ON a.id = l.account_id JOIN game_aliases al ON al.id = l.alias_id",
    ),
    db.prepare(LATEST_PLAYTIME),
    db.prepare(
      "SELECT t.name, t.icon, t.grade, t.rarity, t.earned_at, ts.platform, al.game_id, g.name AS game FROM trophies t " +
        "JOIN trophy_sets ts ON ts.account_id = t.account_id AND ts.alias_id = t.alias_id " +
        "JOIN game_aliases al ON al.id = t.alias_id JOIN games g ON g.id = al.game_id " +
        "WHERE t.earned_at IS NOT NULL AND t.rarity IS NOT NULL AND g.hidden = 0 ORDER BY t.rarity ASC, t.earned_at DESC LIMIT 48",
    ),
  ]);

  const info = new Map((games.results as { id: number; name: string; cover_url: string | null }[]).map((g) => [g.id, g]));
  const byId = new Map<number, LibraryGame & { platformSet: Set<string>; accountSet: Set<string> }>();
  const entry = (gameId: number) => {
    const g = info.get(gameId);
    if (!g) return null;
    let e = byId.get(gameId);
    if (!e) {
      e = {
        id: g.id,
        name: g.name,
        cover: g.cover_url,
        minutes: 0,
        lastPlayed: null,
        platforms: [],
        accounts: [],
        achievements: null,
        platinum: false,
        platformSet: new Set(),
        accountSet: new Set(),
      };
      byId.set(gameId, e);
    }
    return e;
  };

  for (const r of owned.results as { account_id: string; platform: string; game_id: number }[]) {
    const e = entry(r.game_id);
    e?.platformSet.add(r.platform);
    e?.accountSet.add(r.account_id);
  }
  let minutes = 0;
  for (const r of played.results as PlayRow[]) {
    const e = entry(r.game_id);
    if (!e) continue;
    e.minutes += r.minutes;
    minutes += r.minutes;
    e.lastPlayed = later(e.lastPlayed, r.last_played);
    e.platformSet.add(r.platform);
    e.accountSet.add(r.account_id);
  }

  let achievements = 0;
  let pendingTrophies = 0;
  const psnTrophies = zero();
  const completed = new Set<number>();
  for (const s of sets) {
    if (s.pending) pendingTrophies++;
    if (s.platform !== "psn") achievements += s.earned ?? 0;
    if (s.grades) for (const k of Object.keys(psnTrophies) as (keyof TrophyCounts)[]) psnTrophies[k] += s.grades.earned[k] ?? 0;
    const e = entry(s.gameId);
    if (!e) continue;
    if (s.grades?.earned.platinum) e.platinum = true;
    if (s.total && s.earned !== null) {
      const best = e.achievements;
      if (!best || s.earned / s.total > best.earned / best.total) e.achievements = { earned: s.earned, total: s.total };
      if (s.earned >= s.total) completed.add(e.id);
    }
  }

  const list = [...byId.values()].map(({ platformSet, accountSet, ...g }) => ({ ...g, platforms: [...platformSet], accounts: [...accountSet] }));
  list.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "fr"));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      owned: list.length,
      played: list.filter((g) => g.minutes > 0).length,
      minutes,
      achievements,
      psnTrophies,
      completed: completed.size,
      pendingTrophies,
    },
    games: list,
    rarest: uniqueRarest(
      (
        rarest.results as {
          name: string;
          icon: string | null;
          grade: string | null;
          rarity: number;
          earned_at: string | null;
          platform: string;
          game_id: number;
          game: string;
        }[]
      ).map(
        (r): RareTrophy => ({
          gameId: r.game_id,
          game: r.game,
          name: r.name,
          icon: r.icon,
          grade: r.grade,
          platform: r.platform,
          rarity: r.rarity,
          earnedAt: r.earned_at,
        }),
      ),
    ),
  };
}

/** Un même trophée obtenu sur le main et le smurf ne compte qu'une fois. */
function uniqueRarest(list: RareTrophy[]) {
  const seen = new Set<string>();
  return list.filter((t) => !seen.has(`${t.gameId}|${t.name}`) && seen.add(`${t.gameId}|${t.name}`)).slice(0, 12);
}

export async function readGame(db: D1Database, id: number): Promise<GameDetail | null> {
  const game = await db.prepare("SELECT id, name, cover_url FROM games WHERE id = ? AND hidden = 0").bind(id).first<{
    id: number;
    name: string;
    cover_url: string | null;
  }>();
  if (!game) return null;

  const sets = (await readCombined(db, id)).filter((s) => s.pending || s.total !== 0);
  const [owned, played, trophies] = await db.batch([
    db
      .prepare(
        "SELECT DISTINCT l.account_id, a.platform FROM library l JOIN accounts a ON a.id = l.account_id JOIN game_aliases al ON al.id = l.alias_id WHERE al.game_id = ?",
      )
      .bind(id),
    db.prepare(`${LATEST_PLAYTIME} AND al.game_id = ?`).bind(id),
    db
      .prepare(
        "SELECT t.account_id, t.alias_id, t.trophy_id, t.name, t.description, t.icon, t.grade, t.hidden, t.earned_at, t.rarity " +
          "FROM trophies t JOIN game_aliases al ON al.id = t.alias_id WHERE al.game_id = ? ORDER BY t.account_id",
      )
      .bind(id),
  ]);

  const accounts = new Map<string, GameDetail["accounts"][number]>();
  for (const r of owned.results as { account_id: string; platform: string }[]) {
    accounts.set(r.account_id, { id: r.account_id, platform: r.platform, minutes: 0, lastPlayed: null });
  }
  for (const r of played.results as PlayRow[]) {
    const a = accounts.get(r.account_id) ?? { id: r.account_id, platform: r.platform, minutes: 0, lastPlayed: null };
    a.minutes += r.minutes;
    a.lastPlayed = later(a.lastPlayed, r.last_played);
    accounts.set(r.account_id, a);
  }

  // Un succès par (alias, identifiant), quel que soit le nombre de comptes qui l'ont.
  const byAlias = new Map<number, Map<string, CombinedTrophy>>();
  for (const t of trophies.results as {
    account_id: string;
    alias_id: number;
    trophy_id: string;
    name: string;
    description: string | null;
    icon: string | null;
    grade: string | null;
    hidden: number;
    earned_at: string | null;
    rarity: number | null;
  }[]) {
    const list = byAlias.get(t.alias_id) ?? new Map();
    byAlias.set(t.alias_id, list);
    let c = list.get(t.trophy_id);
    if (!c) {
      c = {
        id: t.trophy_id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        grade: t.grade,
        hidden: Boolean(t.hidden),
        earnedAt: null,
        rarity: t.rarity,
        earnedBy: [],
      };
      list.set(t.trophy_id, c);
    }
    c.rarity ??= t.rarity;
    if (t.earned_at) {
      c.earnedBy.push({ accountId: t.account_id, earnedAt: t.earned_at });
      if (!c.earnedAt || t.earned_at < c.earnedAt) c.earnedAt = t.earned_at;
    }
  }

  const accountList = [...accounts.values()].sort((a, b) => b.minutes - a.minutes);
  return {
    id: game.id,
    name: game.name,
    cover: game.cover_url,
    minutes: accountList.reduce((n, a) => n + a.minutes, 0),
    lastPlayed: accountList.reduce<string | null>((d, a) => later(d, a.lastPlayed), null),
    platforms: [...new Set(accountList.map((a) => a.platform))],
    accounts: accountList,
    sets: sets.map((s) => ({
      platform: s.platform,
      earned: s.earned,
      total: s.total,
      grades: s.grades,
      lastEarned: s.lastEarned,
      pending: s.pending,
      accounts: s.accounts.map((a) => ({
        accountId: a.account_id,
        earned: a.earned,
        total: a.total,
        platinum: Boolean(parseGrades(a.grades)?.earned.platinum),
        pending: Boolean(a.pending),
      })),
      trophies: [...(byAlias.get(s.aliasId)?.values() ?? [])].map((t) =>
        // Les succès cachés ne se dévoilent qu'une fois obtenus, sur au moins un compte.
        t.hidden && !t.earnedAt ? { ...t, name: "Succès caché", description: null } : t,
      ),
    })),
  };
}
