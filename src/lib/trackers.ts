// Format de GET /api/trackers, partagé entre le Worker et les pages.
// Chaque tracker de src/data/profile.ts a une ligne : stats résumées par le Worker
// (synchro automatique ou import à la main), ou la raison pour laquelle il n'y en a pas.

export interface TrackerStat {
  label: string;
  value: string;
  hint?: string;
}

export interface TrackerSummary {
  /** Rang ou titre affiché en tête (« Diamant 2 », « Niveau 312 »). */
  headline?: string;
  /** Icône du rang quand la source en donne une. */
  image?: string;
  /** 4 à 6 chiffres clés, affichés en tuiles. */
  highlights: TrackerStat[];
  /** Détail optionnel : un tableau par groupe (modes, légendes, classes…). */
  groups?: { title: string; rows: TrackerStat[] }[];
}

/** auto : API interrogée par le Worker. import : saisie à la main. link : lien seulement. */
export type TrackerMode = "auto" | "import" | "link";

export interface TrackerState {
  id: string;
  mode: TrackerMode;
  /** Nom de la source des chiffres (« gametools.network »). */
  source: string | null;
  summary: TrackerSummary | null;
  /** Date de la dernière synchro réussie ou de l'import (ISO). */
  updatedAt: string | null;
  /** Dernière erreur, si la dernière tentative a échoué (les chiffres précédents restent). */
  error: string | null;
  /** Secret Cloudflare à ajouter pour activer la synchro. */
  missingSecret: string | null;
}

export interface TrackersResponse {
  trackers: TrackerState[];
}

/** Valeur numérique au format français, ou « — ». */
export function num(n: unknown, digits = 0): string {
  const v = typeof n === "string" ? Number(n.replace(/[%\s]/g, "").replace(",", ".")) : Number(n);
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function percent(n: unknown, digits = 1): string {
  const s = num(n, digits);
  return s === "—" ? s : `${s} %`;
}

export function hours(seconds: unknown): string {
  const v = Number(seconds);
  if (!Number.isFinite(v) || v <= 0) return "—";
  return `${num(Math.round(v / 3600))} h`;
}
