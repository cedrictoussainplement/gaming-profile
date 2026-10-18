"use client";

// Fiche d'un jeu : /jeu?id=42, lit /api/game?id=42.

import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { profile } from "@/data/profile";
import { realDate, type CombinedTrophy, type GameDetail } from "@/lib/library";
import { formatHours, platformName } from "../live";
import { TrackerPanel, TrackersProvider } from "../tracker-stats";
import { fmt, formatRarity, GradeCounts, Progress, rarityClass } from "../trophy-ui";

const accountOf = (id: string) => {
  for (const p of profile.platforms) {
    const a = p.accounts.find((x) => x.id === id);
    if (a) return { ...a, platform: p.name };
  }
  return id === "pc-local" ? { id, handle: "Autres jeux PC", role: "main" as const, platform: "PC", label: undefined } : null;
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const squash = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Trackers de profile.ts dont le jeu correspond (« Rainbow Six Siege » ↔ « Tom Clancy's Rainbow Six® Siege »). */
function trackersFor(name: string) {
  const n = squash(name);
  return profile.trackers.filter((t) => {
    const g = squash(t.game);
    return g.length >= 4 && (n.includes(g) || g.includes(n));
  });
}

type Filter = "earned" | "locked" | "partial" | "all";

const roleLabel = (role: string) => (role === "main" ? "Main" : "Smurf");

function TrophyItem({ t, multi }: { t: CombinedTrophy; multi: boolean }) {
  const date = realDate(t.earnedAt);
  return (
    <div className={`achievement ${t.earnedAt ? rarityClass(t.rarity) : "locked"}`}>
      {t.icon ? <img src={t.icon} alt="" loading="lazy" /> : <span className="achievement-img" />}
      <div>
        <div className="achievement-name">
          {t.grade && <span className={`grade-dot ${t.grade}`} />}
          {t.name}
        </div>
        {t.description && <div className="achievement-desc">{t.description}</div>}
        <div className="achievement-meta">
          {t.rarity !== null ? `${formatRarity(t.rarity)} des joueurs` : null}
          {t.rarity !== null && date ? " · " : null}
          {date ? formatDate(date) : null}
        </div>
        {multi && t.earnedBy.length > 0 && (
          <div className="earned-by">
            {t.earnedBy.map((e) => {
              const acc = accountOf(e.accountId);
              return (
                <span key={e.accountId} className={`badge role-${acc?.role ?? "main"}`} title={acc?.handle ?? e.accountId}>
                  {acc ? `${roleLabel(acc.role)} · ${acc.handle}` : e.accountId}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TrophySet({ set }: { set: GameDetail["sets"][number] }) {
  const [filter, setFilter] = useState<Filter>("earned");
  const multi = set.accounts.length > 1;
  const sorted = useMemo(() => {
    const earned = set.trophies.filter((t) => t.earnedAt).sort((a, b) => (a.rarity ?? 101) - (b.rarity ?? 101));
    const locked = set.trophies.filter((t) => !t.earnedAt).sort((a, b) => (b.rarity ?? -1) - (a.rarity ?? -1));
    const partial = earned.filter((t) => t.earnedBy.length < set.accounts.length);
    return { earned, locked, partial, all: [...earned, ...locked] };
  }, [set.trophies, set.accounts.length]);
  const list = sorted[filter];
  const tabs: [Filter, string][] = [
    ["earned", `Obtenus (${sorted.earned.length})`],
    ["locked", `À obtenir (${sorted.locked.length})`],
    ...(multi ? ([["partial", `Sur un seul compte (${sorted.partial.length})`]] as [Filter, string][]) : []),
    ["all", "Tous"],
  ];

  return (
    <div className="card trophy-set">
      <div className="trophy-set-head">
        <div>
          <div className="platform-name">{set.platform === "psn" ? "Trophées PlayStation" : `Succès ${platformName(set.platform)}`}</div>
          <div className="platform-games">
            {multi ? `${set.accounts.length} comptes réunis` : (accountOf(set.accounts[0]?.accountId ?? "")?.handle ?? "")}
          </div>
        </div>
        {set.total ? <Progress earned={set.earned ?? 0} total={set.total} platinum={Boolean(set.grades?.earned.platinum)} /> : null}
      </div>
      {multi && (
        <div className="set-accounts">
          {set.accounts.map((a) => {
            const acc = accountOf(a.accountId);
            return (
              <div key={a.accountId} className="set-account">
                <span className="account-handle">{acc?.handle ?? a.accountId}</span>
                {acc && <span className={`badge role-${acc.role}`}>{roleLabel(acc.role)}</span>}
                {a.total ? (
                  <Progress earned={a.earned ?? 0} total={a.total} platinum={a.platinum} />
                ) : (
                  <span className="stat-hint">pas encore chargé</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {set.grades && <GradeCounts counts={set.grades.earned} defined={set.grades.defined} />}
      {set.trophies.length > 0 ? (
        <>
          <div className="tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} className="tab" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="achievements">
            {list.map((t) => (
              <TrophyItem key={t.id} t={t} multi={multi} />
            ))}
          </div>
          {!list.length && <p className="empty">Rien ici pour l&apos;instant.</p>}
        </>
      ) : (
        <p className="empty">
          {set.pending
            ? "Le détail arrive dans les prochaines minutes, il se charge petit à petit après chaque synchro."
            : "Ce jeu n'a pas de succès."}
        </p>
      )}
    </div>
  );
}

export function GameView() {
  const id = useSearchParams().get("id");
  const [game, setGame] = useState<GameDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return setGame(null);
    fetch(`/api/game?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g: GameDetail | null) => setGame(g))
      .catch(() => setGame(null));
  }, [id]);

  const back = (
    <a className="back" href="/bibliotheque">
      <ArrowLeft size={14} /> Bibliothèque
    </a>
  );
  if (game === undefined) return <p className="empty">Chargement…</p>;
  if (!game) {
    return (
      <>
        {back}
        <p className="empty">Jeu introuvable.</p>
      </>
    );
  }

  const trackers = trackersFor(game.name);
  const isTarkov = /tarkov/i.test(game.name);
  const lastPlayed = realDate(game.lastPlayed);
  const earned = game.sets.reduce((n, s) => n + (s.earned ?? 0), 0);
  // Historique : dates réelles de déblocage, main et smurf réunis.
  const unlockDates = game.sets
    .flatMap((s) => s.trophies.map((t) => realDate(t.earnedAt)))
    .filter((d): d is string => d !== null)
    .sort();
  const firstUnlock = unlockDates[0];
  const lastUnlock = unlockDates[unlockDates.length - 1];

  return (
    <>
      {back}
      <header className="game-hero">
        <div
          className="game-hero-cover"
          style={{ backgroundImage: game.cover ? `url(${game.cover})` : "linear-gradient(135deg, #3f3f46, #18181b)" }}
        />
        <div>
          <h1>{game.name}</h1>
          <div className="game-tags">
            {game.platforms.map((p) => (
              <span key={p} className="tag">
                {platformName(p)}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="grid tiles game-tiles">
        <div className="card tile">
          <div className="stat-label">Temps de jeu</div>
          <div className="stat-value">{game.minutes > 0 ? formatHours(game.minutes) : "—"}</div>
          <div className="stat-hint">{game.accounts.length > 1 ? `sur ${game.accounts.length} comptes` : "tous comptes"}</div>
        </div>
        <div className="card tile">
          <div className="stat-label">Dernière session</div>
          <div className="stat-value">{lastPlayed ? new Date(lastPlayed).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</div>
          <div className="stat-hint">{lastPlayed ? new Date(lastPlayed).getFullYear() : "jamais lancé ou date inconnue"}</div>
        </div>
        {firstUnlock && (
          <div className="card tile">
            <div className="stat-label">Premier succès</div>
            <div className="stat-value">{new Date(firstUnlock).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
            <div className="stat-hint">{new Date(firstUnlock).getFullYear()}</div>
          </div>
        )}
        {lastUnlock && lastUnlock !== firstUnlock && (
          <div className="card tile">
            <div className="stat-label">Dernier succès</div>
            <div className="stat-value">{new Date(lastUnlock).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
            <div className="stat-hint">{new Date(lastUnlock).getFullYear()}</div>
          </div>
        )}
        <div className="card tile">
          <div className="stat-label">Succès et trophées</div>
          <div className="stat-value">{game.sets.length ? fmt(earned) : "—"}</div>
          <div className="stat-hint">{game.sets.length ? "obtenus, main et smurf réunis" : "aucun suivi pour ce jeu"}</div>
        </div>
      </div>

      <section>
        <h2>Par compte</h2>
        <div className="card accounts game-accounts">
          {game.accounts.map((a) => {
            const acc = accountOf(a.id);
            return (
              <div key={a.id} className="account">
                <span className="account-handle">{acc?.handle ?? a.id}</span>
                <span className="account-label">
                  {acc?.platform ?? platformName(a.platform)}
                  {acc?.label ? ` · ${acc.label}` : ""}
                </span>
                <span className="account-hours">{a.minutes > 0 ? formatHours(a.minutes) : "Jamais lancé"}</span>
                {acc && <span className={`badge role-${acc.role}`}>{acc.role === "main" ? "Main" : "Smurf"}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {game.sets.length > 0 && (
        <section>
          <h2>Succès et trophées</h2>
          <div className="trophy-sets">
            {game.sets.map((s) => (
              <TrophySet key={`${s.platform}-${s.accounts.map((a) => a.accountId).join("+")}`} set={s} />
            ))}
          </div>
        </section>
      )}

      {(trackers.length > 0 || isTarkov) && (
        <section>
          <h2>Stats tracker</h2>
          {isTarkov && (
            <div className="card links">
              <a className="link-row" href="/#tarkov">
                <span className="link-name">Stats Tarkov complètes</span>
                <span className="link-handle">sur l&apos;accueil</span>
              </a>
            </div>
          )}
          <TrackersProvider>
            <div className="tracker-panels">
              {trackers.map((t) => (
                <TrackerPanel key={t.id} tracker={t} />
              ))}
            </div>
          </TrackersProvider>
        </section>
      )}
    </>
  );
}
