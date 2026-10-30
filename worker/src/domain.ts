import type {MatchEvent,MatchRow,Source} from './types';

export class DomainError extends Error {
  constructor(message:string){
    super(message);
    this.name='DomainError';
  }
}

export const normalizeName=(value:unknown):string=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,' ')
  .trim();

const levenshtein=(left:string,right:string):number=>{
  if(left===right)return 0;
  if(!left.length)return right.length;
  if(!right.length)return left.length;
  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let i=1;i<=left.length;i+=1){
    const current=[i];
    for(let j=1;j<=right.length;j+=1){
      current[j]=Math.min(
        current[j-1]+1,
        previous[j]+1,
        previous[j-1]+(left[i-1]===right[j-1]?0:1)
      );
    }
    previous=current;
  }
  return previous[right.length];
};

const nameScore=(query:string,candidate:string):number=>{
  if(query===candidate)return 1;
  if(!query||!candidate)return 0;
  const characterScore=1-(levenshtein(query,candidate)/Math.max(query.length,candidate.length));
  const queryTokens=new Set(query.split(' ').filter(Boolean));
  const candidateTokens=new Set(candidate.split(' ').filter(Boolean));
  const shared=[...queryTokens].filter(token=>candidateTokens.has(token)).length;
  const tokenScore=shared/Math.max(new Set([...queryTokens,...candidateTokens]).size,1);
  const contains=query.length>=4&&candidate.length>=4&&(query.includes(candidate)||candidate.includes(query));
  return Math.max(characterScore,(characterScore*0.75)+(tokenScore*0.25),contains?0.9:0);
};

const bestMatch=<T>(query:string,items:T[],aliases:(item:T)=>string[],identity:(item:T)=>string,threshold:number):T=>{
  const normalized=normalizeName(query);
  if(!normalized)throw new DomainError('Informe um nome para a consulta.');
  const candidates=new Map<string,{item:T;score:number}>();
  for(const item of items){
    const score=Math.max(0,...aliases(item).map(alias=>nameScore(normalized,normalizeName(alias))));
    const key=identity(item);
    const current=candidates.get(key);
    if(!current||score>current.score)candidates.set(key,{item,score});
  }
  const ranked=[...candidates.values()].sort((left,right)=>right.score-left.score);
  const best=ranked[0];
  if(!best||best.score<threshold)throw new DomainError(`Não encontrei “${query}” no acervo.`);
  const second=ranked[1];
  if(second&&second.score>=threshold&&best.score-second.score<0.04){
    throw new DomainError(`“${query}” é ambíguo no acervo. Informe um nome mais completo.`);
  }
  return best.item;
};

export const resolveTeam=async(db:D1Database,value:unknown):Promise<string>=>{
  const query=String(value??'').trim();
  const normalized=normalizeName(query);
  const exact=await db.prepare('SELECT team_name FROM team_aliases WHERE normalized_alias = ? LIMIT 1').bind(normalized).first<{team_name:string}>();
  if(exact)return exact.team_name;
  const {results}=await db.prepare('SELECT alias, team_name FROM team_aliases').all<{alias:string;team_name:string}>();
  return bestMatch(query,results,item=>[item.alias,item.team_name],item=>item.team_name,0.67).team_name;
};

export const resolveReferee=async(db:D1Database,value:unknown):Promise<string>=>{
  const query=String(value??'').trim();
  const normalized=normalizeName(query);
  const exact=await db.prepare('SELECT name FROM referees WHERE normalized_name = ? LIMIT 1').bind(normalized).first<{name:string}>();
  if(exact)return exact.name;
  const {results}=await db.prepare('SELECT name FROM referees').all<{name:string}>();
  return bestMatch(query,results,item=>[item.name],item=>item.name,0.72).name;
};

interface PlayerLookup {
  id:string;
  name:string;
  full_name:string;
  aliases_json:string;
}

interface PlayerAliasLookup extends PlayerLookup {
  alias:string;
}

export const resolvePlayer=async(db:D1Database,value:unknown):Promise<PlayerLookup>=>{
  const query=String(value??'').trim();
  const normalized=normalizeName(query);
  const exact=await db.prepare(`
    SELECT players.id, players.name, players.full_name, players.aliases_json, player_aliases.alias
    FROM player_aliases
    JOIN players ON players.id = player_aliases.player_id
    WHERE player_aliases.normalized_alias = ?
  `).bind(normalized).all<PlayerAliasLookup>();
  if(exact.results.length===1)return exact.results[0];
  if(exact.results.length>1)throw new DomainError(`“${query}” corresponde a mais de um jogador. Informe o nome completo.`);
  const {results}=await db.prepare(`
    SELECT players.id, players.name, players.full_name, players.aliases_json, player_aliases.alias
    FROM player_aliases
    JOIN players ON players.id = player_aliases.player_id
  `).all<PlayerAliasLookup>();
  return bestMatch(query,results,item=>[item.alias,item.name,item.full_name],item=>item.id,0.78);
};

export const safeJson=<T>(value:string|undefined,fallback:T):T=>{
  try{return value?JSON.parse(value) as T:fallback;}catch{return fallback;}
};

export const integer=(value:unknown,options:{min:number;max:number;fallback:number}):number=>{
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return options.fallback;
  return Math.max(options.min,Math.min(options.max,Math.trunc(parsed)));
};

export const optionalSeason=(value:unknown):number|undefined=>{
  if(value===undefined||value===null||value==='')return undefined;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<1900||parsed>2100)throw new DomainError('Informe um ano de temporada válido.');
  return parsed;
};

export interface SeasonPeriodInput {
  temporada?:unknown;
  temporada_inicio?:unknown;
  temporada_fim?:unknown;
  ultimas_temporadas?:unknown;
}

export interface SeasonPeriod {
  start:number|undefined;
  end:number|undefined;
  label:string;
}

interface SeasonBoundsRow {
  min_season:number|null;
  max_season:number|null;
}

export interface SeasonBounds {
  first:number;
  last:number;
  label:string;
}

const hasPeriodValue=(value:unknown):boolean=>value!==undefined&&value!==null&&value!=='';

const boundedSeasonPeriod=(start:number,end:number):SeasonPeriod=>({
  start,
  end,
  label:start===end?String(start):`${start}–${end}`
});

export const readSeasonBounds=async(db:D1Database):Promise<SeasonBounds>=>{
  const row=await db.prepare('SELECT MIN(season) AS min_season, MAX(season) AS max_season FROM matches').first<SeasonBoundsRow>();
  if(!row||row.min_season===null||row.max_season===null){
    throw new DomainError('Não há temporadas disponíveis no acervo.');
  }
  const first=Number(row.min_season);
  const last=Number(row.max_season);
  if(!Number.isInteger(first)||!Number.isInteger(last)||first>last){
    throw new DomainError('Não há temporadas disponíveis no acervo.');
  }
  return {first,last,label:boundedSeasonPeriod(first,last).label};
};

const seasonInBounds=(value:unknown,bounds:SeasonBounds):number=>{
  const season=optionalSeason(value);
  if(season===undefined)throw new DomainError('Informe a temporada da consulta.');
  if(season<bounds.first||season>bounds.last){
    throw new DomainError(`A temporada deve estar entre ${bounds.first} e ${bounds.last}.`);
  }
  return season;
};

export const resolveSeasonPeriod=async(db:D1Database,input:SeasonPeriodInput):Promise<SeasonPeriod>=>{
  const hasSeason=hasPeriodValue(input.temporada);
  const hasStart=hasPeriodValue(input.temporada_inicio);
  const hasEnd=hasPeriodValue(input.temporada_fim);
  const hasLatest=hasPeriodValue(input.ultimas_temporadas);

  const selectedModes=Number(hasSeason)+Number(hasStart||hasEnd)+Number(hasLatest);
  if(selectedModes>1){
    throw new DomainError('Use apenas um recorte: temporada, intervalo ou últimas temporadas.');
  }

  if((hasStart||hasEnd)&&(!hasStart||!hasEnd)){
    throw new DomainError('Para consultar um intervalo, informe temporada_inicio e temporada_fim.');
  }

  const bounds=await readSeasonBounds(db);

  if(hasSeason){
    const season=seasonInBounds(input.temporada,bounds);
    return boundedSeasonPeriod(season,season);
  }

  if(hasStart||hasEnd){
    const start=seasonInBounds(input.temporada_inicio,bounds);
    const end=seasonInBounds(input.temporada_fim,bounds);
    if(start>end)throw new DomainError('A temporada inicial não pode ser posterior à temporada final.');
    return boundedSeasonPeriod(start,end);
  }

  if(hasLatest){
    const count=Number(input.ultimas_temporadas);
    const availableSeasons=bounds.last-bounds.first+1;
    if(!Number.isInteger(count)||count<1||count>availableSeasons){
      throw new DomainError(`A quantidade de últimas temporadas deve estar entre 1 e ${availableSeasons}.`);
    }
    return boundedSeasonPeriod(bounds.last-count+1,bounds.last);
  }

  return {start:undefined,end:undefined,label:bounds.label};
};

export const matchSource=(row:Pick<MatchRow,'id'|'home_team'|'away_team'|'display_date'|'season'>):Source=>({
  id:row.id,
  title:`${row.home_team} × ${row.away_team}`,
  date:row.display_date,
  year:row.season
});

const eventTypeLabel:Record<MatchEvent['type'],'amarelo'|'segundo_amarelo'|'vermelho_direto'>={
  A:'amarelo',
  V2:'segundo_amarelo',
  VD:'vermelho_direto'
};

export const publicMatch=(row:MatchRow,includeEvents=true)=>({
  id:row.id,
  temporada:row.season,
  data:row.display_date,
  mandante:row.home_team,
  visitante:row.away_team,
  arbitro:row.referee,
  teve_var:Boolean(row.has_var),
  cartoes:{
    total:row.total_cards,
    amarelos:row.yellow_cards,
    segundos_amarelos:row.second_yellow_cards,
    vermelhos_diretos:row.direct_red_cards,
    vermelhos:row.red_cards
  },
  por_time:[
    {
      time:row.home_team,
      amarelos:row.home_yellow_cards,
      vermelhos:row.home_red_cards,
      total:row.home_yellow_cards+row.home_red_cards
    },
    {
      time:row.away_team,
      amarelos:row.away_yellow_cards,
      vermelhos:row.away_red_cards,
      total:row.away_yellow_cards+row.away_red_cards
    }
  ],
  ...(includeEvents?{
    eventos:safeJson<MatchEvent[]>(row.events_json,[]).map(event=>({
      ordem:event.ordinal,
      jogador:event.player,
      time:event.team,
      tipo:eventTypeLabel[event.type],
      justificativa:event.reason,
      categorias:event.tags,
      momento:event.timing
    }))
  }:{})
});

export const uniqueSources=(sources:Source[],limit=8):Source[]=>{
  const found=new Map<string,Source>();
  for(const source of sources)if(!found.has(source.id))found.set(source.id,source);
  return [...found.values()].slice(0,limit);
};
