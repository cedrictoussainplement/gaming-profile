import {
  ChartColumn,
  Clock,
  Crosshair,
  ExternalLink,
  Gamepad2,
  House,
  Layers,
  Link2,
  Monitor,
  Radio,
  Smartphone,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { profile, type Account, type Platform, type SyncSource } from "@/data/profile";
import { AccountHours, PlaytimeSection, StatsProvider, TotalHint, TotalHours } from "./live";
import { TarkovSection } from "./tarkov";

const syncLabel: Record<SyncSource, string> = {
  api: "Heures auto",
  playnite: "Heures via Playnite",
  import: "Stats via import",
  none: "Lien seulement",
};

const groupIcon: Record<Platform["group"], LucideIcon> = {
  pc: Monitor,
  console: Gamepad2,
  mobile: Smartphone,
};

function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
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

function AccountRow({ account }: { account: Account }) {
  const external = account.url && !account.url.startsWith("#");
  const content = (
    <>
      <span className="account-handle">{account.handle}</span>
      {account.label && <span className="account-label">{account.label}</span>}
      <AccountHours id={account.id} />
      <span className={`badge role-${account.role}`}>{account.role === "main" ? "Main" : "Smurf"}</span>
      {external && <ExternalLink size={14} className="account-ext" />}
    </>
  );
  return account.url ? (
    <a className="account" href={account.url} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {content}
    </a>
  ) : (
    <div className="account">{content}</div>
  );
}

function PlatformCard({ platform }: { platform: Platform }) {
  const Icon = groupIcon[platform.group];
  return (
    <div className="card platform">
      <div className="platform-head">
        <span className="stat-icon">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div>
          <div className="platform-name">{platform.name}</div>
          {platform.games && <div className="platform-games">{platform.games.join(" · ")}</div>}
        </div>
      </div>
      <div className="accounts">
        {platform.accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </div>
      <span className={`pill ${platform.sync}`}>{syncLabel[platform.sync]}</span>
    </div>
  );
}

const nav = [
  { href: "#accueil", label: "Accueil", icon: House },
  { href: "#temps", label: "Temps de jeu", icon: Clock },
  { href: "#plateformes", label: "Plateformes", icon: Layers },
  { href: "#tarkov", label: "Tarkov", icon: Crosshair },
  { href: "#trackers", label: "Stats par jeu", icon: ChartColumn },
  { href: "#communaute", label: "Communauté", icon: Users },
];

export default function Home() {
  const accounts = profile.platforms.flatMap((p) => p.accounts);
  const smurfs = accounts.filter((a) => a.role === "smurf").length;
  const games = new Set(profile.trackers.map((t) => t.game));
  const sections = [
    { title: "PC", items: profile.platforms.filter((p) => p.group === "pc") },
    { title: "Console", items: profile.platforms.filter((p) => p.group === "console") },
    { title: "Mobile", items: profile.platforms.filter((p) => p.group === "mobile") },
  ];

  return (
    <StatsProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="avatar">{profile.gamertag[0].toUpperCase()}</span>
            <span className="brand-name">{profile.gamertag}</span>
          </div>
          <div className="nav-title">Explorer</div>
          <nav>
            {nav.map(({ href, label, icon: Icon }) => (
              <a key={href} href={href} className="nav-item">
                <Icon size={16} strokeWidth={1.8} />
                {label}
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">Heures mises à jour chaque nuit</div>
        </aside>

        <main className="main">
          <header id="accueil" className="hero">
            <span className="avatar big">{profile.gamertag[0].toUpperCase()}</span>
            <div>
              <h1>{profile.gamertag}</h1>
              <p>{profile.tagline}</p>
            </div>
          </header>

          <section className="stats">
            <StatCard icon={Clock} label="Temps de jeu" value={<TotalHours />} hint={<TotalHint />} />
            <StatCard icon={Layers} label="Plateformes" value={String(profile.platforms.length)} hint="PC, PS5 et mobile" />
            <StatCard icon={Gamepad2} label="Comptes" value={String(accounts.length)} hint={`dont ${smurfs} smurfs`} />
            <StatCard icon={Crosshair} label="Jeux suivis" value={String(games.size)} hint={`${profile.trackers.length} trackers`} />
            <StatCard icon={Trophy} label="Genre préféré" value="Shooter" hint="FPS et battle royale" />
            <StatCard icon={Radio} label="Stream" value="Twitch" hint="reask0ner" />
          </section>

          <section id="temps">
            <h2>Temps de jeu</h2>
            <PlaytimeSection />
          </section>

          <section id="plateformes">
            <h2>Plateformes</h2>
            {sections.map((s) => (
              <div key={s.title} className="group">
                <div className="group-title">{s.title}</div>
                <div className="grid platforms">
                  {s.items.map((p) => (
                    <PlatformCard key={p.id} platform={p} />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section id="tarkov">
            <h2>Escape from Tarkov</h2>
            <TarkovSection />
          </section>

          <section id="trackers">
            <h2>Stats par jeu</h2>
            <div className="grid games">
              {profile.trackers.map((t) => (
                <a key={t.id} className="card game" href={t.url} target="_blank" rel="noopener noreferrer">
                  <div className="cover" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}>
                    <span>{t.game}</span>
                  </div>
                  <div className="game-body">
                    <div className="game-title">{t.game}</div>
                    <div className="game-tags">
                      <span className="tag">{t.platform}</span>
                      <span className={`badge role-${t.role}`}>{t.role === "main" ? "Main" : "Smurf"}</span>
                    </div>
                    <div className="game-account">{t.account}</div>
                    <div className="game-cta">
                      Voir les stats <ExternalLink size={14} />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section id="communaute">
            <h2>Communauté</h2>
            <div className="card links">
              {profile.community.map((c) => (
                <a key={c.id} className="link-row" href={c.url} target="_blank" rel="noopener noreferrer">
                  <span className="stat-icon small">
                    <Link2 size={16} strokeWidth={1.8} />
                  </span>
                  <span className="link-name">{c.name}</span>
                  <span className="link-handle">{c.handle}</span>
                  <ExternalLink size={14} className="account-ext" />
                </a>
              ))}
            </div>
          </section>
        </main>
      </div>
    </StatsProvider>
  );
}
