import {DomainError,integer,matchSource,MAX_SEASON,MIN_SEASON,optionalSeason,PERIOD_LABEL,publicMatch,resolvePlayer,resolveReferee,resolveTeam,safeJson,uniqueSources} from './domain';
import type {AiToolDefinition,JsonObject,MatchEvent,MatchRow,Source,ToolExecution} from './types';

const objectSchema=(properties:JsonObject,required:string[]=[]):JsonObject=>({
  type:'object',properties,required,additionalProperties:false
});
const seasonParameter=(description=`Ano da temporada entre ${MIN_SEASON} e ${MAX_SEASON}.`):JsonObject=>({
  type:'integer',minimum:MIN_SEASON,maximum:MAX_SEASON,description
});
const limitParameter=(description:string):JsonObject=>({type:'integer',minimum:1,maximum:10,description});

export const TOOL_DEFINITIONS:AiToolDefinition[]=[
  {
    type:'function',
    function:{
      name:'buscar_partidas',
      description:'Busca partidas de um time ou confrontos entre dois times. Use também para descobrir árbitro, cartões, jogadores punidos ou detalhes de um confronto. Tolera nomes aproximados e erros de digitação.',
      parameters:objectSchema({
        time_1:{type:'string',description:'Primeiro time citado pelo usuário.'},
        time_2:{type:'string',description:'Segundo time, quando a pergunta for sobre um confronto.'},
        temporada:seasonParameter(),
        data:{type:'string',pattern:'^\\d{2}/\\d{2}/\\d{4}$',description:'Data exata no formato DD/MM/AAAA, se mencionada.'},
        limite:limitParameter('Quantidade máxima de partidas.')
      },['time_1'])
    }
  },
  {
    type:'function',
    function:{
      name:'comparar_times',
      description:'Calcula jogos, cartões totais, amarelos, vermelhos e médias por jogo para um ou mais times. Use para comparação, estatística ou resumo disciplinar de time.',
      parameters:objectSchema({
        times:{type:'array',items:{type:'string'},minItems:1,maxItems:5,description:'Times a analisar ou comparar.'},
        temporada:seasonParameter('Ano da temporada. Omitir para o acervo completo.')
      },['times'])
    }
  },
  {
    type:'function',
    function:{
      name:'ranquear_times',
      description:'Ranqua todos os times por cartões totais, amarelos, vermelhos ou média por jogo, com filtro opcional de temporada.',
      parameters:objectSchema({
        metrica:{type:'string',enum:['cartoes','amarelos','vermelhos','media'],description:'Métrica usada na ordenação.'},
        temporada:seasonParameter(),
        minimo_partidas:{type:'integer',minimum:1,maximum:50,description:'Mínimo de partidas para entrar no ranking.'},
        limite:limitParameter('Quantidade de times no ranking.')
      },['metrica'])
    }
  },
  {
    type:'function',
    function:{
      name:'ranquear_partidas',
      description:'Encontra partidas com mais cartões totais, amarelos ou vermelhos, no acervo inteiro ou filtradas por temporada e time.',
      parameters:objectSchema({
        metrica:{type:'string',enum:['cartoes','amarelos','vermelhos'],description:'Métrica usada na ordenação.'},
        temporada:seasonParameter(),
        time:{type:'string',description:'Time opcional para limitar o ranking.'},
        limite:limitParameter('Quantidade de posições no ranking.')
      },['metrica'])
    }
  },
  {
    type:'function',
    function:{
      name:'perfil_arbitro',
      description:'Analisa um árbitro: partidas apitadas, cartões, média, VAR e categorias disciplinares mais recorrentes.',
      parameters:objectSchema({
        arbitro:{type:'string',description:'Nome do árbitro, mesmo que aproximado.'},
        temporada:seasonParameter()
      },['arbitro'])
    }
  },
  {
    type:'function',
    function:{
      name:'ranquear_arbitros',
      description:'Ranqua árbitros por total ou média de cartões distribuídos, com filtro opcional de temporada.',
      parameters:objectSchema({
        criterio:{type:'string',enum:['total','media'],description:'Critério de ordenação.'},
        temporada:seasonParameter(),
        minimo_partidas:{type:'integer',minimum:1,maximum:50,description:'Mínimo de jogos para entrar no ranking. Recomendado 5 para médias.'},
        limite:limitParameter('Quantidade de árbitros no ranking.')
      },['criterio'])
    }
  },
  {
    type:'function',
    function:{
      name:'perfil_jogador',
      description:'Consulta o perfil disciplinar consolidado de um jogador: aparições, cartões, times e categorias.',
      parameters:objectSchema({
        jogador:{type:'string',description:'Nome ou apelido do jogador, mesmo que aproximado.'}
      },['jogador'])
    }
  },
  {
    type:'function',
    function:{
      name:'ranquear_jogadores',
      description:'Ranqua jogadores por cartões totais, amarelos ou vermelhos no período completo. Pode filtrar pelo time em que atuaram.',
      parameters:objectSchema({
        metrica:{type:'string',enum:['cartoes','amarelos','vermelhos'],description:'Métrica usada na ordenação.'},
        time:{type:'string',description:'Time opcional.'},
        limite:limitParameter('Quantidade de jogadores no ranking.')
      },['metrica'])
    }
  }
];

const argsObject=(value:unknown):JsonObject=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:{};
const textArg=(args:JsonObject,key:string):string=>String(args[key]??'').trim();

const findMatches=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const first=await resolveTeam(db,args.time_1);
  const second=args.time_2?await resolveTeam(db,args.time_2):undefined;
  const season=optionalSeason(args.temporada);
  const limit=integer(args.limite,{min:1,max:10,fallback:6});
  const conditions:string[]=[];
  const bindings:unknown[]=[];
  if(second){
    conditions.push('((home_team = ? AND away_team = ?) OR (home_team = ? AND away_team = ?))');
    bindings.push(first,second,second,first);
  }else{
    conditions.push('(home_team = ? OR away_team = ?)');
    bindings.push(first,first);
  }
  if(season){conditions.push('season = ?');bindings.push(season);}
  const date=textArg(args,'data');
  if(date){
    if(!/^\d{2}\/\d{2}\/\d{4}$/.test(date))throw new DomainError('A data deve estar no formato DD/MM/AAAA.');
    conditions.push('display_date = ?');bindings.push(date);
  }
  const query=`SELECT * FROM matches WHERE ${conditions.join(' AND ')} ORDER BY match_date DESC LIMIT ?`;
  const {results}=await db.prepare(query).bind(...bindings,limit).all<MatchRow>();
  return {
    name:'buscar_partidas',
    data:{
      consulta:{time_1:first,...(second?{time_2:second}:{}),...(season?{temporada:season}:{}),...(date?{data:date}:{})},
      quantidade:results.length,
      partidas:results.map(row=>publicMatch(row,true))
    },
    sources:results.map(matchSource)
  };
};

interface TeamStatsRow {
  games:number;
  yellow:number;
  red:number;
}

const teamStats=async(db:D1Database,team:string,season?:number)=>{
  const seasonSql=season?' AND season = ?':'';
  const bindings:unknown[]=[team,team,team,team];
  if(season)bindings.push(season);
  const row=await db.prepare(`
    SELECT
      COUNT(*) AS games,
      COALESCE(SUM(CASE WHEN home_team = ? THEN home_yellow_cards ELSE away_yellow_cards END), 0) AS yellow,
      COALESCE(SUM(CASE WHEN home_team = ? THEN home_red_cards ELSE away_red_cards END), 0) AS red
    FROM matches
    WHERE (home_team = ? OR away_team = ?)${seasonSql}
  `).bind(...bindings).first<TeamStatsRow>();
  const games=Number(row?.games??0);
  const yellow=Number(row?.yellow??0);
  const red=Number(row?.red??0);
  const cards=yellow+red;
  return {
    time:team,
    partidas:games,
    cartoes:cards,
    amarelos:yellow,
    vermelhos:red,
    cartoes_por_jogo:games?Number((cards/games).toFixed(2)):0,
    amarelos_por_jogo:games?Number((yellow/games).toFixed(2)):0,
    vermelhos_por_jogo:games?Number((red/games).toFixed(2)):0
  };
};

const comparisonSources=async(db:D1Database,teams:string[],season?:number):Promise<Source[]>=>{
  const placeholders=teams.map(()=>'?').join(',');
  const seasonSql=season?' AND season = ?':'';
  const bindings:unknown[]=[...teams,...teams];
  if(season)bindings.push(season);
  const {results}=await db.prepare(`
    SELECT * FROM matches
    WHERE (home_team IN (${placeholders}) OR away_team IN (${placeholders}))${seasonSql}
    ORDER BY match_date DESC
    LIMIT 8
  `).bind(...bindings).all<MatchRow>();
  return results.map(matchSource);
};

const compareTeams=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const requested=Array.isArray(args.times)?args.times.slice(0,5):[];
  if(!requested.length)throw new DomainError('Informe ao menos um time.');
  const teams:string[]=[];
  for(const value of requested){
    const resolved=await resolveTeam(db,value);
    if(!teams.includes(resolved))teams.push(resolved);
  }
  const season=optionalSeason(args.temporada);
  const rows=[];
  for(const team of teams)rows.push(await teamStats(db,team,season));
  return {
    name:'comparar_times',
    data:{periodo:season?String(season):PERIOD_LABEL,times:rows},
    sources:await comparisonSources(db,teams,season)
  };
};

interface TeamRankingRow {
  team:string;
  games:number;
  cards:number;
  yellow:number;
  red:number;
  average:number;
}

const rankTeams=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const metric=textArg(args,'metrica');
  const orderBy:Record<string,string>={
    cartoes:'cards DESC, average DESC',
    amarelos:'yellow DESC, cards DESC',
    vermelhos:'red DESC, cards DESC',
    media:'average DESC, cards DESC'
  };
  const order=orderBy[metric];
  if(!order)throw new DomainError('Métrica inválida para o ranking de times.');
  const season=optionalSeason(args.temporada);
  const minimum=integer(args.minimo_partidas,{min:1,max:50,fallback:metric==='media'?5:1});
  const limit=integer(args.limite,{min:1,max:10,fallback:5});
  const seasonSql=season?'WHERE season = ?':'';
  const bindings:unknown[]=season?[season]:[];
  const {results}=await db.prepare(`
    WITH team_matches AS (
      SELECT season, home_team AS team, home_yellow_cards AS yellow, home_red_cards AS red FROM matches
      UNION ALL
      SELECT season, away_team AS team, away_yellow_cards AS yellow, away_red_cards AS red FROM matches
    )
    SELECT team, COUNT(*) AS games, SUM(yellow + red) AS cards, SUM(yellow) AS yellow,
      SUM(red) AS red, ROUND(AVG(yellow + red), 2) AS average
    FROM team_matches ${seasonSql}
    GROUP BY team
    HAVING COUNT(*) >= ?
    ORDER BY ${order}
    LIMIT ?
  `).bind(...bindings,minimum,limit).all<TeamRankingRow>();
  const teams=results.map(row=>row.team);
  return {
    name:'ranquear_times',
    data:{
      metrica:metric,
      periodo:season?String(season):PERIOD_LABEL,
      minimo_partidas:minimum,
      times:results.map(row=>({
        time:row.team,
        partidas:Number(row.games),
        cartoes:Number(row.cards),
        amarelos:Number(row.yellow),
        vermelhos:Number(row.red),
        cartoes_por_jogo:Number(row.average)
      }))
    },
    sources:teams.length?await comparisonSources(db,teams,season):[]
  };
};

const rankMatches=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const metric=textArg(args,'metrica');
  const metricColumn:Record<string,string>={cartoes:'total_cards',amarelos:'yellow_cards',vermelhos:'red_cards'};
  const column=metricColumn[metric];
  if(!column)throw new DomainError('Métrica inválida para o ranking de partidas.');
  const season=optionalSeason(args.temporada);
  const team=args.time?await resolveTeam(db,args.time):undefined;
  const limit=integer(args.limite,{min:1,max:10,fallback:5});
  const conditions:string[]=[];
  const bindings:unknown[]=[];
  if(season){conditions.push('season = ?');bindings.push(season);}
  if(team){conditions.push('(home_team = ? OR away_team = ?)');bindings.push(team,team);}
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
  const {results}=await db.prepare(`SELECT * FROM matches ${where} ORDER BY ${column} DESC, total_cards DESC, match_date DESC LIMIT ?`).bind(...bindings,limit).all<MatchRow>();
  return {
    name:'ranquear_partidas',
    data:{metrica:metric,periodo:season?String(season):PERIOD_LABEL,...(team?{time:team}:{}),partidas:results.map(row=>publicMatch(row,false))},
    sources:results.map(matchSource)
  };
};

const refereeProfile=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const referee=await resolveReferee(db,args.arbitro);
  const season=optionalSeason(args.temporada);
  const seasonSql=season?' AND season = ?':'';
  const bindings:unknown[]=[referee];
  if(season)bindings.push(season);
  const {results}=await db.prepare(`SELECT * FROM matches WHERE referee = ?${seasonSql} ORDER BY match_date DESC`).bind(...bindings).all<MatchRow>();
  const tagCounts=new Map<string,number>();
  for(const row of results){
    for(const event of safeJson<MatchEvent[]>(row.events_json,[])){
      for(const tag of event.tags||[])tagCounts.set(tag,(tagCounts.get(tag)||0)+1);
    }
  }
  const total=results.reduce((sum,row)=>sum+Number(row.total_cards),0);
  const yellow=results.reduce((sum,row)=>sum+Number(row.yellow_cards),0);
  const red=results.reduce((sum,row)=>sum+Number(row.red_cards),0);
  const varGames=results.filter(row=>Boolean(row.has_var)).length;
  const categories=[...tagCounts.entries()].sort((left,right)=>right[1]-left[1]).slice(0,8).map(([categoria,ocorrencias])=>({categoria,ocorrencias}));
  const evidence=[...results].sort((left,right)=>right.total_cards-left.total_cards||right.match_date.localeCompare(left.match_date)).slice(0,6);
  return {
    name:'perfil_arbitro',
    data:{
      arbitro:referee,
      periodo:season?String(season):PERIOD_LABEL,
      partidas:results.length,
      cartoes:total,
      amarelos:yellow,
      vermelhos:red,
      cartoes_por_jogo:results.length?Number((total/results.length).toFixed(2)):0,
      partidas_com_var:varGames,
      percentual_com_var:results.length?Number(((varGames/results.length)*100).toFixed(1)):0,
      categorias_recorrentes:categories,
      partidas_de_referencia:evidence.map(row=>publicMatch(row,false))
    },
    sources:evidence.map(matchSource)
  };
};

interface RefereeRankingRow {
  referee:string;
  games:number;
  cards:number;
  yellow:number;
  red:number;
  average:number;
}

const rankReferees=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const criterion=textArg(args,'criterio');
  if(!['total','media'].includes(criterion))throw new DomainError('Critério inválido para o ranking de árbitros.');
  const season=optionalSeason(args.temporada);
  const minimum=integer(args.minimo_partidas,{min:1,max:50,fallback:criterion==='media'?5:1});
  const limit=integer(args.limite,{min:1,max:10,fallback:5});
  const seasonSql=season?'WHERE season = ?':'';
  const bindings:unknown[]=season?[season]:[];
  const order=criterion==='media'?'average DESC, cards DESC':'cards DESC, average DESC';
  const {results}=await db.prepare(`
    SELECT referee, COUNT(*) AS games, SUM(total_cards) AS cards, SUM(yellow_cards) AS yellow,
      SUM(red_cards) AS red, ROUND(AVG(total_cards), 2) AS average
    FROM matches ${seasonSql}
    GROUP BY referee
    HAVING COUNT(*) >= ?
    ORDER BY ${order}
    LIMIT ?
  `).bind(...bindings,minimum,limit).all<RefereeRankingRow>();
  const refereeNames=results.map(row=>row.referee);
  let sources:Source[]=[];
  if(refereeNames.length){
    const placeholders=refereeNames.map(()=>'?').join(',');
    const sourceSeasonSql=season?' AND season = ?':'';
    const sourceBindings:unknown[]=[...refereeNames];
    if(season)sourceBindings.push(season);
    const evidence=await db.prepare(`SELECT * FROM matches WHERE referee IN (${placeholders})${sourceSeasonSql} ORDER BY total_cards DESC, match_date DESC LIMIT 8`).bind(...sourceBindings).all<MatchRow>();
    sources=evidence.results.map(matchSource);
  }
  return {
    name:'ranquear_arbitros',
    data:{criterio:criterion,periodo:season?String(season):PERIOD_LABEL,minimo_partidas:minimum,arbitros:results.map(row=>({arbitro:row.referee,partidas:Number(row.games),cartoes:Number(row.cards),amarelos:Number(row.yellow),vermelhos:Number(row.red),cartoes_por_jogo:Number(row.average)}))},
    sources
  };
};

interface PlayerRow {
  id:string;
  name:string;
  full_name:string;
  appearances:number;
  card_games:number;
  cards:number;
  yellow:number;
  second_yellow:number;
  direct_red:number;
  red:number;
  aliases_json:string;
  teams_json:string;
  tags_json:string;
}

const playerProfile=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const lookup=await resolvePlayer(db,args.jogador);
  const player=await db.prepare('SELECT * FROM players WHERE id = ? LIMIT 1').bind(lookup.id).first<PlayerRow>();
  if(!player)throw new DomainError(`Não encontrei “${textArg(args,'jogador')}” no acervo.`);
  const playerTeams=safeJson<string[]>(player.teams_json,[]);
  const teamPlaceholders=playerTeams.map(()=>'?').join(',');
  const teamFilter=teamPlaceholders?` AND card_events.team IN (${teamPlaceholders})`:'';
  const evidence=await db.prepare(`
    SELECT DISTINCT matches.*
    FROM matches
    JOIN card_events ON card_events.match_id = matches.id
    WHERE card_events.player = ?${teamFilter}
    ORDER BY matches.match_date DESC
    LIMIT 6
  `).bind(player.full_name,...playerTeams).all<MatchRow>();
  const tags=safeJson<Array<[string,number,number,number]>>(player.tags_json,[]).slice(0,10).map(tag=>({categoria:tag[0],total:tag[1],amarelos:tag[2],vermelhos:tag[3]}));
  return {
    name:'perfil_jogador',
    data:{
      jogador:player.name,
      nome_completo:player.full_name,
      times:playerTeams,
      aparicoes:Number(player.appearances),
      partidas_com_cartao:Number(player.card_games),
      cartoes:Number(player.cards),
      amarelos:Number(player.yellow),
      segundos_amarelos:Number(player.second_yellow),
      vermelhos_diretos:Number(player.direct_red),
      vermelhos:Number(player.red),
      categorias:tags
    },
    sources:evidence.results.map(matchSource)
  };
};

interface PlayerRankingRow {
  id:string;
  name:string;
  full_name:string;
  teams_json:string;
  card_games:number;
  cards:number;
  yellow:number;
  red:number;
}

const playerRankingSources=async(db:D1Database,players:PlayerRankingRow[],team?:string):Promise<Source[]>=>{
  if(!players.length)return [];
  const placeholders=players.map(()=>'?').join(',');
  const teamSql=team?' AND card_events.team = ?':'';
  const bindings:unknown[]=[...players.map(player=>player.full_name)];
  if(team)bindings.push(team);
  const {results}=await db.prepare(`
    SELECT DISTINCT matches.*
    FROM matches
    JOIN card_events ON card_events.match_id = matches.id
    WHERE card_events.player IN (${placeholders})${teamSql}
    ORDER BY matches.total_cards DESC, matches.match_date DESC
    LIMIT 8
  `).bind(...bindings).all<MatchRow>();
  return results.map(matchSource);
};

const rankPlayers=async(db:D1Database,raw:unknown):Promise<ToolExecution>=>{
  const args=argsObject(raw);
  const metric=textArg(args,'metrica');
  const metricKey:Record<string,'cards'|'yellow'|'red'>={cartoes:'cards',amarelos:'yellow',vermelhos:'red'};
  const key=metricKey[metric];
  if(!key)throw new DomainError('Métrica inválida para o ranking de jogadores.');
  const team=args.time?await resolveTeam(db,args.time):undefined;
  const limit=integer(args.limite,{min:1,max:10,fallback:5});
  let ranked:PlayerRankingRow[];
  if(team){
    const {results}=await db.prepare(`
      SELECT players.id, players.name, players.full_name, players.teams_json,
        COUNT(DISTINCT card_events.match_id) AS card_games,
        COUNT(*) AS cards,
        SUM(CASE WHEN card_events.card_type = 'A' THEN 1 ELSE 0 END) AS yellow,
        SUM(CASE WHEN card_events.card_type IN ('V2', 'VD') THEN 1 ELSE 0 END) AS red
      FROM card_events
      JOIN players ON players.full_name = card_events.player
        AND EXISTS (SELECT 1 FROM json_each(players.teams_json) WHERE value = card_events.team)
      WHERE card_events.team = ?
      GROUP BY players.id, players.name, players.full_name, players.teams_json
      ORDER BY ${key} DESC, cards DESC, players.name ASC
      LIMIT ?
    `).bind(team,limit).all<PlayerRankingRow>();
    ranked=results;
  }else{
    const {results}=await db.prepare(`
      SELECT id, name, full_name, teams_json, card_games, cards, yellow, red
      FROM players
      ORDER BY ${key} DESC, cards DESC, name ASC
      LIMIT ?
    `).bind(limit).all<PlayerRankingRow>();
    ranked=results;
  }
  return {
    name:'ranquear_jogadores',
    data:{metrica:metric,periodo:PERIOD_LABEL,...(team?{time:team}:{}),jogadores:ranked.map(player=>({jogador:player.name,nome_completo:player.full_name,times:safeJson<string[]>(player.teams_json,[]),partidas_com_cartao:Number(player.card_games),cartoes:Number(player.cards),amarelos:Number(player.yellow),vermelhos:Number(player.red)}))},
    sources:await playerRankingSources(db,ranked,team)
  };
};

export const executeTool=async(db:D1Database,name:string,args:unknown):Promise<ToolExecution>=>{
  switch(name){
    case 'buscar_partidas':return findMatches(db,args);
    case 'comparar_times':return compareTeams(db,args);
    case 'ranquear_times':return rankTeams(db,args);
    case 'ranquear_partidas':return rankMatches(db,args);
    case 'perfil_arbitro':return refereeProfile(db,args);
    case 'ranquear_arbitros':return rankReferees(db,args);
    case 'perfil_jogador':return playerProfile(db,args);
    case 'ranquear_jogadores':return rankPlayers(db,args);
    default:throw new DomainError(`A ferramenta “${name}” não existe.`);
  }
};

export const mergeSources=(executions:ToolExecution[]):Source[]=>uniqueSources(executions.flatMap(execution=>execution.sources),8);
