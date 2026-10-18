-- Comptes suivis (recopiés depuis src/data/profile.ts à chaque synchro).
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'main'
);

-- Un jeu "canonique", tous comptes et plateformes confondus.
CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cover_url TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);

-- Un identifiant de jeu chez une source (appid Steam, concept PSN, jeu Playnite)
-- rattaché à un jeu canonique. Rattachement auto par nom normalisé ; pour fusionner
-- à la main, changer game_id et mettre manual = 1 (l'historique suit).
CREATE TABLE game_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  game_id INTEGER NOT NULL REFERENCES games(id),
  manual INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source, external_id)
);

-- Temps de jeu cumulé. Une ligne seulement quand la valeur change, ce qui donne
-- l'historique pour les graphiques.
CREATE TABLE playtime_snapshots (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  alias_id INTEGER NOT NULL REFERENCES game_aliases(id),
  taken_on TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  last_played TEXT,
  PRIMARY KEY (account_id, alias_id, taken_on)
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  games INTEGER,
  message TEXT
);

CREATE INDEX sync_runs_account ON sync_runs (account_id, at);
