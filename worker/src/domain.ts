import type {MatchEvent,MatchRow,Source} from './types';

export const MIN_SEASON=2020;
export const MAX_SEASON=2026;
export const PERIOD_LABEL=`${MIN_SEASON}–${MAX_SEASON}`;

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

export const resolvePlayer=async(db:D1Database,value:unknown):Promise<PlayerLookup>=>{
  const query=String(value??'').trim();
  const normalized=normalizeName(query);
  const exact=await db.prepare('SELECT id, name, full_name, aliases_json FROM players WHERE normalized_name = ?').bind(normalized).all<PlayerLookup>();
  if(exact.results.length===1)return exact.results[0];
  if(exact.results.length>1)throw new DomainError(`“${query}” corresponde a mais de um jogador. Informe o nome completo.`);
  const {results}=await db.prepare('SELECT id, name, full_name, aliases_json FROM players').all<PlayerLookup>();
  return bestMatch(query,results,item=>{
    const aliases=safeJson<string[]>(item.aliases_json,[]);
    return [item.name,item.full_name,...aliases];
  },item=>item.id,0.78);
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
  if(!Number.isInteger(parsed)||parsed<MIN_SEASON||parsed>MAX_SEASON)throw new DomainError(`A temporada deve estar entre ${MIN_SEASON} e ${MAX_SEASON}.`);
  return parsed;
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
