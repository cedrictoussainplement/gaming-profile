import type { Metadata } from "next";
import { Sidebar } from "../sidebar";
import { LibraryView } from "./library";

export const metadata: Metadata = {
  title: "reask · Bibliothèque",
  description: "Tous les jeux de reask sur toutes ses plateformes, avec les heures, les succès Steam et les trophées PlayStation.",
};

export default function LibraryPage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="page-head">
          <h1>Bibliothèque</h1>
          <p>Tous les jeux possédés ou joués, tous comptes et plateformes confondus.</p>
        </header>
        <LibraryView />
      </main>
    </div>
  );
}
