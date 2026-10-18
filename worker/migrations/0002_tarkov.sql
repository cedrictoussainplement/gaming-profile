-- Profils Escape from Tarkov importés depuis tarkov.dev, un par mode de jeu.
-- summary : résumé affiché par la page (format TarkovProfile de src/lib/tarkov.ts).
-- raw : JSON d'origine, gardé pour refaire le résumé sans réimporter.
CREATE TABLE tarkov_profiles (
  mode TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  raw TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
