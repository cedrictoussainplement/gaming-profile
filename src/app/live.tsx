"use client";

// Données live : lit /api/stats (servi par le Worker) une fois au chargement.
// Sans API (next dev, export statique seul), tout reste à "—".

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { profile } from "@/data/profile";
import type { Stats } from "@/lib/stats";

const StatsContext = createContext<Stats | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Stats | null) => s && setStats(s))
      .catch(() => {});
  }, []);
  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>;
}

const useStats = () => useContext(StatsContext);

export function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60).toLocaleString("fr-FR")} h`;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export const platformName = (id: string) => (id === "local" ? "Autres jeux PC" : (profile.platforms.find((p) => p.id === id)?.name ?? id));

export function TotalHours() {
  const stats = useStats();
  return <>{stats && stats.totalMinutes > 0 ? formatHours(stats.totalMinutes) : "—"}</>;
}

export function TotalHint() {
  const stats = useStats();
  if (!stats?.lastSync) return <>Pas encore synchronisé</>;
  return <>{`${stats.gameCount} jeux · synchro du ${formatDate(stats.lastSync)}`}</>;
}

export function LibraryCount() {
  const stats = useStats();
  return <>{stats?.library?.owned ? `${stats.library.owned.toLocaleString("fr-FR")} jeux` : "—"}</>;
}

export function LibraryHint() {
  const stats = useStats();
  return <>{stats?.library?.owned ? `dont ${stats.gameCount} joués` : "Toutes plateformes"}</>;
}

export function TrophyCount() {
  const stats = useStats();
  const n = (stats?.library?.achievements ?? 0) + (stats?.library?.trophies ?? 0);
  return <>{n ? n.toLocaleString("fr-FR") : "—"}</>;
}

export function TrophyHint() {
  const stats = useStats();
  if (!stats?.library) return <>Steam et PlayStation</>;
  const { achievements, trophies, platinums } = stats.library;
  return (
    <>{`${achievements.toLocaleString("fr-FR")} Steam · ${trophies.toLocaleString("fr-FR")} PSN · ${platinums} platine${platinums > 1 ? "s" : ""}`}</>
  );
}

export function AccountHours({ id }: { id: string }) {
  const stats = useStats();
  const acc = stats?.accounts[id];
  if (!acc || acc.minutes <= 0) return null;
  return <span className="account-hours">{formatHours(acc.minutes)}</span>;
}

export function PlaytimeSection() {
  const stats = useStats();
  if (!stats || stats.totalMinutes <= 0) {
    return <p className="empty">Les heures apparaîtront après la première synchro (Steam, PlayStation et Playnite).</p>;
  }
  const maxPlatform = Math.max(...stats.platforms.map((p) => p.minutes));
  const maxWeek = Math.max(...stats.weekly.map((w) => w.minutes), 1);
  const hasWeekly = stats.weekly.some((w) => w.minutes > 0);

  return (
    <>
      <div className="grid games">
        {stats.topGames.map((g) => (
          <a key={g.id} className="card game" href={`/jeu?id=${g.id}`}>
            <div className="cover" style={{ backgroundImage: g.cover ? `url(${g.cover})` : "linear-gradient(135deg, #3f3f46, #18181b)" }}>
              {!g.cover && <span>{g.name}</span>}
            </div>
            <div className="game-body">
              <div className="game-title">{g.name}</div>
              <div className="game-tags">
                {g.platforms.map((p) => (
                  <span key={p} className="tag">
                    {platformName(p)}
                  </span>
                ))}
              </div>
              <div className="game-hours">{formatHours(g.minutes)}</div>
            </div>
          </a>
        ))}
      </div>

      <div className="grid charts">
        <div className="card chart">
          <div className="chart-title">Par plateforme</div>
          <div className="hbars">
            {stats.platforms.map((p) => (
              <div key={p.platform} className="hbar">
                <span className="hbar-label">{platformName(p.platform)}</span>
                <span className="hbar-track">
                  <span className="hbar-fill" style={{ width: `${(p.minutes / maxPlatform) * 100}%` }} />
                </span>
                <span className="hbar-value">{formatHours(p.minutes)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart">
          <div className="chart-title">Heures jouées par semaine</div>
          {hasWeekly ? (
            <div className="vbars" role="list">
              {stats.weekly.map((w) => (
                <div
                  key={w.weekStart}
                  className="vbar"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`Semaine du ${formatDate(w.weekStart)} : ${formatHours(w.minutes)}`}
                >
                  <span className="vbar-tip">
                    Sem. du {formatDate(w.weekStart)}
                    <strong>{formatHours(w.minutes)}</strong>
                  </span>
                  <span className="vbar-fill" style={{ height: `${(w.minutes / maxWeek) * 100}%` }} />
                </div>
              ))}
            </div>
          ) : null}
          {hasWeekly ? (
            <div className="vbars-axis">
              <span>{formatDate(stats.weekly[0].weekStart)}</span>
              <span>Cette semaine</span>
            </div>
          ) : (
            <p className="empty">
              Le graphique se remplit à partir des synchros suivantes
              {stats.trackingSince ? ` (suivi depuis le ${formatDate(stats.trackingSince)})` : ""}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
