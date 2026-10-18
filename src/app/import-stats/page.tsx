import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsImportForm } from "./form";

export const metadata: Metadata = {
  title: "Saisir des stats · reask",
  robots: { index: false, follow: false },
};

export default function StatsImport() {
  return (
    <main className="import">
      <h1>Saisir les stats d&apos;un tracker</h1>
      <p>
        Pour les jeux sans API publique (Off the Grid, WARDOGS), recopie ici les chiffres affichés sur la page du
        tracker, une stat par ligne au format <code>Nom : valeur</code>. Ils remplacent la saisie précédente et
        s&apos;affichent sur la fiche du jeu et l&apos;accueil.
      </p>
      <Suspense>
        <StatsImportForm />
      </Suspense>
      <p>
        <a href="/#trackers">← Retour au profil</a>
      </p>
    </main>
  );
}
