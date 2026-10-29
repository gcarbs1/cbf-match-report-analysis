PRAGMA foreign_keys = ON;

CREATE TABLE teams (
  name TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE
);

CREATE TABLE team_aliases (
  alias TEXT NOT NULL,
  normalized_alias TEXT PRIMARY KEY,
  team_name TEXT NOT NULL REFERENCES teams(name)
);

CREATE TABLE referees (
  name TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  match_date TEXT NOT NULL,
  display_date TEXT NOT NULL,
  home_team TEXT NOT NULL REFERENCES teams(name),
  away_team TEXT NOT NULL REFERENCES teams(name),
  referee TEXT NOT NULL REFERENCES referees(name),
  has_var INTEGER NOT NULL DEFAULT 0 CHECK (has_var IN (0, 1)),
  total_cards INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  second_yellow_cards INTEGER NOT NULL DEFAULT 0,
  direct_red_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  home_yellow_cards INTEGER NOT NULL DEFAULT 0,
  home_red_cards INTEGER NOT NULL DEFAULT 0,
  away_yellow_cards INTEGER NOT NULL DEFAULT 0,
  away_red_cards INTEGER NOT NULL DEFAULT 0,
  events_json TEXT NOT NULL DEFAULT '[]',
  CHECK (home_team <> away_team)
);

CREATE INDEX matches_season_date_idx ON matches(season, match_date);
CREATE INDEX matches_home_season_idx ON matches(home_team, season);
CREATE INDEX matches_away_season_idx ON matches(away_team, season);
CREATE INDEX matches_referee_season_idx ON matches(referee, season);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  appearances INTEGER NOT NULL DEFAULT 0,
  card_games INTEGER NOT NULL DEFAULT 0,
  cards INTEGER NOT NULL DEFAULT 0,
  yellow INTEGER NOT NULL DEFAULT 0,
  second_yellow INTEGER NOT NULL DEFAULT 0,
  direct_red INTEGER NOT NULL DEFAULT 0,
  red INTEGER NOT NULL DEFAULT 0,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  teams_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX players_normalized_name_idx ON players(normalized_name);

CREATE TABLE dataset_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
