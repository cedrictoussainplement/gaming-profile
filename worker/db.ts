import type { Stats } from "../src/lib/stats";
import { allAccounts } from "./accounts";

/** Un jeu tel que renvoyé par une source, temps cumulé depuis toujours. */
export interface PlaytimeItem {
  externalId: string;
  name: string;
  minutes: number;
  lastPlayed?: string | null;
  cover?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** "Battlefield™ 2042 (PS5)" → "battlefield-2042" : sert à fusionner les doublons entre plateformes. */
export function slugify(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[([]?\b(ps4|ps5|playstation ?[45]|pc)( (edition|version))?\b[)\]]?\s*$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function batchAll(db: D1Database, statements: D1PreparedStatement[]) {
  const results: D1Result[] = [];
  for (let i = 0; i < statements.length; i += 50) {
    results.push(...(await db.batch(statements.slice(i, i + 50))));
  }
  return results;
}

export async function upsertAccounts(db: D1Database) {
  const stmt = db.prepare(
    "INSERT INTO accounts (id, platform, handle, role) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (id) DO UPDATE SET platform = excluded.platform, handle = excluded.handle, role = excluded.role",
  );
  await batchAll(
    db,
    allAccounts().map((a) => stmt.bind(a.id, a.platform, a.handle, a.role)),
  );
}

/**
 * Enregistre le temps de jeu d'un compte. Crée les jeux et alias manquants, puis
 * n'écrit une ligne d'historique que pour les jeux dont le temps a changé.
 */
export async function recordPlaytime(db: D1Database, accountId: string, source: string, items: PlaytimeItem[]) {
  // Une source peut renvoyer plusieurs lignes pour un même id (ex. versions PS4 et PS5) : on les additionne.
  const merged = new Map<string, PlaytimeItem>();
  for (const i of items) {
    const prev = merged.get(i.externalId);
    if (!prev) merged.set(i.externalId, { ...i });
    else {
      prev.minutes += i.minutes;
      if (i.lastPlayed && (!prev.lastPlayed || i.lastPlayed > prev.lastPlayed)) prev.lastPlayed = i.lastPlayed;
      prev.cover ??= i.cover;
    }
  }
  const played = [...merged.values()].filter((i) => i.minutes > 0 && i.name.trim() && slugify(i.name));

  const known = new Map<string, number>();
  const loadAliases = async () => {
    const { results } = await db
      .prepare("SELECT id, external_id FROM game_aliases WHERE source = ?")
      .bind(source)
      .all<{ id: number; external_id: string }>();
    for (const r of results) known.set(r.external_id, r.id);
  };
  await loadAliases();

  const missing = played.filter((i) => !known.has(i.externalId));
  if (missing.length) {
    const upsertGame = db.prepare(
      "INSERT INTO games (slug, name, cover_url) VALUES (?, ?, ?) " +
        "ON CONFLICT (slug) DO UPDATE SET cover_url = COALESCE(games.cover_url, excluded.cover_url)",
    );
    const insertAlias = db.prepare(
      "INSERT INTO game_aliases (source, external_id, name, game_id) " +
        "VALUES (?, ?, ?, (SELECT id FROM games WHERE slug = ?)) ON CONFLICT (source, external_id) DO NOTHING",
    );
    await batchAll(
      db,
      missing.flatMap((i) => {
        const slug = slugify(i.name);
        return [
          upsertGame.bind(slug, i.name.replace(/[™®©]/g, "").trim(), i.cover ?? null),
          insertAlias.bind(source, i.externalId, i.name.trim(), slug),
        ];
      }),
    );
    await loadAliases();
  }

  const { results: latest } = await db
    .prepare(
      "SELECT alias_id, minutes FROM playtime_snapshots s WHERE account_id = ?1 AND taken_on = " +
        "(SELECT MAX(taken_on) FROM playtime_snapshots WHERE account_id = ?1 AND alias_id = s.alias_id)",
    )
    .bind(accountId)
    .all<{ alias_id: number; minutes: number }>();
  const previous = new Map(latest.map((r) => [r.alias_id, r.minutes]));

  const insert = db.prepare(
    "INSERT INTO playtime_snapshots (account_id, alias_id, taken_on, minutes, last_played) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT (account_id, alias_id, taken_on) DO UPDATE SET minutes = excluded.minutes, last_played = excluded.last_played",
  );
  const day = today();
  const changed = played.filter((i) => {
    const aliasId = known.get(i.externalId);
    return aliasId !== undefined && previous.get(aliasId) !== i.minutes;
  });
  await batchAll(
    db,
    changed.map((i) => insert.bind(accountId, known.get(i.externalId)!, day, i.minutes, i.lastPlayed ?? null)),
  );
  return { games: played.length, changed: changed.length };
}

export async function logSync(db: D1Database, accountId: string, ok: boolean, games: number | null, message: string | null) {
  await db
    .prepare("INSERT INTO sync_runs (account_id, at, ok, games, message) VALUES (?, ?, ?, ?, ?)")
    .bind(accountId, new Date().toISOString(), ok ? 1 : 0, games, message)
    .run();
}

function mondayOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const WEEKS = 12;

export async function readStats(db: D1Database): Promise<Stats> {
  const [snapshots, syncs] = await db.batch([
    db.prepare(
      "SELECT s.account_id, s.alias_id, s.taken_on, s.minutes, s.last_played, a.platform, g.id AS game_id, g.name, g.cover_url " +
        "FROM playtime_snapshots s JOIN accounts a ON a.id = s.account_id " +
        "JOIN game_aliases al ON al.id = s.alias_id JOIN games g ON g.id = al.game_id " +
        "WHERE g.hidden = 0 ORDER BY s.taken_on, s.alias_id",
    ),
    db.prepare("SELECT account_id, MAX(at) AS at FROM sync_runs WHERE ok = 1 GROUP BY account_id"),
  ]);
  type Row = {
    account_id: string;
    alias_id: number;
    taken_on: string;
    minutes: number;
    last_played: string | null;
    platform: string;
    game_id: number;
    name: string;
    cover_url: string | null;
  };
  const rows = snapshots.results as Row[];

  // Dernière valeur par (compte, alias) + minutes jouées par jour.
  // Le premier relevé d'un compte sert de point de départ : il ne compte pas comme du temps joué ce jour-là.
  const firstDay = new Map<string, string>();
  for (const r of rows) if (!firstDay.has(r.account_id)) firstDay.set(r.account_id, r.taken_on);
  const latest = new Map<string, Row>();
  const playedOn = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.account_id}|${r.alias_id}`;
    const prev = latest.get(key);
    const delta = prev ? r.minutes - prev.minutes : r.taken_on === firstDay.get(r.account_id) ? 0 : r.minutes;
    if (delta > 0) playedOn.set(r.taken_on, (playedOn.get(r.taken_on) ?? 0) + delta);
    latest.set(key, r);
  }

  const games = new Map<
    number,
    { id: number; name: string; cover: string | null; minutes: number; platforms: Set<string>; lastPlayed: string | null }
  >();
  const platforms = new Map<string, number>();
  const accounts: Stats["accounts"] = {};
  const accountGames = new Map<string, Set<number>>();
  let totalMinutes = 0;
  for (const r of latest.values()) {
    totalMinutes += r.minutes;
    platforms.set(r.platform, (platforms.get(r.platform) ?? 0) + r.minutes);
    const g = games.get(r.game_id) ?? {
      id: r.game_id,
      name: r.name,
      cover: r.cover_url,
      minutes: 0,
      platforms: new Set(),
      lastPlayed: null,
    };
    g.minutes += r.minutes;
    g.platforms.add(r.platform);
    if (r.last_played && (!g.lastPlayed || r.last_played > g.lastPlayed)) g.lastPlayed = r.last_played;
    games.set(r.game_id, g);
    const acc = (accounts[r.account_id] ??= { minutes: 0, games: 0, lastSync: null });
    acc.minutes += r.minutes;
    const set = accountGames.get(r.account_id) ?? new Set();
    set.add(r.game_id);
    accountGames.set(r.account_id, set);
  }
  for (const [id, set] of accountGames) accounts[id].games = set.size;

  let lastSync: string | null = null;
  for (const s of syncs.results as { account_id: string; at: string }[]) {
    (accounts[s.account_id] ??= { minutes: 0, games: 0, lastSync: null }).lastSync = s.at;
    if (!lastSync || s.at > lastSync) lastSync = s.at;
  }

  const weekly = new Map<string, number>();
  const thisWeek = mondayOf(new Date().toISOString().slice(0, 10));
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weekly.set(d.toISOString().slice(0, 10), 0);
  }
  for (const [day, minutes] of playedOn) {
    const week = mondayOf(day);
    if (weekly.has(week)) weekly.set(week, weekly.get(week)! + minutes);
  }

  return {
    generatedAt: new Date().toISOString(),
    lastSync,
    trackingSince: rows[0]?.taken_on ?? null,
    totalMinutes,
    gameCount: games.size,
    platforms: [...platforms].map(([platform, minutes]) => ({ platform, minutes })).sort((a, b) => b.minutes - a.minutes),
    accounts,
    topGames: [...games.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12)
      .map((g) => ({ ...g, platforms: [...g.platforms] })),
    weekly: [...weekly].map(([weekStart, minutes]) => ({ weekStart, minutes })),
  };
}
