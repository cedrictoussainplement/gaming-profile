"use client";

// Section Escape from Tarkov : lit /api/tarkov (profils importés depuis tarkov.dev).

import { useEffect, useState } from "react";
import { tarkovModeLabel, tarkovModes, type RaidStats, type TarkovMode, type TarkovProfile, type TarkovResponse } from "@/lib/tarkov";

const fmt = (n: number) => n.toLocaleString("fr-FR");
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "—");
const ratio = (a: number, b: number) => (b > 0 ? (a / b).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : a > 0 ? fmt(a) : "—");
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatPlaytime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  return h > 0 ? `${fmt(h)} h` : `${Math.round(seconds / 60)} min`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

const raidRows: { key: keyof RaidStats; label: string }[] = [
  { key: "raids", label: "Raids" },
  { key: "survived", label: "Survécu" },
  { key: "runThrough", label: "Run-through" },
  { key: "kia", label: "Mort (KIA)" },
  { key: "mia", label: "Disparu (MIA)" },
  { key: "kills", label: "Kills" },
  { key: "killsPmc", label: "Kills PMC" },
  { key: "winStreak", label: "Meilleure série de survie" },
];

function Raids({ raids }: { raids: NonNullable<TarkovProfile["raids"]> }) {
  const { pmc, scav, total } = raids;
  return (
    <>
      <div className="grid tiles">
        <Tile label="Raids" value={fmt(total.raids)} hint={`${fmt(pmc.raids)} PMC · ${fmt(scav.raids)} Scav`} />
        <Tile label="Survie PMC" value={pct(pmc.survived, pmc.raids)} hint={`${fmt(pmc.survived)} raids survécus`} />
        <Tile label="K/D PMC" value={ratio(pmc.kills, pmc.kia)} hint={`${fmt(pmc.kills)} kills · ${fmt(pmc.kia)} morts`} />
        <Tile label="Kills PMC" value={fmt(total.killsPmc)} hint="PMC adverses tués" />
        <Tile label="Survie Scav" value={pct(scav.survived, scav.raids)} hint={`${fmt(scav.survived)} raids survécus`} />
        <Tile label="Meilleure série" value={fmt(pmc.winStreak)} hint="raids PMC survécus d'affilée" />
      </div>
      <div className="card table-card">
        <table className="stats-table">
          <thead>
            <tr>
              <th />
              <th>PMC</th>
              <th>Scav</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {raidRows.map((r) => (
              <tr key={r.key}>
                <th>{r.label}</th>
                <td>{fmt(pmc[r.key])}</td>
                <td>{fmt(scav[r.key])}</td>
                <td>{fmt(total[r.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Arena({ arena }: { arena: NonNullable<TarkovProfile["arena"]> }) {
  const kills = arena.modes.reduce((s, m) => s + m.kills, 0);
  const deaths = arena.modes.reduce((s, m) => s + m.deaths, 0);
  return (
    <>
      <div className="grid tiles">
        <Tile label="Meilleur ARP" value={fmt(arena.bestArp)} />
        <Tile label="K/D" value={ratio(kills, deaths)} hint={`${fmt(kills)} kills · ${fmt(deaths)} morts`} />
        <Tile label="Killstreak max" value={fmt(arena.maxKillstreak)} />
        <Tile label="Victoires d'affilée" value={fmt(arena.winStreak)} hint="record" />
      </div>
      {arena.modes.length > 0 && (
        <div className="card table-card">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Kills</th>
                <th>Morts</th>
                <th>K/D</th>
                <th>Killstreak max</th>
                <th>MVP manche</th>
                <th>MVP match</th>
              </tr>
            </thead>
            <tbody>
              {arena.modes.map((m) => (
                <tr key={m.mode}>
                  <th>{m.mode}</th>
                  <td>{fmt(m.kills)}</td>
                  <td>{fmt(m.deaths)}</td>
                  <td>{ratio(m.kills, m.deaths)}</td>
                  <td>{fmt(m.maxKillstreak)}</td>
                  <td>{fmt(m.roundMvp)}</td>
                  <td>{fmt(m.matchMvp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProfileView({ p }: { p: TarkovProfile }) {
  const [allAchievements, setAllAchievements] = useState(false);
  const achievements = allAchievements ? p.achievements.list : p.achievements.list.slice(0, 12);

  return (
    <>
      <div className="card tarkov-head">
        {p.levelBadge ? <img className="tarkov-badge" src={p.levelBadge} alt="" /> : <span className="avatar big">T</span>}
        <div className="tarkov-id">
          <div className="tarkov-name">
            {p.nickname}
            {p.side && <span className="tag">{p.side.toUpperCase()}</span>}
          </div>
          <div className="tarkov-meta">
            {p.level != null && <span>Niveau {p.level}</span>}
            {p.prestige && (
              <span className="tarkov-prestige">
                {p.prestige.icon && <img src={p.prestige.icon} alt="" />}
                {p.prestige.name ?? `Prestige ${p.prestige.level}`}
              </span>
            )}
            {p.playSeconds > 0 && <span>{formatPlaytime(p.playSeconds)} de jeu</span>}
            {p.lastActive && <span>Actif le {formatDate(p.lastActive)}</span>}
          </div>
        </div>
      </div>

      {p.raids && <Raids raids={p.raids} />}
      {p.arena && <Arena arena={p.arena} />}

      <div className="grid charts">
        {p.skills.length > 0 && (
          <div className="card chart">
            <div className="chart-title">Compétences</div>
            <div className="hbars">
              {p.skills.map((s) => (
                <div key={s.name} className="hbar">
                  <span className="hbar-label">{s.name}</span>
                  <span className="hbar-track">
                    <span className="hbar-fill" style={{ width: `${Math.min(s.level / 51, 1) * 100}%` }} />
                  </span>
                  <span className="hbar-value">niv. {s.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {p.mastering.length > 0 && (
          <div className="card chart">
            <div className="chart-title">Armes maîtrisées</div>
            <div className="hbars">
              {p.mastering.map((m) => (
                <div key={m.name} className="hbar">
                  <span className="hbar-label">{m.name}</span>
                  <span className="hbar-track">
                    <span className="hbar-fill" style={{ width: `${(m.level / 3) * 100}%` }} />
                  </span>
                  <span className="hbar-value">niv. {m.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {p.achievements.done > 0 && (
        <div className="card chart">
          <div className="chart-title">
            Succès : {fmt(p.achievements.done)}
            {p.achievements.total ? ` sur ${fmt(p.achievements.total)}` : ""} · les plus rares d&apos;abord
          </div>
          <div className="achievements">
            {achievements.map((a) => (
              <div key={a.name} className={`achievement rarity-${(a.rarity ?? "common").toLowerCase()}`}>
                {a.image ? <img src={a.image} alt="" /> : <span className="achievement-img" />}
                <div>
                  <div className="achievement-name">{a.name}</div>
                  <div className="achievement-meta">
                    {a.percent != null ? `${a.percent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des joueurs · ` : ""}
                    {formatDate(a.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {p.achievements.list.length > 12 && (
            <button className="more" onClick={() => setAllAchievements(!allAchievements)}>
              {allAchievements ? "Voir moins" : `Voir les ${p.achievements.list.length} succès`}
            </button>
          )}
        </div>
      )}

      <p className="empty">Données du profil importées le {formatDate(p.importedAt)}.</p>
    </>
  );
}

export function TarkovSection() {
  const [profiles, setProfiles] = useState<TarkovProfile[] | null>(null);
  const [mode, setMode] = useState<TarkovMode | null>(null);

  useEffect(() => {
    fetch("/api/tarkov")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TarkovResponse | null) => {
        const list = (d?.profiles ?? []).sort((a, b) => tarkovModes.indexOf(a.mode) - tarkovModes.indexOf(b.mode));
        setProfiles(list);
        setMode(list[0]?.mode ?? null);
      })
      .catch(() => setProfiles([]));
  }, []);

  if (!profiles?.length) {
    return <p className="empty">{profiles ? "Le profil Tarkov apparaîtra après le premier import." : "Chargement…"}</p>;
  }
  const current = profiles.find((p) => p.mode === mode) ?? profiles[0];

  return (
    <div className="tarkov">
      {profiles.length > 1 && (
        <div className="tabs" role="tablist">
          {profiles.map((p) => (
            <button key={p.mode} role="tab" aria-selected={p.mode === current.mode} className="tab" onClick={() => setMode(p.mode)}>
              {tarkovModeLabel[p.mode]}
            </button>
          ))}
        </div>
      )}
      <ProfileView key={current.mode} p={current} />
    </div>
  );
}
