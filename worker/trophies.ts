// Succès Steam et trophées PlayStation.
//
// La synchro de nuit note l'état de chaque jeu (trophy_sets.wanted). Le détail
// (liste, icônes, rareté) coûte 2 à 3 appels par jeu : un cron toutes les
// 10 minutes en télécharge quelques-uns à chaque passage, sans dépasser la limite
// d'appels sortants d'un Worker gratuit.

import type { TrophyTitle } from "psn-api";
import { psnAccounts, steamAccounts } from "./accounts";
import { batchAll, ensureAliases, markOwned, queueTrophySets } from "./db";
import type { Env } from "./index";
import { fetchPsnTrophies, psnAuth, trophyTitleName, type PsnAuth } from "./sources/psn";
import { fetchSteamAchievements, resolveSteamId } from "./sources/steam";

export interface FetchedTrophy {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  grade: string | null;
  hidden: boolean;
  earnedAt: string | null;
  rarity: number | null;
}

/** Appels sortants par passage du cron (limite Worker gratuit : 50). */
export const CALL_BUDGET = 40;
/** Après une erreur, on attend avant de réessayer le même jeu. */
const RETRY_AFTER_MS = 20 * 3600 * 1000;

const sumCounts = (c: { bronze: number; silver: number; gold: number; platinum: number }) => c.bronze + c.silver + c.gold + c.platinum;

/** Enregistre la liste des jeux à trophées d'un compte PSN : bibliothèque + progression. */
export async function recordPsnTrophyTitles(db: D1Database, accountId: string, titles: TrophyTitle[]) {
  const items = titles
    .map((t) => ({ title: t, externalId: t.npCommunicationId, name: trophyTitleName(t.trophyTitleName), cover: t.trophyTitleIconUrl || null }))
    .filter((i) => i.name);
  const known = await ensureAliases(db, "psn-trophy", items);
  await markOwned(
    db,
    accountId,
    items.flatMap((i) => known.get(i.externalId) ?? []),
  );
  await queueTrophySets(
    db,
    accountId,
    "psn",
    items
      .filter((i) => known.has(i.externalId))
      .map(({ title: t, externalId }) => {
        const earned = sumCounts(t.earnedTrophies);
        return {
          aliasId: known.get(externalId)!,
          wanted: `${t.lastUpdatedDateTime}|${t.trophySetVersion}|${earned}`,
          earned,
          total: sumCounts(t.definedTrophies),
          grades: JSON.stringify({ earned: t.earnedTrophies, defined: t.definedTrophies }),
          lastEarned: earned > 0 ? t.lastUpdatedDateTime : null,
          meta: JSON.stringify({ service: t.npServiceName }),
        };
      }),
  );
  return items.length;
}

async function saveTrophies(db: D1Database, accountId: string, aliasId: number, wanted: string, list: FetchedTrophy[]) {
  const upsert = db.prepare(
    "INSERT INTO trophies (account_id, alias_id, trophy_id, name, description, icon, grade, hidden, earned_at, rarity) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, alias_id, trophy_id) DO UPDATE SET " +
      "name = excluded.name, description = excluded.description, icon = excluded.icon, grade = excluded.grade, " +
      "hidden = excluded.hidden, earned_at = excluded.earned_at, rarity = excluded.rarity " +
      "WHERE trophies.earned_at IS NOT excluded.earned_at OR trophies.rarity IS NOT excluded.rarity " +
      "OR trophies.name IS NOT excluded.name OR trophies.icon IS NOT excluded.icon",
  );
  const rows = list.map((t) =>
    upsert.bind(
      accountId,
      aliasId,
      t.id.slice(0, 200),
      t.name.slice(0, 300),
      t.description?.slice(0, 1000) ?? null,
      t.icon?.slice(0, 500) ?? null,
      t.grade,
      t.hidden ? 1 : 0,
      t.earnedAt,
      // Arrondi : évite de réécrire chaque ligne quand la rareté bouge d'un centième.
      t.rarity === null ? null : Math.round(t.rarity * 10) / 10,
    ),
  );
  const earned = list.filter((t) => t.earnedAt);
  const lastEarned = earned.reduce<string | null>((max, t) => (t.earnedAt! > (max ?? "") ? t.earnedAt : max), null);
  rows.push(
    db
      .prepare(
        "UPDATE trophy_sets SET earned = ?, total = ?, last_earned = ?, fetched = ?, attempted_at = ?, error = NULL WHERE account_id = ? AND alias_id = ?",
      )
      .bind(earned.length, list.length, lastEarned, wanted, new Date().toISOString(), accountId, aliasId),
  );
  await batchAll(db, rows);
}

interface Job {
  account_id: string;
  alias_id: number;
  platform: string;
  wanted: string;
  meta: string | null;
  external_id: string;
}

export interface TrophyRunResult {
  fetched: number;
  errors: { account: string; game: string; error: string }[];
  remaining: number;
}

/** Télécharge le détail des jeux en attente, dans la limite de CALL_BUDGET appels sortants. */
export async function syncTrophies(env: Env, budget = CALL_BUDGET): Promise<TrophyRunResult> {
  const retryBefore = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  const { results: jobs } = await env.DB.prepare(
    "SELECT ts.account_id, ts.alias_id, ts.platform, ts.wanted, ts.meta, al.external_id FROM trophy_sets ts " +
      "JOIN game_aliases al ON al.id = ts.alias_id " +
      "WHERE ts.fetched IS NOT ts.wanted AND (ts.error IS NULL OR ts.attempted_at < ?) " +
      "ORDER BY ts.attempted_at IS NOT NULL, ts.attempted_at, ts.last_earned DESC LIMIT 30",
  )
    .bind(retryBefore)
    .all<Job>();

  const result: TrophyRunResult = { fetched: 0, errors: [], remaining: 0 };
  let calls = 0;
  const steamIds = new Map<string, string>();
  const psnTokens = new Map<string, PsnAuth>();
  const blocked = new Set<string>();

  const fail = async (job: Job, error: string) => {
    result.errors.push({ account: job.account_id, game: job.external_id, error });
    await env.DB.prepare("UPDATE trophy_sets SET attempted_at = ?, error = ? WHERE account_id = ? AND alias_id = ?")
      .bind(new Date().toISOString(), error.slice(0, 300), job.account_id, job.alias_id)
      .run();
  };

  for (const job of jobs) {
    if (blocked.has(job.account_id)) continue;
    try {
      if (job.platform === "steam") {
        const account = steamAccounts.find((a) => a.id === job.account_id);
        const key = env.STEAM_API_KEY;
        if (!account || !key) {
          blocked.add(job.account_id);
          continue;
        }
        const setup = steamIds.has(job.account_id) || account.steamId ? 0 : 1;
        if (calls + setup + 3 > budget) break;
        let steamid = steamIds.get(job.account_id);
        if (!steamid) {
          calls += setup;
          steamid = await resolveSteamId(key, account);
          steamIds.set(job.account_id, steamid);
        }
        calls += 3;
        await saveTrophies(env.DB, job.account_id, job.alias_id, job.wanted, await fetchSteamAchievements(key, steamid, job.external_id));
      } else {
        const account = psnAccounts.find((a) => a.id === job.account_id);
        const npsso = account ? env[account.npssoSecret] : undefined;
        if (typeof npsso !== "string" || !npsso) {
          blocked.add(job.account_id);
          continue;
        }
        const setup = psnTokens.has(job.account_id) ? 0 : 2;
        if (calls + setup + 2 > budget) break;
        let auth = psnTokens.get(job.account_id);
        if (!auth) {
          calls += setup;
          auth = await psnAuth(npsso);
          psnTokens.set(job.account_id, auth);
        }
        calls += 2;
        const service = job.meta ? (JSON.parse(job.meta) as { service?: "trophy" | "trophy2" }).service : undefined;
        await saveTrophies(env.DB, job.account_id, job.alias_id, job.wanted, await fetchPsnTrophies(auth, job.external_id, service ?? "trophy2"));
      }
      result.fetched++;
    } catch (e) {
      const error = e instanceof Error ? e.message.trim() : String(e);
      await fail(job, error);
      // Profil privé ou jeton expiré : inutile d'insister sur les autres jeux du compte.
      if (/HTTP 40[13]|not public|private|npsso|token|auth/i.test(error)) {
        blocked.add(job.account_id);
        await env.DB.prepare("UPDATE trophy_sets SET attempted_at = ?, error = ? WHERE account_id = ? AND fetched IS NOT wanted AND error IS NULL")
          .bind(new Date().toISOString(), error.slice(0, 300), job.account_id)
          .run();
      }
    }
  }

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM trophy_sets WHERE fetched IS NOT wanted").first<{ n: number }>();
  result.remaining = pending?.n ?? 0;
  return result;
}
