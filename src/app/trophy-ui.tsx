// Petits éléments partagés par la bibliothèque et la fiche jeu.

import type { TrophyCounts } from "@/lib/library";

export const fmt = (n: number) => n.toLocaleString("fr-FR");

export const percent = (earned: number, total: number) => (total > 0 ? Math.floor((earned / total) * 100) : 0);

export function formatRarity(r: number) {
  return `${r.toLocaleString("fr-FR", { maximumFractionDigits: r < 10 ? 1 : 0 })} %`;
}

/** Même seuils que la section Tarkov : sous 5 % légendaire, sous 15 % rare. */
export const rarityClass = (r: number | null) => (r === null ? "" : r < 5 ? "rarity-legendary" : r < 15 ? "rarity-rare" : "");

export const gradeLabel: Record<keyof TrophyCounts, string> = {
  platinum: "Platine",
  gold: "Or",
  silver: "Argent",
  bronze: "Bronze",
};

export const grades = ["platinum", "gold", "silver", "bronze"] as const;

export function Progress({ earned, total, platinum }: { earned: number; total: number; platinum?: boolean }) {
  const p = percent(earned, total);
  return (
    <div className="progress" title={`${earned} sur ${total}`}>
      <span className="progress-track">
        <span className={`progress-fill${p === 100 ? " done" : ""}`} style={{ width: `${p}%` }} />
      </span>
      <span className="progress-label">
        {platinum && <span className="grade-dot platinum" aria-label="Platine" />}
        {earned}/{total} · {p} %
      </span>
    </div>
  );
}

export function GradeCounts({ counts, defined }: { counts: TrophyCounts; defined?: TrophyCounts }) {
  return (
    <div className="grade-counts">
      {grades.map((g) =>
        defined && !defined[g] ? null : (
          <span key={g} className="grade-count" title={gradeLabel[g]}>
            <span className={`grade-dot ${g}`} />
            {fmt(counts[g])}
            {defined ? <span className="grade-of">/{defined[g]}</span> : null}
          </span>
        ),
      )}
    </div>
  );
}
