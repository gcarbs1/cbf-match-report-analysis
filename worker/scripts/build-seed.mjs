import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
const workerDirectory=path.resolve(scriptDirectory,'..');
const repositoryDirectory=path.resolve(workerDirectory,'..');
const html=fs.readFileSync(path.join(repositoryDirectory,'index.html'),'utf8');
const outputDirectory=path.join(workerDirectory,'generated');

const readDataset=id=>{
  const match=html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
  if(!match)throw new Error(`Dataset ${id} not found in index.html`);
  return JSON.parse(match[1]);
};
const quote=value=>`'${String(value??'').replaceAll("'","''")}'`;
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isoDate=value=>{
  const [day,month,year]=String(value).split('/');
  return `${year}-${month}-${day}`;
};
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');

const matches=readDataset('match-data');
const players=readDataset('player-data');
const varData=readDataset('var-data');
const siteData=readDataset('site-data');
const playerAliases=JSON.parse(fs.readFileSync(path.join(workerDirectory,'config','player-aliases.json'),'utf8'));
const varMatches=new Set(varData.matches_with_var);
const seasons=matches.map(match=>Number(match.year)).filter(Number.isInteger);
if(!seasons.length)throw new Error('Match dataset has no valid seasons');
const minSeason=Math.min(...seasons);
const maxSeason=Math.max(...seasons);
const teams=[...new Set(matches.flatMap(match=>[match.home,match.away]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const referees=[...new Set(matches.map(match=>match.ref))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const aliases={
  'América-MG':['America MG','America Mineiro'],
  'Athletico-PR':['Athletico PR','Athletico Paranaense','Atletico PR','Atletico Paranaense'],
  'Atlético-GO':['Atletico GO','Atletico Goianiense'],
  'Atlético-MG':['Atletico MG','Atletico Mineiro'],
  'Red Bull Bragantino':['Bragantino','RB Bragantino','Red Bull'],
  'Vasco':['Vasco da Gama']
};
const statements=['PRAGMA foreign_keys = ON;'];
const cardEventStatements=['PRAGMA foreign_keys = ON;','DELETE FROM card_events;'];
const playerAliasStatements=['PRAGMA foreign_keys = ON;'];
for(const team of teams){
  statements.push(`INSERT INTO teams(name, normalized_name) VALUES(${quote(team)}, ${quote(normalize(team))});`);
  for(const alias of new Set([team,...(aliases[team]||[])]))statements.push(`INSERT OR IGNORE INTO team_aliases(alias, normalized_alias, team_name) VALUES(${quote(alias)}, ${quote(normalize(alias))}, ${quote(team)});`);
}
for(const referee of referees)statements.push(`INSERT INTO referees(name, normalized_name) VALUES(${quote(referee)}, ${quote(normalize(referee))});`);
for(const match of matches){
  const events=match.events.map((event,index)=>({
    ordinal:index+1,
    player:event[0],
    team:event[1],
    type:event[2],
    reason:event[3],
    tags:event[4]||[],
    timing:event[5]
  }));
  const count=(type,team)=>events.filter(event=>event.type===type&&(!team||event.team===team)).length;
  const reds=team=>events.filter(event=>['V2','VD'].includes(event.type)&&(!team||event.team===team)).length;
  statements.push(`INSERT INTO matches(id, season, match_date, display_date, home_team, away_team, referee, has_var, total_cards, yellow_cards, second_yellow_cards, direct_red_cards, red_cards, home_yellow_cards, home_red_cards, away_yellow_cards, away_red_cards, events_json) VALUES(${quote(match.id)}, ${Number(match.year)}, ${quote(isoDate(match.date))}, ${quote(match.date)}, ${quote(match.home)}, ${quote(match.away)}, ${quote(match.ref)}, ${varMatches.has(match.id)?1:0}, ${events.length}, ${count('A')}, ${count('V2')}, ${count('VD')}, ${reds()}, ${count('A',match.home)}, ${reds(match.home)}, ${count('A',match.away)}, ${reds(match.away)}, ${quote(json(events))});`);
  for(const event of events){
    const statement=`INSERT INTO card_events(match_id, ordinal, player, team, card_type, reason, tags_json, timing) VALUES(${quote(match.id)}, ${event.ordinal}, ${quote(event.player)}, ${quote(event.team)}, ${quote(event.type)}, ${quote(event.reason)}, ${quote(json(event.tags))}, ${quote(event.timing)});`;
    statements.push(statement);
    cardEventStatements.push(statement);
  }
}
for(const player of players){
  const allAliases=[...new Set([player.name,player.full_name,...(player.aliases||[]),...(playerAliases[player.id]||[])])];
  statements.push(`INSERT INTO players(id, name, full_name, normalized_name, appearances, card_games, cards, yellow, second_yellow, direct_red, red, aliases_json, teams_json, tags_json) VALUES(${quote(player.id)}, ${quote(player.name)}, ${quote(player.full_name)}, ${quote(normalize(player.name))}, ${Number(player.appearances||0)}, ${Number(player.card_games||0)}, ${Number(player.cards||0)}, ${Number(player.yellow||0)}, ${Number(player.second_yellow||0)}, ${Number(player.direct_red||0)}, ${Number(player.red||0)}, ${quote(json(allAliases))}, ${quote(json(player.teams||[]))}, ${quote(json(player.tags||[]))});`);
  for(const alias of allAliases){
    const statement=`INSERT OR IGNORE INTO player_aliases(alias, normalized_alias, player_id) VALUES(${quote(alias)}, ${quote(normalize(alias))}, ${quote(player.id)});`;
    statements.push(statement);
    playerAliasStatements.push(statement);
  }
}
const metadata={
  matches:String(matches.length),events:String(matches.reduce((sum,match)=>sum+match.events.length,0)),
  players:String(players.length),latest_match_date:siteData.manifest.latest_match_date||'',
  min_season:String(minSeason),max_season:String(maxSeason),period_label:`${minSeason}–${maxSeason}`
};
for(const [key,value] of Object.entries(metadata))statements.push(`INSERT INTO dataset_metadata(key, value) VALUES(${quote(key)}, ${quote(value)});`);
fs.mkdirSync(outputDirectory,{recursive:true});
const outputPath=path.join(outputDirectory,'seed.sql');
const cardEventsOutputPath=path.join(outputDirectory,'seed-events.sql');
const playerAliasesOutputPath=path.join(outputDirectory,'seed-player-aliases.sql');
fs.writeFileSync(outputPath,statements.join('\n')+'\n');
fs.writeFileSync(cardEventsOutputPath,cardEventStatements.join('\n')+'\n');
fs.writeFileSync(playerAliasesOutputPath,playerAliasStatements.join('\n')+'\n');
console.log(JSON.stringify({
  outputs:{
    full:{path:outputPath,statements:statements.length,bytes:fs.statSync(outputPath).size},
    events:{path:cardEventsOutputPath,statements:cardEventStatements.length,bytes:fs.statSync(cardEventsOutputPath).size},
    playerAliases:{path:playerAliasesOutputPath,statements:playerAliasStatements.length,bytes:fs.statSync(playerAliasesOutputPath).size}
  },
  matches:matches.length,
  events:Number(metadata.events),
  players:players.length
},null,2));
