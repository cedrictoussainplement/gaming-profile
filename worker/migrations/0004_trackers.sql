-- Stats des trackers (Apex, Battlefield, Valorant…), une ligne par tracker de src/data/profile.ts.
-- summary : résumé affiché (format TrackerSummary de src/lib/trackers.ts), gardé tel quel si la
-- synchro suivante échoue. raw : réponse brute de l'API ou saisie d'origine.
CREATE TABLE tracker_stats (
  tracker_id TEXT PRIMARY KEY,
  source TEXT,
  summary TEXT,
  raw TEXT,
  updated_at TEXT,
  error TEXT,
  attempted_at TEXT
);

-- Date de la dernière synchro lancée, pour ne pas la relancer à chaque visite.
CREATE TABLE tracker_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT
);
INSERT INTO tracker_sync (id, started_at) VALUES (1, NULL);
