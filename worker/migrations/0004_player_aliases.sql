PRAGMA foreign_keys = ON;

CREATE TABLE player_aliases (
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (normalized_alias, player_id)
);

CREATE INDEX player_aliases_player_idx ON player_aliases(player_id);

INSERT OR IGNORE INTO player_aliases(alias, normalized_alias, player_id)
SELECT name, normalized_name, id
FROM players;

INSERT OR REPLACE INTO dataset_metadata(key, value)
SELECT 'min_season', CAST(MIN(season) AS TEXT)
FROM matches
HAVING COUNT(*) > 0;

INSERT OR REPLACE INTO dataset_metadata(key, value)
SELECT 'max_season', CAST(MAX(season) AS TEXT)
FROM matches
HAVING COUNT(*) > 0;

INSERT OR REPLACE INTO dataset_metadata(key, value)
SELECT 'period_label', CAST(MIN(season) AS TEXT) || '–' || CAST(MAX(season) AS TEXT)
FROM matches
HAVING COUNT(*) > 0;
