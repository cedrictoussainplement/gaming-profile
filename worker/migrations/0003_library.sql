-- Jeux possédés par compte, joués ou non. Une ligne par (compte, alias), jamais supprimée.
CREATE TABLE library (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  alias_id INTEGER NOT NULL REFERENCES game_aliases(id),
  first_seen TEXT NOT NULL,
  PRIMARY KEY (account_id, alias_id)
);

-- Progression des succès (Steam) ou trophées (PSN) d'un compte sur un jeu.
-- wanted : état connu à la dernière synchro (minutes jouées sur Steam, date du dernier
-- trophée PSN). fetched : état au dernier téléchargement du détail. Tant qu'ils
-- diffèrent, le cron des trophées va chercher le détail.
CREATE TABLE trophy_sets (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  alias_id INTEGER NOT NULL REFERENCES game_aliases(id),
  platform TEXT NOT NULL,
  earned INTEGER,
  total INTEGER,
  -- PSN : {"earned":{"bronze":..},"defined":{..}}
  grades TEXT,
  last_earned TEXT,
  -- PSN : {"service":"trophy"|"trophy2"}
  meta TEXT,
  wanted TEXT,
  fetched TEXT,
  attempted_at TEXT,
  error TEXT,
  PRIMARY KEY (account_id, alias_id)
);

-- Détail des succès / trophées. grade : bronze, silver, gold, platinum (PSN) ou NULL (Steam).
-- rarity : % des joueurs qui l'ont.
CREATE TABLE trophies (
  account_id TEXT NOT NULL,
  alias_id INTEGER NOT NULL,
  trophy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  grade TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  earned_at TEXT,
  rarity REAL,
  PRIMARY KEY (account_id, alias_id, trophy_id)
);

CREATE INDEX trophies_rarest ON trophies (rarity) WHERE earned_at IS NOT NULL;
