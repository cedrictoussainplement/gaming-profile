import type { Metadata } from "next";
import { Suspense } from "react";
import { Sidebar } from "../sidebar";
import { GameView } from "./game";

export const metadata: Metadata = {
  title: "reask · Fiche jeu",
  description: "Heures, succès et trophées de reask sur un jeu.",
};

export default function GamePage() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Suspense fallback={<p className="empty">Chargement…</p>}>
          <GameView />
        </Suspense>
      </main>
    </div>
  );
}
