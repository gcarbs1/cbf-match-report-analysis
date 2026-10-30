import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile=(url)=>ts.transpileModule(fs.readFileSync(url,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

const domainModule={exports:{}};
vm.runInNewContext(compile(new URL('../src/domain.ts',import.meta.url)),{
  module:domainModule,exports:domainModule.exports,console,Set,Map,JSON
});

const toolsModule={exports:{}};
vm.runInNewContext(compile(new URL('../src/tools.ts',import.meta.url)),{
  module:toolsModule,
  exports:toolsModule.exports,
  console,
  Set,
  Map,
  JSON,
  require(specifier){
    if(specifier==='./domain')return domainModule.exports;
    throw new Error(`Unexpected module: ${specifier}`);
  }
});

const {TOOL_DEFINITIONS,executeTool}=toolsModule.exports;

for(const toolName of ['perfil_jogador','ranquear_jogadores']){
  const definition=TOOL_DEFINITIONS.find(tool=>tool.function.name===toolName);
  for(const field of ['temporada','temporada_inicio','temporada_fim','ultimas_temporadas']){
    assert.ok(definition.function.parameters.properties[field],`${toolName} is missing ${field}`);
  }
}

const player={
  id:'id:633571',
  name:'Gustavo Gomez',
  full_name:'Gustavo Raul Gomez Portillo',
  alias:'Gustavo Gomez',
  appearances:100,
  card_games:45,
  cards:51,
  yellow:48,
  second_yellow:1,
  direct_red:2,
  red:3,
  aliases_json:'["Gustavo Gomez","Gustavo Raul Gomez Portillo"]',
  teams_json:'["Palmeiras"]',
  period_teams:'Palmeiras',
  tags_json:'[]'
};

const profileCalls=[];
const profileDb={
  prepare(query){
    const call={query,bindings:[]};
    profileCalls.push(call);
    return {
      bind(...bindings){call.bindings=bindings;return this;},
      async first(){
        if(query.includes('SELECT * FROM players WHERE id'))return player;
        if(query.includes('MIN(season)'))return {min_season:2020,max_season:2026};
        if(query.includes('COUNT(DISTINCT card_events.match_id)'))return {card_games:8,cards:9,yellow:8,second_yellow:0,direct_red:1,red:1};
        return null;
      },
      async all(){
        if(query.includes('WHERE player_aliases.normalized_alias = ?'))return {results:[]};
        if(query.includes('FROM player_aliases'))return {results:[player]};
        if(query.includes('SELECT card_events.team AS team'))return {results:[{team:'Palmeiras'}]};
        if(query.includes('JOIN json_each(card_events.tags_json)'))return {results:[{categoria:'Reclamação',total:2,amarelos:2,vermelhos:0}]};
        return {results:[]};
      }
    };
  }
};

const profile=await executeTool(profileDb,'perfil_jogador',{
  jogador:'gustabo gomes',
  ultimas_temporadas:2
});
assert.equal(profile.data.periodo,'2025–2026');
assert.equal(profile.data.jogador,'Gustavo Gomez');
assert.equal(profile.data.cartoes,9);
assert.equal(profile.data.amarelos,8);
assert.equal(profile.data.vermelhos,1);
assert.deepEqual(Array.from(profile.data.times),['Palmeiras']);
const profileTotals=profileCalls.find(call=>call.query.includes('COUNT(DISTINCT card_events.match_id)'));
assert.match(profileTotals.query,/matches\.season BETWEEN \? AND \?/);
assert.deepEqual(profileTotals.bindings.slice(-2),[2025,2026]);

const rankingCalls=[];
const rankingDb={
  prepare(query){
    const call={query,bindings:[]};
    rankingCalls.push(call);
    return {
      bind(...bindings){call.bindings=bindings;return this;},
      async first(){
        if(query.includes('MIN(season)'))return {min_season:2020,max_season:2026};
        return null;
      },
      async all(){
        if(query.includes('GROUP BY players.id'))return {results:[player]};
        return {results:[]};
      }
    };
  }
};

const ranking=await executeTool(rankingDb,'ranquear_jogadores',{
  metrica:'amarelos',
  ultimas_temporadas:2
});
assert.equal(ranking.data.periodo,'2025–2026');
assert.equal(ranking.data.jogadores[0].jogador,'Gustavo Gomez');
assert.deepEqual(Array.from(ranking.data.jogadores[0].times),['Palmeiras']);
const rankingQuery=rankingCalls.find(call=>call.query.includes('GROUP BY players.id'));
assert.match(rankingQuery.query,/JOIN matches ON matches\.id = card_events\.match_id/);
assert.match(rankingQuery.query,/matches\.season BETWEEN \? AND \?/);
assert.match(rankingQuery.query,/GROUP_CONCAT\(DISTINCT card_events\.team\) AS period_teams/);
assert.deepEqual(rankingQuery.bindings,[2025,2026,5]);

console.log('Player period tests passed: profile and ranking use the latest two seasons from match events.');
