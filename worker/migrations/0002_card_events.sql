PRAGMA foreign_keys = ON;

CREATE TABLE card_events (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  player TEXT NOT NULL DEFAULT '',
  team TEXT NOT NULL REFERENCES teams(name),
  card_type TEXT NOT NULL CHECK (card_type IN ('A', 'V2', 'VD')),
  reason TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  timing TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (match_id, ordinal)
);

CREATE INDEX card_events_player_idx ON card_events(player);
CREATE INDEX card_events_team_type_idx ON card_events(team, card_type);
CREATE INDEX card_events_type_idx ON card_events(card_type);
CREATE INDEX players_full_name_idx ON players(full_name);
