// Main et smurf réunis : un succès compte dès qu'il est débloqué sur l'un des comptes.
//
// Les deux comptes d'une même plateforme partagent l'alias du jeu (même appid Steam,
// même liste de trophées PSN), donc on regroupe par alias et par identifiant de succès.
// Quand le détail n'est pas encore téléchargé, on prend le meilleur résumé des comptes.

import type { TrophyCounts } from "../src/lib/library";

export const SET_ROWS =
  "SELECT ts.account_id, ts.alias_id, ts.platform, al.game_id, ts.earned, ts.total, ts.grades, ts.last_earned, " +
  "(ts.fetched IS NOT ts.wanted) AS pending FROM trophy_sets ts JOIN game_aliases al ON al.id = ts.alias_id";

const gradeCount = (g: string, earned: boolean) =>
  `COUNT(DISTINCT CASE WHEN grade = '${g}'${earned ? " AND earned_at IS NOT NULL" : ""} THEN trophy_id END) AS ${earned ? "e" : "d"}_${g}`;

/** Union des succès de tous les comptes, par alias. */
export const DETAIL_ROWS =
  "SELECT alias_id, COUNT(DISTINCT trophy_id) AS total, COUNT(DISTINCT CASE WHEN earned_at IS NOT NULL THEN trophy_id END) AS earned, " +
  ["platinum", "gold", "silver", "bronze"].flatMap((g) => [gradeCount(g, true), gradeCount(g, false)]).join(", ") +
  " FROM trophies";

export type SetRow = {
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

export type DetailRow = { alias_id: number; total: number; earned: number } & Record<`${"e" | "d"}_${keyof TrophyCounts}`, number>;

export interface CombinedSet {
  aliasId: number;
  gameId: number;
  platform: string;
  /** Comptes qui ont ce jeu, dans l'ordre des lignes. */
  accounts: SetRow[];
  earned: number | null;
  total: number | null;
  grades: { earned: TrophyCounts; defined: TrophyCounts } | null;
  lastEarned: string | null;
  pending: boolean;
}

export const zero = (): TrophyCounts => ({ bronze: 0, silver: 0, gold: 0, platinum: 0 });
export const parseGrades = (g: string | null) => (g ? (JSON.parse(g) as { earned: TrophyCounts; defined: TrophyCounts }) : null);
const later = (a: string | null, b: string | null) => (b && (!a || b > a) ? b : a);
const keys = ["platinum", "gold", "silver", "bronze"] as const;
const maxOf = (values: (number | null)[]) => values.reduce<number | null>((m, v) => (v === null ? m : m === null ? v : Math.max(m, v)), null);

export function combineSets(sets: SetRow[], details: DetailRow[]): CombinedSet[] {
  const detail = new Map(details.map((d) => [d.alias_id, d]));
  const byAlias = new Map<number, SetRow[]>();
  for (const s of sets) byAlias.set(s.alias_id, [...(byAlias.get(s.alias_id) ?? []), s]);

  return [...byAlias.values()].map((rows) => {
    const first = rows[0];
    const d = detail.get(first.alias_id);
    const summaries = rows.map((r) => parseGrades(r.grades)).filter((g) => g !== null);
    let grades: CombinedSet["grades"] = null;
    if (first.platform === "psn" && (summaries.length || d)) {
      grades = { earned: zero(), defined: zero() };
      for (const k of keys) {
        grades.earned[k] = Math.max(d?.[`e_${k}`] ?? 0, ...summaries.map((g) => g.earned[k] ?? 0));
        grades.defined[k] = Math.max(d?.[`d_${k}`] ?? 0, ...summaries.map((g) => g.defined[k] ?? 0));
      }
    }
    // Le détail donne l'union exacte ; le résumé d'un compte pas encore détaillé peut dépasser.
    const earned = maxOf([d?.earned ?? null, ...rows.map((r) => r.earned)]);
    const total = maxOf([d?.total ?? null, ...rows.map((r) => r.total)]);
    return {
      aliasId: first.alias_id,
      gameId: first.game_id,
      platform: first.platform,
      accounts: rows,
      earned,
      total,
      grades,
      lastEarned: rows.reduce<string | null>((m, r) => later(m, r.last_earned), null),
      pending: rows.some((r) => r.pending),
    };
  });
}

/** Lit et réunit les succès de tous les comptes (filtre SQL optionnel sur le jeu). */
export async function readCombined(db: D1Database, gameId?: number) {
  const [sets, details] = await db.batch([
    gameId === undefined ? db.prepare(SET_ROWS) : db.prepare(`${SET_ROWS} WHERE al.game_id = ?`).bind(gameId),
    gameId === undefined
      ? db.prepare(`${DETAIL_ROWS} GROUP BY alias_id`)
      : db.prepare(`${DETAIL_ROWS} WHERE alias_id IN (SELECT id FROM game_aliases WHERE game_id = ?) GROUP BY alias_id`).bind(gameId),
  ]);
  return combineSets(sets.results as SetRow[], details.results as DetailRow[]);
}
