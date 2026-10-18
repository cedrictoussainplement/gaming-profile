"use client";

// Fil d'activité : lit /api/activity (succès débloqués et temps joué, jour par jour).

import { useEffect, useState } from "react";
import { profile } from "@/data/profile";
import type { Activity } from "@/lib/library";
import { formatRarity, rarityClass } from "./trophy-ui";

const SHOWN = 7;

/** 95 → « 1 h 35 » : une session se compte à la minute près. */
function formatSession(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

const roleOf = (accountId: string) => profile.platforms.flatMap((p) => p.accounts).find((a) => a.id === accountId)?.role;

function formatDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
  if (date === today) return "Aujourd'hui";
  if (date === yesterday) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function RoleBadge({ accountId }: { accountId: string }) {
  const role = roleOf(accountId);
  return role === "smurf" ? <span className="badge role-smurf">Smurf</span> : null;
}

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short" });

function Bars({
  months,
  pick,
  label,
  format,
}: {
  months: Activity["months"];
  pick: (m: Activity["months"][number]) => number;
  label: string;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...months.map(pick));
  const total = months.reduce((n, m) => n + pick(m), 0);
  return (
    <div className="card month-chart">
      <div className="month-chart-head">
        <span className="stat-label">{label}</span>
        <span className="stat-hint">{format(total)} sur 12 mois</span>
      </div>
      <div className="month-bars">
        {months.map((m) => (
          <div key={m.month} className="month-bar" title={`${monthLabel(m.month)} : ${format(pick(m))}`}>
            <span className="month-track">
              <span className="month-fill" style={{ height: `${(pick(m) / max) * 100}%` }} />
            </span>
            <span className="month-name">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Heures et succès par mois, main et smurf réunis. */
export function MonthlyStats({ months }: { months: Activity["months"] }) {
  return (
    <div className="grid month-charts">
      <Bars months={months} pick={(m) => m.minutes} label="Heures par mois" format={(n) => formatSession(n)} />
      <Bars months={months} pick={(m) => m.unlocks} label="Succès et trophées par mois" format={(n) => n.toLocaleString("fr-FR")} />
    </div>
  );
}

export function ActivityFeed() {
  const [activity, setActivity] = useState<Activity | null | undefined>(undefined);
  const [all, setAll] = useState(false);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => (r.ok ? r.json() : null))
      .then(setActivity)
      .catch(() => setActivity(null));
  }, []);

  if (activity === undefined) return <p className="empty">Chargement…</p>;
  if (!activity) return <p className="empty">Activité indisponible pour le moment.</p>;
  const charts = <MonthlyStats months={activity.months} />;
  if (!activity.days.length) {
    return (
      <div className="activity">
        {charts}
        <p className="empty">Rien pour l&apos;instant : l&apos;activité apparaît dès la deuxième synchro de nuit et à chaque nouveau succès.</p>
      </div>
    );
  }
  const days = all ? activity.days : activity.days.slice(0, SHOWN);

  return (
    <div className="activity">
      {charts}
      {days.map((d) => (
        <div key={d.date} className="card activity-day">
          <div className="activity-date">{formatDay(d.date)}</div>
          {d.sessions.length > 0 && (
            <div className="activity-sessions">
              {d.sessions.map((s, i) => (
                <a key={i} className="activity-session" href={`/jeu?id=${s.gameId}`}>
                  <span className="activity-game">{s.game}</span>
                  <span className="game-hours">+{formatSession(s.minutes)}</span>
                  <RoleBadge accountId={s.accountId} />
                </a>
              ))}
            </div>
          )}
          {d.unlocks.length > 0 && (
            <div className="achievements">
              {d.unlocks.map((u, i) => (
                <a key={i} className={`achievement ${rarityClass(u.rarity)}`} href={`/jeu?id=${u.gameId}`}>
                  {u.icon ? <img src={u.icon} alt="" loading="lazy" /> : <span className="achievement-img" />}
                  <div>
                    <div className="achievement-name">
                      {u.grade && <span className={`grade-dot ${u.grade}`} />}
                      {u.name}
                    </div>
                    <div className="achievement-meta">
                      {u.game}
                      {u.rarity !== null ? ` · ${formatRarity(u.rarity)} des joueurs` : ""}
                    </div>
                    <RoleBadge accountId={u.accountId} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      {!all && activity.days.length > SHOWN && (
        <button className="see-all" onClick={() => setAll(true)}>
          Voir les {activity.days.length - SHOWN} jours précédents
        </button>
      )}
    </div>
  );
}
