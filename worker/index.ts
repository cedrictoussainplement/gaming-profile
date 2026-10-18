// Worker du profil : sert le site statique (out/), l'API et la synchro nocturne.
//   GET  /api/stats     heures agrégées, public
//   POST /api/playnite  import des heures envoyées par Playnite (clé INGEST_KEY)
//   POST /api/sync      lance la synchro Steam + PSN tout de suite (clé INGEST_KEY)
//   GET  /api/tarkov    profils Tarkov importés, public
//   POST /api/tarkov    import d'un profil JSON tarkov.dev, ?mode=regular|pve|pvp-season|arena (clé INGEST_KEY)

import { psnAccounts, steamAccounts } from "./accounts";
import { logSync, readStats, recordPlaytime, upsertAccounts, type PlaytimeItem } from "./db";
import { parsePlaynite } from "./sources/playnite";
import { fetchPsn } from "./sources/psn";
import { fetchSteam } from "./sources/steam";
import { guessMode, isMode, summarizeTarkov } from "./sources/tarkov";
import { tarkovAccountId, type TarkovProfile, type TarkovResponse } from "../src/lib/tarkov";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  STEAM_API_KEY?: string;
  INGEST_KEY?: string;
  [secret: string]: unknown;
}

interface SyncResult {
  account: string;
  ok: boolean;
  games?: number;
  changed?: number;
  error?: string;
}

async function syncAccount(env: Env, accountId: string, source: string, load: () => Promise<PlaytimeItem[]>): Promise<SyncResult> {
  try {
    const items = await load();
    const { games, changed } = await recordPlaytime(env.DB, accountId, source, items);
    await logSync(env.DB, accountId, true, games, null);
    return { account: accountId, ok: true, games, changed };
  } catch (e) {
    const error = e instanceof Error ? e.message.trim() : String(e);
    await logSync(env.DB, accountId, false, null, error);
    return { account: accountId, ok: false, error };
  }
}

async function syncAll(env: Env): Promise<SyncResult[]> {
  await upsertAccounts(env.DB);
  const results: SyncResult[] = [];
  for (const a of steamAccounts) {
    results.push(
      await syncAccount(env, a.id, "steam", () => {
        if (!env.STEAM_API_KEY) throw new Error("Secret STEAM_API_KEY manquant");
        return fetchSteam(env.STEAM_API_KEY, a);
      }),
    );
  }
  for (const a of psnAccounts) {
    results.push(
      await syncAccount(env, a.id, "psn", () => {
        const npsso = env[a.npssoSecret];
        if (typeof npsso !== "string" || !npsso) throw new Error(`Secret ${a.npssoSecret} manquant`);
        return fetchPsn(npsso);
      }),
    );
  }
  return results;
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

/** Compare la clé reçue à INGEST_KEY en temps constant. */
async function authorized(request: Request, env: Env) {
  const expected = env.INGEST_KEY;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function importTarkov(request: Request, env: Env, url: URL): Promise<Response> {
  const text = await request.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const mode = url.searchParams.get("mode") ?? guessMode(raw);
  if (!isMode(mode)) return json({ error: "Mode manquant : regular, pve, pvp-season ou arena" }, 400);

  let summary;
  try {
    summary = await summarizeTarkov(raw, mode);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
  const { profile, warning } = summary;
  await env.DB.prepare(
    "INSERT INTO tarkov_profiles (mode, summary, raw, imported_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (mode) DO UPDATE SET summary = excluded.summary, raw = excluded.raw, imported_at = excluded.imported_at",
  )
    .bind(mode, JSON.stringify(profile), text, profile.importedAt)
    .run();

  // Le temps de jeu du mode rejoint les heures du profil comme n'importe quelle source.
  await upsertAccounts(env.DB);
  const name = mode === "arena" ? "Escape from Tarkov: Arena" : "Escape from Tarkov";
  const hours = await syncAccount(env, tarkovAccountId[mode], "tarkov", async () => [
    { externalId: mode === "arena" ? "arena" : "eft", name, minutes: Math.round(profile.playSeconds / 60), lastPlayed: profile.lastActive },
  ]);
  return json({ mode, nickname: profile.nickname, level: profile.level, warning, hours });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/stats" && request.method === "GET") {
    return json(await readStats(env.DB), 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/api/tarkov" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT summary FROM tarkov_profiles").all<{ summary: string }>();
    const body: TarkovResponse = { profiles: results.map((r) => JSON.parse(r.summary) as TarkovProfile) };
    return json(body, 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/api/tarkov") {
    if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
    if (!(await authorized(request, env))) return json({ error: "Clé invalide" }, 401);
    return importTarkov(request, env, url);
  }

  if (url.pathname === "/api/playnite" || url.pathname === "/api/sync") {
    if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
    if (!(await authorized(request, env))) return json({ error: "Clé invalide" }, 401);

    if (url.pathname === "/api/sync") return json({ results: await syncAll(env) });

    let byAccount;
    try {
      byAccount = parsePlaynite(await request.json());
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "JSON invalide" }, 400);
    }
    await upsertAccounts(env.DB);
    const results: SyncResult[] = [];
    for (const [accountId, items] of byAccount) {
      results.push(await syncAccount(env, accountId, "playnite", async () => items));
    }
    return json({ results });
  }

  return json({ error: "Introuvable" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      syncAll(env).then((results) => {
        for (const r of results) console.log(r.ok ? `${r.account} : ${r.games} jeux, ${r.changed} changés` : `${r.account} : ${r.error}`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
