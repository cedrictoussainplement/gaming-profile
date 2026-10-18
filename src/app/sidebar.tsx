import { Activity, ChartColumn, Clock, Crosshair, House, Layers, Library, Users } from "lucide-react";
import { profile } from "@/data/profile";

const nav = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/bibliotheque", label: "Bibliothèque", icon: Library },
  { href: "/#activite", label: "Activité", icon: Activity },
  { href: "/#temps", label: "Temps de jeu", icon: Clock },
  { href: "/#plateformes", label: "Plateformes", icon: Layers },
  { href: "/#tarkov", label: "Tarkov", icon: Crosshair },
  { href: "/#trackers", label: "Stats par jeu", icon: ChartColumn },
  { href: "/#communaute", label: "Communauté", icon: Users },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="avatar">{profile.gamertag[0].toUpperCase()}</span>
        <span className="brand-name">{profile.gamertag}</span>
      </a>
      <div className="nav-title">Explorer</div>
      <nav>
        {nav.map(({ href, label, icon: Icon }) => (
          <a key={href} href={href} className="nav-item">
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </a>
        ))}
      </nav>
      <div className="sidebar-foot">Heures et trophées mis à jour chaque nuit</div>
    </aside>
  );
}
