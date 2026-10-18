import type { Metadata } from "next";
import { TarkovImportForm } from "./form";

export const metadata: Metadata = {
  title: "Import Tarkov · reask",
  robots: { index: false, follow: false },
};

export default function TarkovImport() {
  return (
    <main className="import">
      <h1>Importer le profil Tarkov</h1>
      <p>
        Sur tarkov.dev, ouvre ton profil dans chaque mode (PvP, PvE, PvP saison, Arena) et clique sur le bouton de
        téléchargement à côté du pseudo. Choisis ensuite chaque fichier dans la bonne case. Un mode laissé vide garde
        son import précédent.
      </p>
      <TarkovImportForm />
      <p>
        <a href="/#tarkov">← Retour au profil</a>
      </p>
    </main>
  );
}
