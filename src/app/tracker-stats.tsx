"use client";

// Stats des trackers : lit /api/trackers une fois par page (synchro automatique ou saisie à la main).

import { ExternalLink } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Tracker } from "@/data/profile";
import type { TrackerState, TrackersResponse } from "@/lib/trackers";

const TrackersContext = createContext<Map<string, TrackerState> | null>(null);

export function TrackersProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Map<string, TrackerState> | null>(null);
  useEffect(() => {
    fetch("/api/trackers")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: TrackersResponse | null) => body && setStates(new Map(body.trackers.map((t) => [t.id, t]))))
      .catch(() => {});
  }, []);
  return <TrackersContext.Provider value={states}>{children}</TrackersContext.Provider>;
}

export const useTrackerState = (id: string) => useContext(TrackersContext)?.get(id);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function emptyText(state: TrackerState | undefined) {
  if (!state) return "Chargement des stats…";
  if (state.mode === "link") return "Pas de source de stats pour ce tracker : le lien ouvre la page complète.";
  if (state.mode === "import") return "Pas d'API publique pour ce jeu : les stats sont à recopier sur la page d'import.";
  if (state.missingSecret) return `Synchro prête, en attente de la clé ${state.missingSecret} dans Cloudflare.`;
  if (state.error) return `La synchro a échoué : ${state.error}`;
  return "Première synchro en cours, les stats arrivent dans quelques minutes.";
}

/** Bloc complet d'un tracker, sur la fiche du jeu. */
export function TrackerPanel({ tracker }: { tracker: Tracker }) {
  const state = useTrackerState(tracker.id);
  const s = state?.summary;
  return (
    <div className="card tracker-panel">
      <div className="tracker-head">
        {s?.image && <img className="tracker-rank" src={s.image} alt="" loading="lazy" />}
        <div className="tracker-who">
          <div className="platform-name">
            {tracker.account} <span className={`badge role-${tracker.role}`}>{tracker.role === "main" ? "Main" : "Smurf"}</span>
          </div>
          <div className="platform-games">
            {tracker.platform}
            {s?.headline ? ` · ${s.headline}` : ""}
          </div>
        </div>
        <a className="tracker-open" href={tracker.url} target="_blank" rel="noopener noreferrer">
          Tracker <ExternalLink size={13} />
        </a>
      </div>

      {s ? (
        <>
          <div className="grid tiles tracker-tiles">
            {s.highlights.map((h) => (
              <div key={h.label} className="tile">
                <div className="stat-label">{h.label}</div>
                <div className="stat-value">{h.value}</div>
                {h.hint && <div className="stat-hint">{h.hint}</div>}
              </div>
            ))}
          </div>
          {s.groups
            ?.filter((g) => g.rows.length)
            .map((g) => (
              <div key={g.title} className="tracker-group">
                <div className="stat-label">{g.title}</div>
                <table className="stats-table">
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th>{r.label}</th>
                        <td>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          <div className="tracker-foot">
            {state?.source ? `Source : ${state.source}` : null}
            {state?.updatedAt ? ` · mis à jour le ${formatDate(state.updatedAt)}` : null}
            {state?.error ? ` · dernière synchro en échec (${state.error})` : null}
          </div>
        </>
      ) : (
        <p className="empty">
          {emptyText(state)}
          {state?.mode === "import" && (
            <>
              {" "}
              <a href={`/import-stats?id=${tracker.id}`}>Saisir les stats</a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** Deux chiffres clés sous la vignette d'un tracker, sur l'accueil. */
export function TrackerMini({ id }: { id: string }) {
  const s = useTrackerState(id)?.summary;
  if (!s) return null;
  return (
    <div className="tracker-mini">
      {s.headline && <div className="tracker-mini-head">{s.headline}</div>}
      {s.highlights.slice(0, 2).map((h) => (
        <span key={h.label}>
          <b>{h.value}</b> {h.label}
        </span>
      ))}
    </div>
  );
}
