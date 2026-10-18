// Worker du profil : sert le site statique (out/), l'API et la synchro nocturne.
//   GET  /api/stats     heures agrégées, public
//   POST /api/playnite  import des heures envoyées par Playnite (clé INGEST_KEY)
//   POST /api/sync      lance la synchro Steam + PSN tout de suite (clé INGEST_KEY)
//                       ?trophies=1 : télécharge plutôt un lot de succès / trophées en attente
//   GET  /api/library   tous les jeux possédés ou joués, avec heures et progression des succès, public
//   GET  /api/game?id=  fiche d'un jeu : heures par compte, succès et trophées, public
//   GET  /api/tarkov    profils Tarkov importés, public
//   POST /api/tarkov    import d'un profil JSON tarkov.dev, ?mode=regular|pve|pvp-season|arena (clé INGEST_KEY)
//   GET  /api/trackers  stats de chaque tracker, public ; relance la synchro si elle date de plus de 3 h
//                       ?raw=<id> : réponse brute de l'API pour ce tracker
//   POST /api/trackers/sync          interroge toutes les sources tout de suite, ?id= pour une seule (clé INGEST_KEY)
//   POST /api/trackers/import?id=    stats saisies à la main {headline, stats: [{label, value}]} (clé INGEST_KEY)

import { psnAccounts, steamAccounts } from "./accounts";
import { logSync, readStats, recordPlaytime, upsertAccounts, type PlaytimeItem } from "./db";
import { readGame, readLibrary } from "./library";
import { parsePlaynite } from "./sources/playnite";
import { fetchPsnPlayed, fetchPsnPurchased, fetchPsnTrophyTitles, psnAuth } from "./sources/psn";
import { fetchSteam } from "./sources/steam";
import { recordPsnTrophyTitles, syncTrophies } from "./trophies";
import { claimStaleSync, importTrackerStats, readTrackerRaw, readTrackers, syncTrackers, trackerSecrets } from "./trackers";
import { guessMode, isMode, summarizeTarkov } from "./sources/tarkov";
import { tarkovAccountId, type TarkovProfile, type TarkovResponse } from "../src/lib/tarkov";

/** Doit correspondre au 2e cron de wrangler.jsonc. */
const TROPHY_CRON = "*/10 * * * *";
/** Doit correspondre au 3e cron de wrangler.jsonc. */
const TRACKER_CRON = "30 */3 * * *";

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
  owned?: number;
  changed?: number;
  trophyTitles?: number;
  warning?: string;
  error?: string;
}

type Loaded = PlaytimeItem[] | { items: PlaytimeItem[]; after?: () => Promise<Partial<SyncResult>> };

async function syncAccount(env: Env, accountId: string, source: string, load: () => Promise<Loaded>): Promise<SyncResult> {
  try {
    const loaded = await load();
    const { items, after } = Array.isArray(loaded) ? { items: loaded, after: undefined } : loaded;
    const { games, owned, changed } = await recordPlaytime(env.DB, accountId, source, items);
    const extra = after ? await after() : {};
    await logSync(env.DB, accountId, true, games, extra.warning ?? null);
    return { account: accountId, ok: true, games, owned, changed, ...extra };
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
        return loadPsn(env, a.id, npsso);
      }),
    );
  }
  return results;
}

/** Jeux joués + achetés, puis la liste des trophées une fois les jeux enregistrés. */
async function loadPsn(env: Env, accountId: string, npsso: string): Promise<Loaded> {
  const auth = await psnAuth(npsso);
  const played = await fetchPsnPlayed(auth);
  const warnings: string[] = [];
  // Les achats passent par une API GraphQL moins stable : un échec ne bloque pas les heures.
  const purchased = await fetchPsnPurchased(auth).catch((e) => {
    warnings.push(`achats : ${e instanceof Error ? e.message : e}`);
    return [];
  });
  return {
    items: [...played, ...purchased],
    after: async () => {
      let trophyTitles: number | undefined;
      try {
        trophyTitles = await recordPsnTrophyTitles(env.DB, accountId, await fetchPsnTrophyTitles(auth));
      } catch (e) {
        warnings.push(`trophées : ${e instanceof Error ? e.message : e}`);
      }
      return { trophyTitles, ...(warnings.length ? { warning: warnings.join(" ; ") } : {}) };
    },
  };
}

/** 4 premiers octets du SHA-256 : permet de comparer deux clés sans jamais les montrer. */
async function fingerprint(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Diagnostic public : quels secrets le Worker voit (jamais leur valeur) et les dernières synchros. */
async function health(env: Env) {
  const secret = async (name: string) => {
    const v = env[name];
    if (typeof v !== "string" || !v) return { present: false };
    const clean = v.trim().replace(/^"|"$/g, "");
    return { present: true, length: v.length, ...(clean !== v ? { cleanedLength: clean.length } : {}) };
  };
  const ingest = typeof env.INGEST_KEY === "string" ? env.INGEST_KEY.trim().replace(/^"|"$/g, "") : "";
  const { results } = await env.DB.prepare(
    "SELECT account_id, at, ok, games, message FROM sync_runs WHERE id IN (SELECT MAX(id) FROM sync_runs GROUP BY account_id) ORDER BY at DESC",
  ).all();
  return {
    secrets: {
      INGEST_KEY: { ...(await secret("INGEST_KEY")), ...(ingest ? { fingerprint: await fingerprint(ingest) } : {}) },
      STEAM_API_KEY: await secret("STEAM_API_KEY"),
      ...Object.fromEntries(await Promise.all(psnAccounts.map(async (a) => [a.npssoSecret, await secret(a.npssoSecret)]))),
      ...Object.fromEntries(await Promise.all(trackerSecrets.map(async (name) => [name, await secret(name)]))),
    },
    lastSyncs: results,
  };
}

function logTrackers(results: Awaited<ReturnType<typeof syncTrackers>>) {
  for (const r of results) if (!r.ok) console.log(`Tracker ${r.id} : ${r.skipped ?? r.error}`);
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

/** Compare la clé reçue à INGEST_KEY en temps constant. */
async function authorized(request: Request, env: Env) {
  // trim : un espace ou un retour à la ligne collé avec la valeur dans Cloudflare ne doit pas tout bloquer.
  const expected = env.INGEST_KEY?.trim().replace(/^"|"$/g, "");
  const given =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? "";
  if (!expected || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
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

async function handleApi(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (url.pathname === "/api/stats" && request.method === "GET") {
    return json(await readStats(env.DB), 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json(await health(env), 200, { "cache-control": "no-store" });
  }

  if (url.pathname === "/api/library" && request.method === "GET") {
    return json(await readLibrary(env.DB), 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/api/game" && request.method === "GET") {
    const id = Number(url.searchParams.get("id"));
    const game = Number.isInteger(id) && id > 0 ? await readGame(env.DB, id) : null;
    return game ? json(game, 200, { "cache-control": "public, max-age=300" }) : json({ error: "Jeu introuvable" }, 404);
  }

  if (url.pathname === "/api/trackers" && request.method === "GET") {
    const raw = url.searchParams.get("raw");
    if (raw) return json(await readTrackerRaw(env, raw), 200, { "cache-control": "no-store" });
    if (await claimStaleSync(env)) ctx.waitUntil(syncTrackers(env).then(logTrackers));
    return json(await readTrackers(env), 200, { "cache-control": "public, max-age=120" });
  }

  if (url.pathname === "/api/trackers/sync" || url.pathname === "/api/trackers/import") {
    if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
    if (!(await authorized(request, env))) return json({ error: "Clé invalide" }, 401);
    const id = url.searchParams.get("id") ?? undefined;
    if (url.pathname === "/api/trackers/sync") return json({ results: await syncTrackers(env, id) });
    try {
      return json({ id, summary: await importTrackerStats(env, id ?? "", await request.json()) });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "JSON invalide" }, 400);
    }
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

    if (url.pathname === "/api/sync") {
      if (url.searchParams.get("trophies")) return json(await syncTrophies(env));
      return json({ results: await syncAll(env) });
    }

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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === TRACKER_CRON) {
      ctx.waitUntil(syncTrackers(env).then(logTrackers));
      return;
    }
    if (event.cron === TROPHY_CRON) {
      ctx.waitUntil(
        syncTrophies(env).then((r) => {
          if (r.fetched || r.errors.length) console.log(`Trophées : ${r.fetched} jeux, ${r.errors.length} erreurs, ${r.remaining} en attente`);
          for (const e of r.errors) console.log(`${e.account} ${e.game} : ${e.error}`);
        }),
      );
      return;
    }
    ctx.waitUntil(
      syncAll(env).then((results) => {
        for (const r of results)
          console.log(
            r.ok
              ? `${r.account} : ${r.owned} possédés, ${r.games} joués, ${r.changed} changés${r.warning ? ` (${r.warning})` : ""}`
              : `${r.account} : ${r.error}`,
          );
      }),
    );
  },
} satisfies ExportedHandler<Env>;
