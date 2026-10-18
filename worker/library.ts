// Lecture de la bibliothèque (GET /api/library) et de la fiche d'un jeu (GET /api/game).

import type { GameDetail, Library, LibraryGame, RareTrophy, Trophy, TrophyCounts } from "../src/lib/library";

const LATEST_PLAYTIME =
  "SELECT s.account_id, a.platform, al.game_id, s.alias_id, s.minutes, s.last_played FROM playtime_snapshots s " +
  "JOIN accounts a ON a.id = s.account_id JOIN game_aliases al ON al.id = s.alias_id " +
  "WHERE s.taken_on = (SELECT MAX(taken_on) FROM playtime_snapshots WHERE account_id = s.account_id AND alias_id = s.alias_id)";

type PlayRow = { account_id: string; platform: string; game_id: number; alias_id: number; minutes: number; last_played: string | null };
type SetRow = {
  account_id: string;
  alias_id: number;
  platform: string;
  game_id: number;
  earned: number | null;
  total: number | null;
  grades: string | null;
  last_earned: string | null;
  pending: number;
};

const zero = (): TrophyCounts => ({ bronze: 0, silver: 0, gold: 0, platinum: 0 });
const parseGrades = (g: string | null) => (g ? (JSON.parse(g) as { earned: TrophyCounts; defined: TrophyCounts }) : null);
const later = (a: string | null, b: string | null) => (b && (!a || b > a) ? b : a);

const SETS =
  "SELECT ts.account_id, ts.alias_id, ts.platform, al.game_id, ts.earned, ts.total, ts.grades, ts.last_earned, " +
  "(ts.fetched IS NOT ts.wanted) AS pending FROM trophy_sets ts JOIN game_aliases al ON al.id = ts.alias_id";

export async function readLibrary(db: D1Database): Promise<Library> {
  const [games, owned, played, sets, rarest] = await db.batch([
    db.prepare("SELECT id, name, cover_url FROM games WHERE hidden = 0"),
    db.prepare(
      "SELECT l.account_id, a.platform, al.game_id FROM library l JOIN accounts a ON a.id = l.account_id JOIN game_aliases al ON al.id = l.alias_id",
    ),
    db.prepare(LATEST_PLAYTIME),
    db.prepare(SETS),
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

  let steamAchievements = 0;
  let pendingTrophies = 0;
  const psnTrophies = zero();
  const completed = new Set<number>();
  for (const s of sets.results as SetRow[]) {
    if (s.pending) pendingTrophies++;
    const grades = parseGrades(s.grades);
    if (s.platform === "steam") steamAchievements += s.earned ?? 0;
    if (grades) for (const k of Object.keys(psnTrophies) as (keyof TrophyCounts)[]) psnTrophies[k] += grades.earned[k] ?? 0;
    const e = entry(s.game_id);
    if (!e) continue;
    if (grades?.earned.platinum) e.platinum = true;
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
      steamAchievements,
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

  const [owned, played, sets, trophies] = await db.batch([
    db
      .prepare(
        "SELECT DISTINCT l.account_id, a.platform FROM library l JOIN accounts a ON a.id = l.account_id JOIN game_aliases al ON al.id = l.alias_id WHERE al.game_id = ?",
      )
      .bind(id),
    db.prepare(`${LATEST_PLAYTIME} AND al.game_id = ?`).bind(id),
    db.prepare(`${SETS} WHERE al.game_id = ?`).bind(id),
    db
      .prepare(
        "SELECT t.account_id, t.alias_id, t.trophy_id, t.name, t.description, t.icon, t.grade, t.hidden, t.earned_at, t.rarity " +
          "FROM trophies t JOIN game_aliases al ON al.id = t.alias_id WHERE al.game_id = ?",
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

  const byKey = new Map<string, Trophy[]>();
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
    const key = `${t.account_id}|${t.alias_id}`;
    const list = byKey.get(key) ?? [];
    list.push({
      id: t.trophy_id,
      // Les succès cachés ne se dévoilent qu'une fois obtenus.
      name: t.hidden && !t.earned_at ? "Succès caché" : t.name,
      description: t.hidden && !t.earned_at ? null : t.description,
      icon: t.icon,
      grade: t.grade,
      hidden: Boolean(t.hidden),
      earnedAt: t.earned_at,
      rarity: t.rarity,
    });
    byKey.set(key, list);
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
    // Jeu Steam sans succès : rien à afficher.
    sets: (sets.results as SetRow[])
      .filter((s) => s.pending || s.total !== 0)
      .map((s) => ({
        accountId: s.account_id,
        platform: s.platform,
        earned: s.earned,
        total: s.total,
        grades: parseGrades(s.grades),
        lastEarned: s.last_earned,
        pending: Boolean(s.pending),
        trophies: byKey.get(`${s.account_id}|${s.alias_id}`) ?? [],
      })),
  };
}
