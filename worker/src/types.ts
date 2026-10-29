export interface Env {
  AI: Ai;
  DB: D1Database;
  CHAT_RATE_LIMITER: RateLimit;
  AI_MODEL: string;
  ALLOWED_ORIGINS: string;
}

export type JsonObject=Record<string,unknown>;

export interface MatchEvent {
  ordinal:number;
  player:string;
  team:string;
  type:'A'|'V2'|'VD';
  reason:string;
  tags:string[];
  timing:string;
}

export interface MatchRow {
  id:string;
  season:number;
  match_date:string;
  display_date:string;
  home_team:string;
  away_team:string;
  referee:string;
  has_var:number;
  total_cards:number;
  yellow_cards:number;
  second_yellow_cards:number;
  direct_red_cards:number;
  red_cards:number;
  home_yellow_cards:number;
  home_red_cards:number;
  away_yellow_cards:number;
  away_red_cards:number;
  events_json:string;
}

export interface Source {
  id:string;
  title:string;
  date:string;
  year:number;
}

export interface ToolExecution {
  name:string;
  data:unknown;
  sources:Source[];
}

export interface ToolCall {
  name:string;
  arguments:string;
}

export interface ChatMessage {
  role:'system'|'user'|'assistant';
  content:string;
}

export interface AiToolDefinition {
  type:'function';
  function:{
    name:string;
    description:string;
    parameters:JsonObject;
  };
}
