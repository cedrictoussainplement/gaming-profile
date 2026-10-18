// Stats des trackers : quelle source pour quel tracker de src/data/profile.ts,
// la synchro (cron toutes les 3 h, ou à la lecture si les chiffres sont trop vieux)
// et la saisie à la main pour les jeux sans API.

import { profile } from "../src/data/profile";
import type { TrackerMode, TrackerState, TrackerStat, TrackerSummary, TrackersResponse } from "../src/lib/trackers";
import { fetchApex, fetchBattlefield, fetchClash, fetchCs2, fetchFortnite, fetchSiege, fetchValorant, NoStatsError, type Fetched } from "./sources/trackers";

interface TrackerEnv {
  DB: D1Database;
  [secret: string]: unknown;
}

interface AutoSource {
  mode: "auto";
  source: string;
  /** Secret Cloudflare sans lequel la source ne peut pas être interrogée. */
  secret?: string;
  load: (secret: string | undefined, env: TrackerEnv) => Promise<Fetched>;
}

type Source = AutoSource | { mode: "import" | "link"; source: string | null };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Une entrée par id de profile.trackers. Un tracker absent d'ici est en lien seul. */
export const trackerSources: Record<string, Source> = {
  "apex-psn": { mode: "auto", source: "apexlegendsapi.com", secret: "APEX_API_KEY", load: (k) => fetchApex(k!, "fr__eask_", "PS4") },
  "apex-psn-smurf": { mode: "auto", source: "apexlegendsapi.com", secret: "APEX_API_KEY", load: (k) => fetchApex(k!, "fr_reask", "PS4") },
  "apex-pc": { mode: "auto", source: "apexlegendsapi.com", secret: "APEX_API_KEY", load: (k) => fetchApex(k!, "reask_oner", "PC") },
  bf2042: { mode: "auto", source: "gametools.network", load: () => fetchBattlefield("bf2042", "reask_oner") },
  bfv: { mode: "auto", source: "gametools.network", load: () => fetchBattlefield("bfv", "reask_oner") },
  bf4: { mode: "auto", source: "gametools.network", load: () => fetchBattlefield("bf4", "reask_oner") },
  r6: { mode: "auto", source: "R6Data", secret: "R6DATA_API_KEY", load: (k) => fetchSiege(k!, "reask_oner") },
  cs2: { mode: "auto", source: "Steam + Leetify", load: (_, env) => fetchCs2(str(env.STEAM_API_KEY), "76561199388154157") },
  fortnite: { mode: "auto", source: "fortnite-api.com", secret: "FORTNITE_API_KEY", load: (k) => fetchFortnite(k!, "ogreask") },
  "fortnite-smurf": { mode: "auto", source: "fortnite-api.com", secret: "FORTNITE_API_KEY", load: (k) => fetchFortnite(k!, "reask_oner") },
  valorant: { mode: "auto", source: "HenrikDev", secret: "HENRIK_API_KEY", load: (k) => fetchValorant(k!, "reask#2736") },
  coc: { mode: "auto", source: "API Supercell", secret: "COC_API_KEY", load: (k) => fetchClash(k!, "#8GR2UC8L") },
  // Pas d'API publique : stats recopiées à la main depuis la page du tracker.
  otg: { mode: "import", source: null },
  wardogs: { mode: "import", source: null },
};

export const trackerSecrets = [...new Set(Object.values(trackerSources).flatMap((s) => (s.mode === "auto" && s.secret ? [s.secret] : [])))];

/** Les chiffres sont rafraîchis au plus toutes les 3 h. */
const STALE_MS = 3 * 3600_000;

interface Row {
  tracker_id: string;
  source: string | null;
  summary: string | null;
  updated_at: string | null;
  error: string | null;
}

export async function readTrackers(env: TrackerEnv): Promise<TrackersResponse> {
  const { results } = await env.DB.prepare("SELECT tracker_id, source, summary, updated_at, error FROM tracker_stats").all<Row>();
  const rows = new Map(results.map((r) => [r.tracker_id, r]));
  return {
    trackers: profile.trackers.map((t): TrackerState => {
      const src = trackerSources[t.id] ?? { mode: "link" as TrackerMode, source: null };
      const row = rows.get(t.id);
      const missing = src.mode === "auto" && src.secret && !str(env[src.secret]) ? src.secret : null;
      return {
        id: t.id,
        mode: src.mode,
        source: row?.source ?? src.source,
        summary: row?.summary ? (JSON.parse(row.summary) as TrackerSummary) : null,
        updatedAt: row?.updated_at ?? null,
        error: missing ? null : (row?.error ?? null),
        missingSecret: missing,
      };
    }),
  };
}

export async function readTrackerRaw(env: TrackerEnv, id: string) {
  const row = await env.DB.prepare("SELECT raw FROM tracker_stats WHERE tracker_id = ?").bind(id).first<{ raw: string | null }>();
  return row?.raw ? JSON.parse(row.raw) : null;
}

export interface TrackerSyncResult {
  id: string;
  ok: boolean;
  skipped?: string;
  error?: string;
}

/** Interroge toutes les sources automatiques (une quinzaine d'appels sortants au total). */
export async function syncTrackers(env: TrackerEnv, only?: string): Promise<TrackerSyncResult[]> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE tracker_sync SET started_at = ? WHERE id = 1").bind(now).run();
  const entries = Object.entries(trackerSources).filter(([id, s]) => s.mode === "auto" && (!only || only === id)) as [string, AutoSource][];
  return Promise.all(
    entries.map(async ([id, src]): Promise<TrackerSyncResult> => {
      const secret = src.secret ? str(env[src.secret]) : undefined;
      if (src.secret && !secret) return { id, ok: false, skipped: `secret ${src.secret} manquant` };
      try {
        const { summary, raw } = await src.load(secret, env);
        await env.DB.prepare(
          "INSERT INTO tracker_stats (tracker_id, source, summary, raw, updated_at, error, attempted_at) VALUES (?, ?, ?, ?, ?, NULL, ?) " +
            "ON CONFLICT (tracker_id) DO UPDATE SET source = excluded.source, summary = excluded.summary, raw = excluded.raw, " +
            "updated_at = excluded.updated_at, error = NULL, attempted_at = excluded.attempted_at",
        )
          .bind(id, src.source, JSON.stringify(summary), JSON.stringify(raw), now, now)
          .run();
        return { id, ok: true };
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        // On garde les derniers chiffres valides, seule l'erreur est notée (sauf si la source dit n'avoir aucune stat).
        await env.DB.prepare(
          "INSERT INTO tracker_stats (tracker_id, source, error, attempted_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (tracker_id) DO UPDATE SET error = excluded.error, attempted_at = excluded.attempted_at" +
            (e instanceof NoStatsError ? ", summary = NULL, updated_at = NULL" : ""),
        )
          .bind(id, src.source, error, now)
          .run();
        return { id, ok: false, error };
      }
    }),
  );
}

/** Vrai si la dernière synchro date de plus de 3 h : prend la place de la suivante en même temps. */
export async function claimStaleSync(env: TrackerEnv): Promise<boolean> {
  const now = new Date();
  const res = await env.DB.prepare("UPDATE tracker_sync SET started_at = ? WHERE id = 1 AND (started_at IS NULL OR started_at < ?)")
    .bind(now.toISOString(), new Date(now.getTime() - STALE_MS).toISOString())
    .run();
  return res.meta.changes === 1;
}

/** Saisie à la main : {headline?, stats: [{label, value, hint?}], groups?}. */
export async function importTrackerStats(env: TrackerEnv, id: string, body: unknown) {
  if (!profile.trackers.some((t) => t.id === id)) throw new Error(`Tracker inconnu : ${id}`);
  const b = (body ?? {}) as { headline?: unknown; stats?: unknown; groups?: unknown };
  const clean = (list: unknown): TrackerStat[] =>
    (Array.isArray(list) ? list : []).flatMap((s) => {
      const label = str(s?.label)?.slice(0, 60);
      const value = str(s?.value)?.slice(0, 80);
      const hint = str(s?.hint)?.slice(0, 80);
      return label && value ? [hint ? { label, value, hint } : { label, value }] : [];
    });
  const highlights = clean(b.stats).slice(0, 12);
  if (!highlights.length) throw new Error("Aucune stat : il faut au moins une ligne « Nom : valeur »");
  const summary: TrackerSummary = { highlights };
  const headline = str(b.headline)?.slice(0, 80);
  if (headline) summary.headline = headline;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO tracker_stats (tracker_id, source, summary, raw, updated_at, error, attempted_at) VALUES (?, ?, ?, ?, ?, NULL, ?) " +
      "ON CONFLICT (tracker_id) DO UPDATE SET source = excluded.source, summary = excluded.summary, raw = excluded.raw, " +
      "updated_at = excluded.updated_at, error = NULL, attempted_at = excluded.attempted_at",
  )
    .bind(id, "saisie manuelle", JSON.stringify(summary), JSON.stringify(body), now, now)
    .run();
  return summary;
}
