"use client";

// Bibliothèque complète : lit /api/library (servi par le Worker).

import { Clock, Gamepad2, Medal, Search, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Library, LibraryGame } from "@/lib/library";
import { formatHours, platformName } from "../live";
import { fmt, formatRarity, GradeCounts, Progress, rarityClass } from "../trophy-ui";

type Sort = "minutes" | "recent" | "name" | "progress";

const sorts: { id: Sort; label: string }[] = [
  { id: "minutes", label: "Plus joués" },
  { id: "recent", label: "Joués récemment" },
  { id: "progress", label: "Progression des succès" },
  { id: "name", label: "Nom" },
];

const compare: Record<Sort, (a: LibraryGame, b: LibraryGame) => number> = {
  minutes: (a, b) => b.minutes - a.minutes,
  recent: (a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""),
  progress: (a, b) => ratio(b) - ratio(a),
  name: () => 0,
};
const ratio = (g: LibraryGame) => (g.achievements ? g.achievements.earned / g.achievements.total : -1);
const PAGE = 120;
const normalize = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function GameCard({ game }: { game: LibraryGame }) {
  return (
    <a className="card game" href={`/jeu?id=${game.id}`}>
      <div className="cover" style={{ backgroundImage: game.cover ? `url(${game.cover})` : "linear-gradient(135deg, #3f3f46, #18181b)" }}>
        {!game.cover && <span>{game.name}</span>}
      </div>
      <div className="game-body">
        <div className="game-title">{game.name}</div>
        <div className="game-tags">
          {game.platforms.map((p) => (
            <span key={p} className="tag">
              {platformName(p)}
            </span>
          ))}
        </div>
        <div className="game-foot">
          <span className={game.minutes > 0 ? "game-hours" : "game-hours unplayed"}>
            {game.minutes > 0 ? formatHours(game.minutes) : "Jamais lancé"}
          </span>
          {game.achievements && <Progress earned={game.achievements.earned} total={game.achievements.total} platinum={game.platinum} />}
        </div>
      </div>
    </a>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-icon">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function LibraryView() {
  const [library, setLibrary] = useState<Library | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [playedOnly, setPlayedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("minutes");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : null))
      .then((l: Library | null) => setLibrary(l))
      .catch(() => setLibrary(null));
  }, []);

  const platforms = useMemo(() => {
    const count = new Map<string, number>();
    for (const g of library?.games ?? []) for (const p of g.platforms) count.set(p, (count.get(p) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]);
  }, [library]);

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return (library?.games ?? [])
      .filter(
        (g) => (platform === "all" || g.platforms.includes(platform)) && (!playedOnly || g.minutes > 0) && (!q || normalize(g.name).includes(q)),
      )
      .sort((a, b) => compare[sort](a, b) || a.name.localeCompare(b.name, "fr"));
  }, [library, query, platform, playedOnly, sort]);

  if (library === undefined) return <p className="empty">Chargement de la bibliothèque…</p>;
  if (!library || !library.games.length) {
    return <p className="empty">La bibliothèque se remplit à la première synchro (Steam, PlayStation et Playnite).</p>;
  }

  const { totals } = library;
  const psnTotal = totals.psnTrophies.bronze + totals.psnTrophies.silver + totals.psnTrophies.gold + totals.psnTrophies.platinum;

  return (
    <>
      <section className="stats">
        <Stat icon={Gamepad2} label="Jeux" value={fmt(totals.owned)} hint={`dont ${fmt(totals.played)} joués`} />
        <Stat icon={Clock} label="Temps de jeu" value={formatHours(totals.minutes)} hint="tous comptes confondus" />
        <Stat icon={Trophy} label="Succès PC" value={fmt(totals.achievements)} hint="Steam, Epic, EA…, main et smurf réunis" />
        <Stat icon={Medal} label="Trophées PlayStation" value={fmt(psnTotal)} hint={<GradeCounts counts={totals.psnTrophies} />} />
        <Stat
          icon={Sparkles}
          label="Jeux à 100 %"
          value={fmt(totals.completed)}
          hint={totals.pendingTrophies ? `succès de ${fmt(totals.pendingTrophies)} jeux en cours de chargement` : "tous les succès obtenus"}
        />
      </section>

      {library.rarest.length > 0 && (
        <section>
          <h2>Les plus rares</h2>
          <div className="achievements">
            {library.rarest.map((t, i) => (
              <a key={i} className={`achievement ${rarityClass(t.rarity)}`} href={`/jeu?id=${t.gameId}`}>
                {t.icon ? <img src={t.icon} alt="" loading="lazy" /> : <span className="achievement-img" />}
                <div>
                  <div className="achievement-name">{t.name}</div>
                  <div className="achievement-meta">
                    {t.game} · {formatRarity(t.rarity)} des joueurs
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input type="search" placeholder="Chercher un jeu" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
            {sorts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={playedOnly} onChange={(e) => setPlayedOnly(e.target.checked)} />
            Joués seulement
          </label>
        </div>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={platform === "all"} onClick={() => setPlatform("all")}>
            Toutes ({fmt(library.games.length)})
          </button>
          {platforms.map(([p, n]) => (
            <button key={p} className="tab" role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)}>
              {platformName(p)} ({fmt(n)})
            </button>
          ))}
        </div>
        <div className="grid games library-grid">
          {shown.slice(0, limit).map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
        {!shown.length && <p className="empty">Aucun jeu ne correspond.</p>}
        {shown.length > limit && (
          <button className="more" onClick={() => setLimit((l) => l + PAGE)}>
            Afficher plus ({fmt(shown.length - limit)} restants)
          </button>
        )}
      </section>
    </>
  );
}
