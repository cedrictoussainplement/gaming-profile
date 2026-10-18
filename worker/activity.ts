// Fil d'activité (GET /api/activity) : succès débloqués et temps joué jour par jour.
//
// Une « session » est le temps ajouté entre deux synchros d'un même jeu : le premier
// relevé d'un jeu ne compte pas, sinon tout l'historique tomberait le jour de l'import.

import type { Activity } from "../src/lib/library";

const DAYS = 60;

export async function readActivity(db: D1Database): Promise<Activity> {
  const since = new Date(Date.now() - DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const [unlocks, sessions] = await db.batch([
    db
      .prepare(
        "SELECT t.name, t.icon, t.grade, t.rarity, t.earned_at, t.account_id, ts.platform, g.id AS game_id, g.name AS game FROM trophies t " +
          "JOIN trophy_sets ts ON ts.account_id = t.account_id AND ts.alias_id = t.alias_id " +
          "JOIN game_aliases al ON al.id = t.alias_id JOIN games g ON g.id = al.game_id " +
          "WHERE t.earned_at >= ? AND g.hidden = 0 ORDER BY t.earned_at DESC LIMIT 200",
      )
      .bind(since),
    db
      .prepare(
        "SELECT s.account_id, a.platform, s.taken_on, g.id AS game_id, g.name AS game, g.cover_url, " +
          "s.minutes - (SELECT p.minutes FROM playtime_snapshots p WHERE p.account_id = s.account_id AND p.alias_id = s.alias_id " +
          "AND p.taken_on < s.taken_on ORDER BY p.taken_on DESC LIMIT 1) AS added " +
          "FROM playtime_snapshots s JOIN accounts a ON a.id = s.account_id " +
          "JOIN game_aliases al ON al.id = s.alias_id JOIN games g ON g.id = al.game_id " +
          "WHERE s.taken_on >= ? AND g.hidden = 0 AND added > 0 ORDER BY s.taken_on DESC LIMIT 300",
      )
      .bind(since),
  ]);

  const days = new Map<string, Activity["days"][number]>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) days.set(date, (d = { date, unlocks: [], sessions: [] }));
    return d;
  };
  for (const u of unlocks.results as {
    name: string;
    icon: string | null;
    grade: string | null;
    rarity: number | null;
    earned_at: string;
    account_id: string;
    platform: string;
    game_id: number;
    game: string;
  }[]) {
    day(u.earned_at.slice(0, 10)).unlocks.push({
      gameId: u.game_id,
      game: u.game,
      accountId: u.account_id,
      platform: u.platform,
      name: u.name,
      icon: u.icon,
      grade: u.grade,
      rarity: u.rarity,
      earnedAt: u.earned_at,
    });
  }
  for (const s of sessions.results as {
    account_id: string;
    platform: string;
    taken_on: string;
    game_id: number;
    game: string;
    cover_url: string | null;
    added: number;
  }[]) {
    day(s.taken_on.slice(0, 10)).sessions.push({
      gameId: s.game_id,
      game: s.game,
      cover: s.cover_url,
      accountId: s.account_id,
      platform: s.platform,
      minutes: s.added,
    });
  }
  return { days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)) };
}
